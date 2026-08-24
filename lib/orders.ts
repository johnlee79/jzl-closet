import 'server-only';
import { assertWritten } from '@/lib/db-write';

import {
  ORDER_STATUSES,
  UNSHIPPED_STATUSES,
  isOrderStatus,
  isPaidStatus,
  isSalesStatus,
  isStockReleasing,
  statusLabel,
  mypageTabStatuses,
  NEEDS_CHECK_STATUSES,
  NEEDS_CHECK_TAB,
  UNSHIPPED_TAB,
  type OrderStatus,
} from '@/lib/order-status';
import {
  changePoints,
  earnPurchasePoints,
  getPointBalance,
  revokeOrderPoints,
} from '@/lib/points';
import { isCombinationAvailable } from '@/lib/product-utils';
import { markFirstPurchase, revertFirstPurchase } from '@/lib/referrals';
import { normalizeOptions } from '@/lib/products';
import {
  getPaymentSettings,
  getPointSettings,
  getShippingSettings,
} from '@/lib/settings';
import { isRemoteArea, maxUsablePoints, roundPointsToUnit } from '@/lib/site-config';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';
import { getBrands } from '@/lib/taxonomy';
import { notifyDiscountMismatch } from '@/lib/telegram';
import { brandLabel } from '@/lib/brands';
import type {
  CashReceiptType,
  CheckoutInput,
  DashboardStats,
  Order,
  OrderFilter,
  OrderItem,
  OrderStatusEntry,
  ProductRow,
} from '@/lib/types';

/**
 * 주문 저장·조회. 서버 전용입니다.
 *
 * ★ 이 파일이 지키는 두 가지
 *   1) 금액은 절대 클라이언트가 보낸 값을 쓰지 않습니다.
 *      상품 가격·옵션 추가금액·배송비를 여기서 다시 계산합니다.
 *   2) 상품명과 가격은 주문 시점 값을 order_items 에 복사해 둡니다.
 *      나중에 상품 가격이 바뀌어도 과거 주문 내역은 그대로입니다.
 */

const ORDERS = 'orders';
const ITEMS = 'order_items';
const HISTORY = 'order_status_history';

/** 테이블이 아직 없을 때 PostgREST 가 돌려주는 코드들 */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);
/** unique 제약 위반 */
const UNIQUE_VIOLATION = '23505';

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

/**
 * 아직 없는 칸을 건드렸을 때 오는 코드들.
 * ★ 42703 은 Postgres, PGRST204 는 PostgREST 가 스키마 캐시에서 못 찾았을 때입니다.
 *   schema-4b.sql 을 아직 안 돌린 환경에서도 주문이 막히지 않게 하려고 봅니다.
 */
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);

function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && MISSING_COLUMN_CODES.has(error.code));
}

function missingTableError(): Error {
  return new Error(
    '주문 테이블이 없습니다. supabase/schema-2a.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
  );
}

/* ------------------------------------------------------------------
 * DB row → 앱 타입
 * ------------------------------------------------------------------ */

type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  /** 회원 주문이면 auth.users.id. 비회원 주문은 null (2-B 에서 추가) */
  user_id?: string | null;
  orderer_name: string;
  orderer_phone: string;
  orderer_email: string | null;
  receiver_name: string;
  receiver_phone: string;
  postcode: string;
  address1: string;
  address2: string | null;
  delivery_memo: string | null;
  depositor_name: string | null;
  payment_method: string | null;
  items_total: number;
  shipping_fee: number;
  extra_shipping_fee: number | null;
  discount: number | null;
  total_amount: number;
  cash_receipt_type: string | null;
  cash_receipt_no: string | null;
  pg_provider: string | null;
  pg_tid: string | null;
  paid_at: string | null;
  /** 4-A 에서 추가한 컬럼. 아직 없을 수 있어 선택 항목으로 둡니다. */
  cash_receipt_issued?: boolean | null;
  cash_receipt_issued_at?: string | null;
  pg_auth_no?: string | null;
  pg_trade_at?: string | null;
  pg_amount?: number | null;
  pg_issuer_code?: string | null;
  pg_acquirer_code?: string | null;
  pg_installment?: number | null;
  pg_result_code?: string | null;
  pg_message?: string | null;
  cancel_requested_at?: string | null;
  cancel_done_at?: string | null;
  cancel_memo?: string | null;
  courier: string | null;
  tracking_no: string | null;
  admin_memo: string | null;
  /** 3-C 에서 추가한 컬럼. 아직 없을 수 있어 선택 항목으로 둡니다. */
  auto_cancel_excluded?: boolean | null;
  pg_comm_con_id?: string | null;
  stock_released_at?: string | null;
  sweep_notified_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_slug: string;
  product_name: string;
  brand_label: string | null;
  option_key: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  thumbnail_url: string | null;
  item_status: string | null;
};

type HistoryRow = {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  memo: string | null;
  created_at: string | null;
};

function toCashReceiptType(value: string | null): CashReceiptType {
  return value === 'personal' || value === 'business' ? value : 'none';
}

function rowToItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.product_id,
    productSlug: row.product_slug,
    productName: row.product_name,
    brandLabel: row.brand_label ?? '',
    optionKey: row.option_key ?? '',
    unitPrice: row.unit_price,
    quantity: row.quantity,
    lineTotal: row.line_total,
    thumbnailUrl: row.thumbnail_url ?? '',
    itemStatus: row.item_status === 'cancelled' ? 'cancelled' : 'normal',
  };
}

function rowToHistory(row: HistoryRow): OrderStatusEntry {
  return {
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    memo: row.memo ?? '',
    createdAt: row.created_at,
  };
}

function rowToOrder(
  row: OrderRow,
  items: OrderItem[] = [],
  history: OrderStatusEntry[] = []
): Order {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    userId: row.user_id ?? null,
    ordererName: row.orderer_name,
    ordererPhone: row.orderer_phone,
    ordererEmail: row.orderer_email ?? '',
    receiverName: row.receiver_name,
    receiverPhone: row.receiver_phone,
    postcode: row.postcode,
    address1: row.address1,
    address2: row.address2 ?? '',
    deliveryMemo: row.delivery_memo ?? '',
    depositorName: row.depositor_name ?? '',
    paymentMethod: row.payment_method ?? 'bank_transfer',
    itemsTotal: row.items_total,
    shippingFee: row.shipping_fee,
    extraShippingFee: row.extra_shipping_fee ?? 0,
    discount: row.discount ?? 0,
    totalAmount: row.total_amount,
    cashReceiptType: toCashReceiptType(row.cash_receipt_type),
    cashReceiptNo: row.cash_receipt_no ?? '',
    cashReceiptIssued: row.cash_receipt_issued === true,
    cashReceiptIssuedAt: row.cash_receipt_issued_at ?? null,
    pgProvider: row.pg_provider,
    pgTid: row.pg_tid,
    paidAt: row.paid_at,
    pgAuthNo: row.pg_auth_no ?? '',
    pgTradeAt: row.pg_trade_at ?? '',
    pgAmount: row.pg_amount ?? null,
    pgIssuerCode: row.pg_issuer_code ?? '',
    pgAcquirerCode: row.pg_acquirer_code ?? '',
    pgInstallment: row.pg_installment ?? null,
    pgResultCode: row.pg_result_code ?? '',
    pgMessage: row.pg_message ?? '',
    cancelRequestedAt: row.cancel_requested_at ?? null,
    cancelDoneAt: row.cancel_done_at ?? null,
    cancelMemo: row.cancel_memo ?? '',
    courier: row.courier ?? '',
    trackingNo: row.tracking_no ?? '',
    adminMemo: row.admin_memo ?? '',
    autoCancelExcluded: row.auto_cancel_excluded === true,
    /*
     * ★ 승인 재조회의 유일한 열쇠입니다. 거래번호(pgTid)와 다릅니다.
     *   4-B 에서 추가한 칸이라 아직 없을 수 있습니다.
     */
    pgCommConId: row.pg_comm_con_id ?? '',
    stockReleasedAt: row.stock_released_at ?? null,
    sweepNotifiedAt: row.sweep_notified_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    history,
  };
}

/* ------------------------------------------------------------------
 * 날짜 — 화면과 통계는 한국 시간 기준으로 셉니다.
 * ------------------------------------------------------------------ */

const KST_OFFSET = '+09:00';

/** 'yyyy-mm-dd' 하루의 시작 (KST) */
export function kstStart(day: string): string {
  return new Date(`${day}T00:00:00${KST_OFFSET}`).toISOString();
}

/** 'yyyy-mm-dd' 하루의 끝 (KST) */
export function kstEnd(day: string): string {
  return new Date(`${day}T23:59:59.999${KST_OFFSET}`).toISOString();
}

/** 지금 한국 날짜 'yyyy-mm-dd' */
export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** n일 전 한국 날짜 */
export function kstDaysAgo(days: number, now = new Date()): string {
  return kstToday(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

/* ------------------------------------------------------------------
 * 조회
 * ------------------------------------------------------------------ */

async function loadItems(orderIds: string[]): Promise<Map<string, OrderItem[]>> {
  const map = new Map<string, OrderItem[]>();
  if (orderIds.length === 0) return map;

  const supabase = getSupabaseAdmin();
  if (!supabase) return map;

  const { data, error } = await supabase
    .from(ITEMS)
    .select('*')
    .in('order_id', orderIds)
    .order('created_at', { ascending: true });

  if (error || !data) return map;
  for (const row of data as OrderItemRow[]) {
    const list = map.get(row.order_id) ?? [];
    list.push(rowToItem(row));
    map.set(row.order_id, list);
  }
  return map;
}

/**
 * 상태 조건을 조회에 겁니다. 건수와 목록이 같은 규칙을 쓰도록 한 곳에 둡니다.
 *
 * ★★ 두 가지는 상태 하나가 아니라 여러 상태를 함께 겁니다.
 *   확인 필요 — 승인확인실패·검토필요. 돈이 오갔는지 우리가 모르는 주문입니다.
 *   미출고    — 결제완료·상품준비중. 오늘 보내야 하는 주문입니다.
 *   둘 다 따로 눌러 봐야 하면 한쪽을 잊습니다.
 *
 * ★ 예전에는 이 분기가 건수 쪽과 목록 쪽에 따로 적혀 있었습니다.
 *   한쪽만 고치면 "건수는 5인데 목록은 2건" 이 됩니다. 한 함수로 모았습니다.
 */
function applyStatusFilter<T>(query: T, status: string | undefined): T {
  const q = query as unknown as {
    in: (column: string, values: string[]) => T;
    eq: (column: string, value: string) => T;
  };
  if (status === NEEDS_CHECK_TAB) return q.in('status', NEEDS_CHECK_STATUSES);
  if (status === UNSHIPPED_TAB) return q.in('status', UNSHIPPED_STATUSES);
  if (status && status !== 'all') return q.eq('status', status);
  return query;
}

/**
 * 조건에 맞는 주문 건수만 셉니다.
 *
 * ★ 평소에는 쓰지 않습니다. 목록 조회가 건수까지 함께 돌려주기 때문입니다.
 *   있는 것보다 뒤쪽 페이지를 요청해 행이 0건인 경우에만 씁니다.
 *   그때는 어긋날 행이 없어 따로 세도 안전합니다.
 */
async function countOrders(filter: OrderFilter): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const term = (filter.search ?? '').replace(/[%,().]/g, '').trim();
  const searchExpression = term
    ? `order_no.ilike.%${term}%,orderer_name.ilike.%${term}%,orderer_phone.ilike.%${term}%,depositor_name.ilike.%${term}%,receiver_name.ilike.%${term}%`
    : '';

  let query = supabase.from(ORDERS).select('id', { count: 'exact', head: true });
  query = applyStatusFilter(query, filter.status);
  if (filter.from) query = query.gte('created_at', kstStart(filter.from));
  if (filter.to) query = query.lte('created_at', kstEnd(filter.to));
  if (filter.paymentMethod) query = query.eq('payment_method', filter.paymentMethod);
  if (filter.cashReceipt) {
    query = query.neq('cash_receipt_type', 'none');
    if (filter.cashReceipt === 'todo') query = query.not('cash_receipt_issued', 'is', true);
  }
  if (searchExpression) query = query.or(searchExpression);

  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/** 관리자 주문 목록. 전체 건수까지 함께 돌려줍니다. */
export async function getOrders(
  filter: OrderFilter = {}
): Promise<{ orders: Order[]; total: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { orders: [], total: 0 };

  // 검색어는 or() 안에 들어가므로 구분자로 쓰이는 글자를 미리 걸러 냅니다.
  const term = (filter.search ?? '').replace(/[%,().]/g, '').trim();
  const searchExpression = term
    ? `order_no.ilike.%${term}%,orderer_name.ilike.%${term}%,orderer_phone.ilike.%${term}%,depositor_name.ilike.%${term}%,receiver_name.ilike.%${term}%`
    : '';

  try {
    /*
     * ============================================================
     * ★★ 건수와 목록을 한 번의 조회로 받습니다
     * ============================================================
     *
     * 예전에는 같은 조건으로 두 번 물었습니다. 건수용 한 번, 목록용 한 번.
     * 두 요청은 동시에 나가고 서버에서 각자 처리되므로 **서로 다른 시점**을 봅니다.
     * 그 사이에 주문이 하나 들어오면
     *   건수 = 13  ·  목록 = 12행
     * 처럼 화면이 스스로 어긋납니다. 실제로 결제 직후 들어온 주문이
     * "건수는 13인데 목록에는 12건" 으로 보이는 일이 있었습니다.
     * 새로고침해도 그 순간 또 주문이 들어오면 같은 일이 반복됩니다.
     *
     * PostgREST 는 Prefer: count=exact 와 Range 를 함께 받으면 한 응답에
     * 행과 전체 건수를 같이 돌려줍니다. 한 번만 물으면 두 값이
     * 반드시 같은 시점의 것이라 어긋날 수 없습니다. 조회 수도 절반이 됩니다.
     */
    let listQuery = supabase.from(ORDERS).select('*', { count: 'exact' });
    listQuery = applyStatusFilter(listQuery, filter.status);
    if (filter.from) listQuery = listQuery.gte('created_at', kstStart(filter.from));
    if (filter.to) listQuery = listQuery.lte('created_at', kstEnd(filter.to));
    if (filter.paymentMethod) listQuery = listQuery.eq('payment_method', filter.paymentMethod);
    /*
     * 현금영수증 필터 (4-A).
     * ★ 'todo' 는 아직 발급하지 않은 건입니다.
     *   cash_receipt_issued 는 나중에 추가한 컬럼이라 예전 주문에는 null 입니다.
     *   eq('cash_receipt_issued', false) 로 걸면 null 인 예전 주문이 통째로 빠집니다.
     *   그래서 "true 가 아닌 것" 으로 겁니다.
     */
    if (filter.cashReceipt) {
      listQuery = listQuery.neq('cash_receipt_type', 'none');
      if (filter.cashReceipt === 'todo') listQuery = listQuery.not('cash_receipt_issued', 'is', true);
    }
    if (searchExpression) listQuery = listQuery.or(searchExpression);

    listQuery = listQuery.order('created_at', { ascending: false });
    if (filter.limit !== undefined) {
      const from = filter.offset ?? 0;
      listQuery = listQuery.range(from, from + filter.limit - 1);
    }

    const listResult = await listQuery;

    if (listResult.error) {
      /*
       * ★ 있는 것보다 뒤쪽 페이지를 달라고 하면 PostgREST 가 416 을 돌려줍니다.
       *   (예: 13건뿐인데 2페이지) 이때는 "행이 없다" 가 맞는 답이고,
       *   건수는 여전히 알려 줘야 합니다. 그래야 화면이 페이지 수를 그릴 수 있습니다.
       *   행이 0건이라 어긋날 값도 없으므로 여기서만 건수를 따로 셉니다.
       */
      if (listResult.error.code === 'PGRST103') {
        return { orders: [], total: listResult.count ?? (await countOrders(filter)) };
      }
      if (!isMissingTable(listResult.error.code)) {
        console.error('[orders] 목록 조회 실패:', listResult.error.message);
      }
      return { orders: [], total: 0 };
    }

    const rows = (listResult.data ?? []) as OrderRow[];
    const itemMap = await loadItems(rows.map((row) => row.id));
    const orders = rows.map((row) => rowToOrder(row, itemMap.get(row.id) ?? []));
    /*
     * ★ count 와 rows 가 같은 응답에서 나왔으므로 서로 어긋날 수 없습니다.
     *   count 를 못 읽는 환경이면 지금 받은 행 수를 씁니다.
     */
    return { orders, total: listResult.count ?? orders.length };
  } catch (error) {
    console.error('[orders] 목록 조회 실패:', error);
    return { orders: [], total: 0 };
  }
}

/** 주문 하나 — 상품과 상태 이력까지 함께 */
export async function getOrderById(id: string): Promise<Order | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.from(ORDERS).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;

  const row = data as OrderRow;
  const [itemMap, history] = await Promise.all([loadItems([row.id]), loadHistory(row.id)]);
  return rowToOrder(row, itemMap.get(row.id) ?? [], history);
}

export async function getOrderByNo(orderNo: string): Promise<Order | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(ORDERS)
    .select('*')
    .eq('order_no', orderNo)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as OrderRow;
  const [itemMap, history] = await Promise.all([loadItems([row.id]), loadHistory(row.id)]);
  return rowToOrder(row, itemMap.get(row.id) ?? [], history);
}

/**
 * 주문번호 여러 개를 한 번에 찾습니다. (송장 일괄등록의 매칭에 씁니다)
 * 상품·이력은 읽지 않습니다. 매칭에 필요한 항목만 가져옵니다.
 */
export async function getOrdersByNos(
  orderNos: string[]
): Promise<
  Map<
    string,
    {
      id: string;
      orderNo: string;
      status: string;
      ordererName: string;
      courier: string;
      trackingNo: string;
    }
  >
> {
  const result = new Map<
    string,
    {
      id: string;
      orderNo: string;
      status: string;
      ordererName: string;
      courier: string;
      trackingNo: string;
    }
  >();

  const unique = Array.from(new Set(orderNos.filter(Boolean)));
  if (unique.length === 0) return result;

  const supabase = getSupabaseAdmin();
  if (!supabase) return result;

  const { data, error } = await supabase
    .from(ORDERS)
    .select('id, order_no, status, orderer_name, courier, tracking_no')
    .in('order_no', unique);

  if (error || !data) return result;

  for (const row of data as {
    id: string;
    order_no: string;
    status: string;
    orderer_name: string;
    courier: string | null;
    tracking_no: string | null;
  }[]) {
    result.set(row.order_no, {
      id: row.id,
      orderNo: row.order_no,
      status: row.status,
      ordererName: row.orderer_name,
      courier: row.courier ?? '',
      trackingNo: row.tracking_no ?? '',
    });
  }
  return result;
}

async function loadHistory(orderId: string): Promise<OrderStatusEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(HISTORY)
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as HistoryRow[]).map(rowToHistory);
}

/** 숫자만 남깁니다. 연락처 비교에 씁니다. (010-1234-5678 == 01012345678) */
function digits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * 비회원 주문 조회 — 주문번호와 연락처가 모두 맞아야 돌려줍니다.
 * 둘 중 하나만 맞으면 "없음"으로 처리해 존재 여부를 알려 주지 않습니다.
 */
export async function getOrderForLookup(
  orderNo: string,
  phone: string
): Promise<Order | null> {
  const order = await getOrderByNo(orderNo.trim().toUpperCase());
  if (!order) return null;

  const input = digits(phone);
  if (!input) return null;
  // 주문자 연락처 또는 받는분 연락처 중 하나만 맞아도 통과시킵니다.
  const matches =
    digits(order.ordererPhone) === input || digits(order.receiverPhone) === input;
  return matches ? order : null;
}

/* ------------------------------------------------------------------
 * 회원 주문
 * ------------------------------------------------------------------ */

/** 마이페이지 주문 목록. 상태 필터를 걸 수 있습니다. */
export async function getOrdersOfUser(
  userId: string,
  status?: string
): Promise<Order[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  /*
   * ★ 손님 화면의 탭은 상태 하나가 아니라 여러 상태를 묶습니다.
   *   예) '결제 확인 중' = 결제대기 + 승인확인실패 + 검토필요
   *   어떤 상태를 묶는지는 lib/order-status.ts 의 MYPAGE_ORDER_TABS 한 곳에 있습니다.
   * ★ 모르는 값이 들어오면 빈 배열이 나와 전체를 보여 줍니다.
   *   (없어진 옛 주소는 화면 쪽에서 전체로 돌려보냅니다)
   */
  let query = supabase.from(ORDERS).select('*').eq('user_id', userId);
  const statuses = status ? mypageTabStatuses(status) : [];
  if (statuses.length > 0) query = query.in('status', statuses);
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error || !data) return [];

  const rows = data as OrderRow[];
  const itemMap = await loadItems(rows.map((row) => row.id));
  return rows.map((row) => rowToOrder(row, itemMap.get(row.id) ?? []));
}

/**
 * 마이페이지 주문 상세.
 * ★ 본인 주문이 아니면 null 을 돌려줍니다. 남의 주문을 열 수 없습니다.
 */
export async function getOrderOfUser(
  userId: string,
  orderId: string
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order || order.userId !== userId) return null;
  return order;
}

/** 마이페이지 요약 카드에 쓰는 상태별 건수 */
export async function countOrdersOfUser(
  userId: string
): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from(ORDERS)
    .select('status')
    .eq('user_id', userId);
  if (error || !data) return {};

  const result: Record<string, number> = {};
  for (const row of data as { status: string }[]) {
    result[row.status] = (result[row.status] ?? 0) + 1;
  }
  return result;
}

/**
 * 비회원으로 했던 주문을 회원 계정에 연결합니다.
 * 주문번호와 연락처가 모두 맞아야 하고,
 * ★ 이미 다른 계정에 연결된 주문은 가져올 수 없습니다.
 */
export async function claimOrder(
  userId: string,
  orderNo: string,
  phone: string
): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  const order = await getOrderForLookup(orderNo, phone);
  if (!order) {
    return { ok: false, error: '주문번호와 연락처가 일치하는 주문을 찾지 못했습니다.' };
  }
  if (order.userId === userId) {
    return { ok: false, error: '이미 내 주문 내역에 있는 주문입니다.' };
  }
  if (order.userId) {
    return { ok: false, error: '이미 다른 계정에 연결된 주문입니다.' };
  }

  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from(ORDERS)
    .update({ user_id: userId })
    .eq('id', order.id)
    // 그 사이 다른 계정이 가져가지 못하도록 null 일 때만 씁니다.
    .is('user_id', null);

  if (error) {
    return { ok: false, error: `주문을 불러오지 못했습니다: ${error.message}` };
  }

  await addHistory(order.id, order.status, order.status, '비회원 주문을 회원 계정에 연결');
  const updated = await getOrderById(order.id);
  return updated ? { ok: true, order: updated } : { ok: false, error: '주문을 불러오지 못했습니다.' };
}

/* ------------------------------------------------------------------
 * 주문 생성
 * ------------------------------------------------------------------ */

/** 서버가 다시 계산한 한 줄 */
type PricedLine = {
  productId: string;
  productSlug: string;
  productName: string;
  brandLabel: string;
  optionKey: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  thumbnailUrl: string;
};

export class CheckoutError extends Error {
  /** 화면에 목록으로 보여 줄 문제 상품들 */
  readonly problems: string[];

  constructor(message: string, problems: string[] = []) {
    super(message);
    this.name = 'CheckoutError';
    this.problems = problems;
  }
}

/**
 * 장바구니 내용을 서버에서 다시 검증하고 가격을 매깁니다.
 * ★ 여기서 품절·재고 부족을 걸러 냅니다. 클라이언트 가격은 쳐다보지 않습니다.
 *
 * ★★ 아래 readCartLines 가 같은 규칙을 봅니다. 한쪽을 고치면 다른 쪽도 고치세요.
 *   일부러 합치지 않았습니다. 이 함수는 주문을 만드는 길목이라, 화면 때문에
 *   여기를 건드리다 실수하면 손님에게 청구되는 금액이 틀어집니다.
 */
async function priceLines(
  items: CheckoutInput['items']
): Promise<{ lines: PricedLine[]; itemsTotal: number; allFreeShipping: boolean }> {
  const supabase = requireSupabaseAdmin();

  const slugs = Array.from(new Set(items.map((item) => item.productSlug)));
  const { data, error } = await supabase.from('products').select('*').in('slug', slugs);
  if (error) throw new Error(`상품을 확인하지 못했습니다: ${error.message}`);

  const rows = (data ?? []) as ProductRow[];
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const brands = await getBrands();

  const problems: string[] = [];
  const lines: PricedLine[] = [];
  let allFreeShipping = items.length > 0;

  for (const item of items) {
    const row = bySlug.get(item.productSlug);
    if (!row) {
      problems.push(`${item.productSlug} — 판매가 종료된 상품입니다.`);
      continue;
    }
    if (row.is_visible === false) {
      problems.push(`${row.name} — 현재 판매하지 않는 상품입니다.`);
      continue;
    }
    if (row.is_sold_out) {
      problems.push(`${row.name} — 품절된 상품입니다.`);
      continue;
    }

    const quantity = Math.max(1, Math.trunc(item.quantity));
    const options = normalizeOptions(row.options);

    let extraPrice = 0;
    if (options.groups.length > 0) {
      const combination = options.combinations.find(
        (entry) => entry.key === item.optionKey
      );
      if (!combination) {
        problems.push(`${row.name} — 선택한 옵션(${item.optionKey})이 사라졌습니다.`);
        continue;
      }
      if (!isCombinationAvailable(combination)) {
        problems.push(`${row.name} (${item.optionKey}) — 품절되었습니다.`);
        continue;
      }
      if (combination.stock !== null && combination.stock < quantity) {
        problems.push(
          `${row.name} (${item.optionKey}) — 재고가 ${combination.stock}개 남았습니다.`
        );
        continue;
      }
      extraPrice = combination.extraPrice;
    }

    const unitPrice = row.price + extraPrice;
    if (!row.free_shipping) allFreeShipping = false;

    lines.push({
      productId: row.id,
      productSlug: row.slug,
      productName: row.name,
      brandLabel: row.brand_slug ? brandLabel(brands, row.brand_slug) : '',
      optionKey: item.optionKey,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
      thumbnailUrl: Array.isArray(row.thumbnails) ? String(row.thumbnails[0] ?? '') : '',
    });
  }

  if (problems.length > 0) {
    throw new CheckoutError('주문할 수 없는 상품이 있습니다.', problems);
  }
  if (lines.length === 0) {
    throw new CheckoutError('주문할 상품이 없습니다.');
  }

  const itemsTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return { lines, itemsTotal, allFreeShipping };
}

/* ------------------------------------------------------------------
 * 장바구니의 "지금" 상태 읽기
 * ------------------------------------------------------------------ */

/** 장바구니 한 줄이 지금 어떤 상태인지 */
export type CartLineState = {
  productSlug: string;
  optionKey: string;
  /** 지금 이 줄을 주문에 넣을 수 있는지 */
  ok: boolean;
  /** 넣을 수 없는 이유. ok 면 빈 문자열입니다. */
  reason: string;
  productName: string;
  brandLabel: string;
  thumbnailUrl: string;
  /** 옵션 추가금까지 더한 개당 가격 */
  unitPrice: number;
  extraPrice: number;
  /** null 이면 재고를 세지 않는 상품입니다 */
  stock: number | null;
  freeShipping: boolean;
};

/**
 * 장바구니에 담긴 것들이 지금 어떤 상태인지 읽어 옵니다. 아무것도 바꾸지 않습니다.
 *
 * ★★ 왜 필요한가
 *   장바구니는 손님 브라우저에만 있고, 담을 때의 가격이 숫자로 박혀 있습니다.
 *   그래서 세일가가 바뀌면 손님은 옛 금액을 보면서 주문하게 되고,
 *   실제로는 주문을 만드는 순간 서버가 새로 매긴 금액이 청구됩니다.
 *   화면이 열릴 때 이 함수로 물어보고 그 값으로 다시 그립니다.
 *
 * ★★ 위 priceLines 와 같은 규칙을 봅니다. 한쪽을 고치면 다른 쪽도 고치세요.
 *   두 함수가 보는 것 — 판매중지 · 품절 · 옵션 사라짐 · 재고 부족 ·
 *   개당가격 = 상품가 + 옵션추가금
 *
 * ★ 이 함수는 던지지 않습니다. 못 파는 줄도 이유를 달아 그대로 돌려줍니다.
 *   장바구니는 못 사는 물건도 담긴 채로 보여 주어야 하기 때문입니다.
 *   손님이 담아 둔 것을 우리가 지우지 않습니다.
 */
export async function readCartLines(
  items: { productSlug: string; optionKey: string; quantity: number }[]
): Promise<CartLineState[]> {
  const supabase = requireSupabaseAdmin();

  const slugs = Array.from(new Set(items.map((item) => item.productSlug)));
  const { data, error } = await supabase.from('products').select('*').in('slug', slugs);
  if (error) throw new Error(`상품을 확인하지 못했습니다: ${error.message}`);

  const rows = (data ?? []) as ProductRow[];
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const brands = await getBrands();

  return items.map((item) => {
    /** 상품을 못 찾았을 때도 모양은 갖춰 돌려줍니다. */
    const blank = {
      productSlug: item.productSlug,
      optionKey: item.optionKey,
      productName: '',
      brandLabel: '',
      thumbnailUrl: '',
      unitPrice: 0,
      extraPrice: 0,
      stock: null as number | null,
      freeShipping: false,
    };

    const row = bySlug.get(item.productSlug);
    /*
     * ★ 상품 주소(slug)가 바뀌어도 여기로 옵니다.
     *   실제로는 팔고 있는데 못 찾는 경우인데, 지금 구조로는 구분할 방법이 없습니다.
     *   장바구니가 상품을 주소로 기억하기 때문입니다. 따로 다루기로 한 건입니다.
     */
    if (!row) return { ...blank, ok: false, reason: '판매가 종료된 상품입니다.' };

    const base = {
      ...blank,
      productName: row.name,
      brandLabel: row.brand_slug ? brandLabel(brands, row.brand_slug) : '',
      thumbnailUrl: Array.isArray(row.thumbnails) ? String(row.thumbnails[0] ?? '') : '',
      unitPrice: row.price,
      freeShipping: row.free_shipping === true,
    };

    if (row.is_visible === false) {
      return { ...base, ok: false, reason: '지금은 판매하지 않는 상품입니다.' };
    }
    if (row.is_sold_out) {
      return { ...base, ok: false, reason: '품절되었습니다.' };
    }

    const quantity = Math.max(1, Math.trunc(item.quantity));
    const options = normalizeOptions(row.options);

    // 옵션이 없는 상품은 재고를 조합으로 세지 않습니다. (priceLines 와 같습니다)
    if (options.groups.length === 0) {
      return { ...base, ok: true, reason: '' };
    }

    const combination = options.combinations.find((entry) => entry.key === item.optionKey);
    if (!combination) {
      return { ...base, ok: false, reason: '선택하신 옵션이 없어졌습니다.' };
    }

    /* 조합을 찾았으면 그 추가금까지 반영한 값을 돌려줍니다. 품절이어도 마찬가지입니다. */
    const priced = {
      ...base,
      extraPrice: combination.extraPrice,
      unitPrice: row.price + combination.extraPrice,
      stock: combination.stock,
    };

    if (!isCombinationAvailable(combination)) {
      return { ...priced, ok: false, reason: '품절되었습니다.' };
    }
    if (combination.stock !== null && combination.stock < quantity) {
      return { ...priced, ok: false, reason: `재고가 ${combination.stock}개 남았습니다.` };
    }
    return { ...priced, ok: true, reason: '' };
  });
}

/**
 * 배송비 계산.
 * 무료배송 기준 금액을 넘거나 모든 상품이 무료배송이면 기본 배송비가 0 입니다.
 * 도서산간은 우편번호로 판별해 추가배송비를 더합니다.
 */
export async function calcShipping(
  itemsTotal: number,
  postcode: string,
  allFreeShipping = false
): Promise<{ shippingFee: number; extraShippingFee: number; remote: boolean }> {
  const [shipping, payment] = await Promise.all([
    getShippingSettings(),
    getPaymentSettings(),
  ]);

  const freeByThreshold =
    shipping.freeThreshold > 0 && itemsTotal >= shipping.freeThreshold;
  const shippingFee = freeByThreshold || allFreeShipping ? 0 : shipping.baseFee;

  const remote = isRemoteArea(postcode, payment.remoteAreaRules);
  const extraShippingFee = remote ? shipping.islandFee : 0;

  return { shippingFee, extraShippingFee, remote };
}

/**
 * 실제로 쓸 수 있는 포인트를 계산합니다.
 *
 * ★ 클라이언트가 보낸 값은 "요청"일 뿐입니다.
 *   잔액·최소 사용액·최대 비율을 서버에서 다시 적용해 깎습니다.
 *   비회원이거나 조건에 못 미치면 0 입니다.
 */
export async function resolveUsedPoints(
  userId: string | null,
  itemsTotal: number,
  requested: number
): Promise<number> {
  if (!userId) return 0;

  const want = Math.max(0, Math.trunc(Number(requested) || 0));
  if (want <= 0) return 0;

  const [settings, balance] = await Promise.all([
    getPointSettings(),
    getPointBalance(userId),
  ]);

  // 최소 사용 금액에 못 미치면 아예 쓰지 않습니다.
  if (settings.minUse > 0 && want < settings.minUse) return 0;

  const limit = maxUsablePoints(itemsTotal, balance, settings);

  /*
   * ★★ 사용 단위로 내리는 것이 마지막입니다.
   *   화면도 같은 규칙으로 깎아서 보여 주지만, 결정하는 쪽은 여기입니다.
   *   화면 값을 믿고 그대로 쓰면 손댄 요청이 그대로 통과합니다.
   * ★ 한도까지 먼저 깎고 나서 단위로 내립니다. 순서를 바꾸면
   *   단위에 맞춘 값이 한도를 넘길 수 있습니다.
   */
  return roundPointsToUnit(Math.min(want, limit), settings.useUnit);
}

/**
 * 재고가 움직인 기록.
 *
 * ★ 왜 남기는가
 *   재고 숫자가 실제와 안 맞을 때 지금까지는 단서가 하나도 없었습니다.
 *   상품의 options 안에 숫자만 덮어써 왔기 때문입니다.
 *   이 기록이 "언제 · 어느 주문 때문에 · 몇 개" 를 말해 주는 유일한 자료입니다.
 *
 * ★ 기록 실패가 재고 반영을 되돌리지는 않습니다. 재고 쪽이 본체입니다.
 *   표가 아직 없어도(schema-4b.sql 미실행) 조용히 넘어갑니다.
 */
type StockMoveContext = {
  orderId: string | null;
  orderNo: string | null;
  reason: string;
};

/**
 * 재고가 모자라 다 깎지 못한 내역.
 *
 * ★★ 왜 필요한가
 *   승인확인실패 주문을 결제완료로 확정할 때, 자동정리가 되돌려 놓았던 재고를
 *   다시 잡습니다. 그런데 되돌린 사이에 그 물건이 팔렸을 수 있습니다.
 *   그때 재고는 0 밑으로 내려가지 않게 막지만, 그 사실을 아무도 모르면
 *   보낼 물건이 없는 주문을 준비 중으로 넘기게 됩니다.
 *   막지는 않되 반드시 알려야 합니다.
 */
export type StockShortage = {
  productId: string | null;
  productSlug: string | null;
  /** 사람이 읽을 상품명. 주문 품목에서 채웁니다. */
  productName?: string;
  optionKey: string;
  /** 깎으려던 수량 */
  wanted: number;
  /** 실제로 있던 수량 */
  available: number;
};

type StockMoveRow = {
  productId: string | null;
  productSlug: string | null;
  optionKey: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
};

async function writeStockMoves(
  rows: StockMoveRow[],
  direction: 'release' | 'deduct' | 'skip',
  context: StockMoveContext,
  /** direction 이 skip 일 때 왜 건너뛰었는지 */
  excludedReason?: string
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const { error } = await supabase.from('stock_moves').insert(
      rows.map((row) => ({
        order_id: context.orderId,
        order_no: context.orderNo,
        product_id: row.productId,
        product_slug: row.productSlug,
        option_key: row.optionKey || null,
        direction,
        quantity: row.quantity,
        stock_before: row.stockBefore,
        stock_after: row.stockAfter,
        reason: context.reason || null,
        excluded_reason: excludedReason || null,
      }))
    );
    if (error && !isMissingTable(error.code)) {
      console.warn('[orders] 재고 기록 실패:', error.message);
    }
  } catch (error) {
    console.warn('[orders] 재고 기록 실패:', error);
  }
}

/**
 * ============================================================
 * 재고를 delta 만큼 더합니다 — DB 함수가 한 번에 처리합니다
 * ============================================================
 *
 * ★★ 예전에는 앱이 직접 했습니다.
 *     ① 상품을 통째로 읽고 ② 코드에서 빼고 ③ 통째로 다시 씀
 *   두 주문이 동시에 ①을 하면 둘 다 같은 값을 읽습니다.
 *   각자 계산하고 각자 씁니다. 나중에 쓴 쪽이 이겨 재고가 사라집니다.
 *   재고 5개에 3개씩 두 명이 주문하면 둘 다 성공하고 재고는 2개로 남았습니다.
 *
 *   이제 supabase/schema-4c.sql 의 apply_stock_changes() 가
 *   행을 잠그고 읽기·계산·쓰기를 한 트랜잭션에서 끝냅니다.
 *   포인트(apply_point_change)와 같은 방식입니다.
 *
 * ★★ 주문 한 건을 통째로 넘깁니다. 상품마다 따로 부르지 마세요.
 *   따로 부르면 세 번째에서 실패해도 앞의 둘은 이미 커밋됩니다.
 *   한 번에 넘겨야 하나라도 모자랄 때 전부 되돌아갑니다.
 *
 * @param allowShort 재고가 모자랄 때
 *   false(기본) — 예외를 던집니다. 주문이 통째로 실패해야 하는 자리입니다.
 *   true        — 0 에서 멈추고 부족분을 돌려줍니다.
 *                 [결제완료로 확정] 전용입니다. 이미 승인된 돈이라
 *                 주문을 되돌릴 수 없어 막지 않습니다.
 *
 * ★ context 를 주면 움직인 내역을 stock_moves 에 남깁니다. 안 주면 남기지 않습니다.
 */
type StockChangeRow = {
  product_id: string;
  option_key: string;
  quantity: number;
  status: 'ok' | 'short' | 'unmanaged' | 'missing';
  stock_before: number | null;
  stock_after: number | null;
};

async function adjustStock(
  entries: {
    productId: string | null;
    productSlug?: string | null;
    optionKey: string;
    quantity: number;
  }[],
  delta: -1 | 1,
  context?: StockMoveContext,
  allowShort = false
): Promise<StockShortage[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  /* 상품이나 옵션이 비어 있는 줄은 애초에 재고를 건드릴 수 없습니다. */
  const lines = entries.filter((entry) => entry.productId && entry.optionKey);
  if (lines.length === 0) return [];

  /** 결과를 돌려받은 뒤 slug 를 붙이기 위한 표 */
  const slugOf = new Map<string, string | null>();
  for (const entry of lines) {
    slugOf.set(`${entry.productId}|${entry.optionKey}`, entry.productSlug ?? null);
  }

  const { data, error } = await supabase.rpc('apply_stock_changes', {
    p_lines: lines.map((entry) => ({
      product_id: entry.productId,
      option_key: entry.optionKey,
      quantity: entry.quantity,
    })),
    p_delta: delta,
    p_allow_short: allowShort,
  });

  if (error) {
    /*
     * ★★ 차감인데 막아야 하는 자리(allowShort = false)에서는 던집니다.
     *   재고가 모자란데 조용히 넘어가면 팔 수 없는 물건을 판 것이 됩니다.
     *   부르는 쪽(createOrder)이 주문을 지우고 손님에게 알립니다.
     *
     * ★ 되돌림(+1)과 [결제완료로 확정]은 던지지 않습니다.
     *   되돌리다 실패했다고 취소 처리 자체를 막으면 손님이 더 곤란해집니다.
     *   기록만 남기고 사람이 나중에 맞춥니다. 예전 동작 그대로입니다.
     */
    if (delta === -1 && !allowShort) throw error;
    console.warn('[orders] 재고 반영 실패:', error.message);
    return [];
  }

  const rows = (Array.isArray(data) ? data : []) as StockChangeRow[];

  const moved: StockMoveRow[] = [];
  const skippedRows: StockMoveRow[] = [];
  const shortages: StockShortage[] = [];

  for (const row of rows) {
    const productSlug = slugOf.get(`${row.product_id}|${row.option_key}`) ?? null;

    if (row.status === 'unmanaged' || row.status === 'missing') {
      /*
       * ★ 건너뛴 것을 조용히 넘기지 않습니다.
       *   재고를 관리하지 않는 조합은 차감한 적이 없어 되돌리면 없던 재고가 생깁니다.
       *   나중에 "왜 안 돌아왔는지" 를 알 수 있어야 합니다.
       */
      skippedRows.push({
        productId: row.product_id,
        productSlug,
        optionKey: row.option_key,
        quantity: row.quantity,
        stockBefore: 0,
        stockAfter: 0,
      });
      continue;
    }

    if (row.status === 'short') {
      shortages.push({
        productId: row.product_id,
        productSlug,
        optionKey: row.option_key,
        wanted: row.quantity,
        available: row.stock_before ?? 0,
      });
    }

    moved.push({
      productId: row.product_id,
      productSlug,
      optionKey: row.option_key,
      quantity: row.quantity,
      stockBefore: row.stock_before ?? 0,
      stockAfter: row.stock_after ?? 0,
    });
  }

  if (context) {
    await writeStockMoves(moved, delta === 1 ? 'release' : 'deduct', context);
    if (skippedRows.length > 0) {
      await writeStockMoves(
        skippedRows,
        'skip',
        context,
        '재고를 관리하지 않는 조합(stock 없음)이라 건너뜀 — 차감한 적이 없습니다'
      );
    }
  }

  return shortages;
}

/**
 * DB 함수가 던진 재고 부족 예외에서 손님에게 보여 줄 줄들을 꺼냅니다.
 *
 * ★ 함수가 이런 모양으로 던집니다.
 *     재고가 모자랍니다|캐시미어 코트 (블랙/S) — 재고가 2개 남았습니다|…
 *   앞머리를 떼고 막대(|)로 나누면 그대로 화면에 쓸 수 있습니다.
 * ★ 모양이 다르면 통째로 한 줄로 씁니다. 메시지를 잃는 것보다 낫습니다.
 */
function stockShortageProblems(error: unknown): string[] | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  if (!message.includes('재고가 모자랍니다')) return null;

  const at = message.indexOf('재고가 모자랍니다|');
  if (at < 0) return [message.trim()];

  const parts = message
    .slice(at + '재고가 모자랍니다|'.length)
    .split('|')
    .map((line) => line.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [message.trim()];
}


/**
 * ============================================================
 * 주문의 재고를 되돌립니다 — 한 주문당 딱 한 번
 * ============================================================
 *
 * ★★ 왜 이 함수가 따로 있는가
 *   같은 주문의 재고를 두 번 되돌리면 없는 물건이 있는 것으로 잡힙니다.
 *   그 상태로 주문을 받으면 손님에게 사과하고 취소해야 합니다.
 *
 *   상태만으로는 막을 수 없습니다. 4-B 부터 결제실패도 재고를 되돌리므로
 *     결제대기 → 결제실패(되돌림) → 취소완료(또 되돌림)
 *   이라는 길이 실제로 생깁니다.
 *
 * ★★ 그래서 DB 가 막습니다.
 *   stock_released_at 이 비어 있을 때만 값을 채우는 조건부 UPDATE 로
 *   자리를 먼저 잡습니다. 같은 순간에 두 요청이 들어와도 DB 가 하나만
 *   통과시킵니다. 자리를 잡은 요청만 재고를 건드립니다.
 *
 * ★ 칸이 아직 없으면(schema-4b.sql 미실행) 예전처럼 상태 검사에만 기댑니다.
 *   되돌림이 아예 안 되는 것보다는 낫습니다.
 *
 * @returns 이번 호출이 실제로 되돌렸는지
 */
export async function releaseOrderStock(order: Order, reason: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const claim = await supabase
    .from(ORDERS)
    .update({ stock_released_at: new Date().toISOString() })
    .eq('id', order.id)
    .is('stock_released_at', null)
    .select('id');

  if (claim.error) {
    if (isMissingColumn(claim.error)) {
      // 칸이 없는 환경 — 예전 방식대로 그대로 되돌립니다.
      console.warn(
        '[orders] stock_released_at 칸이 없습니다. supabase/schema-4b.sql 을 실행해 주세요.'
      );
    } else {
      console.warn('[orders] 재고 되돌림 자리를 잡지 못했습니다:', claim.error.message);
      return false;
    }
  } else if (!claim.data || claim.data.length === 0) {
    // 이미 누가 되돌렸습니다. 두 번째는 아무 일도 하지 않습니다.
    return false;
  }

  const context = { orderId: order.id, orderNo: order.orderNo, reason };

  /*
   * ★★ 되돌리면 안 되는 품목을 먼저 걸러 냅니다.
   *   ① item_status = cancelled — 부분취소(cancelOrderItem)가 이미 되돌렸습니다.
   *     여기서 또 되돌리면 없던 재고가 생깁니다.
   *   ② 재고를 관리하지 않는 조합(stock = null) — 차감한 적이 없습니다.
   *     이 판단은 adjustStock 안에서 실제 값을 보고 합니다.
   *
   * ★ 건너뛴 것을 조용히 넘기지 않습니다.
   *   나중에 재고가 안 맞을 때 "왜 안 돌아왔는지" 를 알 수 있어야 합니다.
   */
  const skipped = order.items.filter((item) => item.itemStatus !== 'normal');
  if (skipped.length > 0) {
    await writeStockMoves(
      skipped.map((item) => ({
        productId: item.productId,
        productSlug: item.productSlug,
        optionKey: item.optionKey,
        quantity: item.quantity,
        stockBefore: 0,
        stockAfter: 0,
      })),
      'skip',
      context,
      `품목 상태가 ${skipped[0].itemStatus} 라 건너뜀 (부분취소가 이미 되돌렸을 수 있음)`
    );
  }

  await adjustStock(
    order.items
      .filter((item) => item.itemStatus === 'normal')
      .map((item) => ({
        productId: item.productId,
        productSlug: item.productSlug,
        optionKey: item.optionKey,
        quantity: item.quantity,
      })),
    1,
    context
  );

  return true;
}

/** 주문번호를 받아 옵니다. DB 함수가 원자적으로 순번을 올려 줍니다. */
async function nextOrderNo(): Promise<string> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.rpc('next_order_no');
  if (error) {
    if (isMissingTable(error.code)) throw missingTableError();
    throw new Error(`주문번호를 발급하지 못했습니다: ${error.message}`);
  }
  const orderNo = typeof data === 'string' ? data : String(data ?? '');
  if (!orderNo) throw new Error('주문번호를 발급하지 못했습니다.');
  return orderNo;
}

/**
 * 주문 생성.
 * 금액·배송비를 서버에서 다시 계산하고, 재고를 차감한 뒤 저장합니다.
 */
export async function createOrder(input: CheckoutInput): Promise<Order> {
  const supabase = requireSupabaseAdmin();

  const { lines, itemsTotal, allFreeShipping } = await priceLines(input.items);
  const { shippingFee, extraShippingFee } = await calcShipping(
    itemsTotal,
    input.postcode,
    allFreeShipping
  );

  /* ── 포인트 사용 ─────────────────────────────────────
   * ★ 클라이언트가 보낸 금액을 그대로 쓰지 않습니다.
   *   실제 잔액과 설정(최소 사용액·최대 비율)으로 다시 깎습니다.
   *   실제 차감은 주문을 저장한 뒤에 합니다. */
  const discount = await resolveUsedPoints(input.userId ?? null, itemsTotal, input.usePoints ?? 0);
  const totalAmount = itemsTotal + shippingFee + extraShippingFee - discount;

  const base = {
    status: 'pending_payment' as const,
    // 로그인 상태면 회원 주문, 아니면 null(비회원 주문)입니다.
    user_id: input.userId ?? null,
    orderer_name: input.ordererName.trim(),
    orderer_phone: input.ordererPhone.trim(),
    orderer_email: input.ordererEmail.trim() || null,
    receiver_name: input.receiverName.trim(),
    receiver_phone: input.receiverPhone.trim(),
    postcode: input.postcode.trim(),
    address1: input.address1.trim(),
    address2: input.address2.trim() || null,
    delivery_memo: input.deliveryMemo.trim() || null,
    depositor_name: input.depositorName.trim() || null,
    payment_method: input.paymentMethod,
    items_total: itemsTotal,
    shipping_fee: shippingFee,
    extra_shipping_fee: extraShippingFee,
    discount,
    total_amount: totalAmount,
    cash_receipt_type: input.cashReceiptType,
    cash_receipt_no:
      input.cashReceiptType === 'none' ? null : input.cashReceiptNo.trim() || null,
  };

  // 주문번호는 DB 함수가 원자적으로 발급하지만,
  // 만에 하나 겹치면(수동 입력 등) 몇 번 더 시도합니다.
  let row: OrderRow | null = null;
  let lastError: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNo = await nextOrderNo();
    const { data, error } = await supabase
      .from(ORDERS)
      .insert({ ...base, order_no: orderNo })
      .select('*')
      .single();

    if (!error) {
      row = data as OrderRow;
      break;
    }
    lastError = error;
    if (isMissingTable(error.code)) throw missingTableError();
    if (error.code !== UNIQUE_VIOLATION) break;
  }

  if (!row) {
    throw new Error(`주문을 저장하지 못했습니다: ${lastError?.message ?? '알 수 없는 오류'}`);
  }

  const { data: itemData, error: itemError } = await supabase
    .from(ITEMS)
    .insert(
      lines.map((line) => ({
        order_id: row!.id,
        product_id: line.productId,
        product_slug: line.productSlug,
        product_name: line.productName,
        brand_label: line.brandLabel || null,
        option_key: line.optionKey || null,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        line_total: line.lineTotal,
        thumbnail_url: line.thumbnailUrl || null,
        item_status: 'normal',
      }))
    )
    .select('*');

  if (itemError) {
    // 상품을 넣지 못했으면 껍데기 주문이 남습니다. 지우고 오류를 알립니다.
    await supabase.from(ORDERS).delete().eq('id', row.id);
    throw new Error(`주문 상품을 저장하지 못했습니다: ${itemError.message}`);
  }

  /*
   * ============================================================
   * 재고 차감 — 여기서 실패하면 주문이 성립하지 않습니다
   * ============================================================
   *
   * ★★ 왜 이 자리인가 (예전에는 맨 아래에 있었습니다)
   *   ① 포인트 차감보다 앞이어야 합니다.
   *     뒤에 두면 재고가 모자랄 때 이미 깎인 포인트까지 되돌려야 합니다.
   *     앞에 두면 되돌릴 것이 없습니다.
   *   ② 이력(addHistory)보다 앞이어야 합니다.
   *     주문을 지울 때 이력이 남아 있으면 지저분해집니다.
   *     지금 자리에서는 주문과 품목만 있고, 품목은 연쇄 삭제됩니다.
   *
   * ★★ 예전에는 모자라도 0 에서 멈추고 그냥 진행했습니다.
   *   팔 수 없는 물건을 판 주문이 그대로 들어왔습니다.
   *   이제 DB 함수가 예외를 던지고, 우리는 주문을 지우고 손님에게 알립니다.
   *
   * ★ 위 priceLines 의 재고 검사는 그대로 둡니다.
   *   그쪽은 손님에게 미리 알려 주는 친절이고, 진짜 방어선은 여기입니다.
   *   검사와 차감 사이에 다른 주문이 끼어들 수 있어 검사만으로는 못 막습니다.
   */
  try {
    await adjustStock(
      lines.map((line) => ({
        productId: line.productId,
        productSlug: line.productSlug,
        optionKey: line.optionKey,
        quantity: line.quantity,
      })),
      -1,
      { orderId: row.id, orderNo: row.order_no, reason: '주문 접수' }
    );
  } catch (error) {
    // 재고를 잡지 못했으므로 주문은 없던 일이 됩니다. (품목은 연쇄 삭제됩니다)
    await supabase.from(ORDERS).delete().eq('id', row.id);

    const problems = stockShortageProblems(error);
    if (problems) {
      throw new CheckoutError('주문할 수 없는 상품이 있습니다.', problems);
    }
    /*
     * 재고 부족이 아닌 실패입니다. (함수가 없거나 DB 가 답을 못 주는 경우)
     * ★ 이때도 주문을 만들면 안 됩니다. 재고를 잡지 못한 주문이기 때문입니다.
     */
    console.error('[orders] 재고를 잡지 못해 주문을 취소했습니다:', row.order_no, error);
    throw new Error(
      '재고를 확인하지 못해 주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    );
  }

  await addHistory(row.id, null, 'pending_payment', '주문이 접수되었습니다.');

  /* 포인트 차감.
     ★ 여기서 실패하면 주문 금액과 어긋나므로 할인을 0으로 되돌립니다.
       (동시에 다른 곳에서 포인트를 다 써 버린 경우입니다) */
  if (discount > 0 && input.userId) {
    try {
      await changePoints(input.userId, -discount, 'order_use', '주문 사용', row.id);
    } catch (error) {
      console.warn('[orders] 포인트 차감 실패 — 할인 없이 진행합니다:', row.id, error);

      /*
       * ★★ 되돌리기가 성공했는지 반드시 확인합니다.
       *   예전에는 결과를 보지 않고 화면에 돌려줄 값만 0 으로 바꿨습니다.
       *   되돌리기가 실패하면 DB 에는 할인이 남아 있는데 손님에게는 0 이라고
       *   말하게 됩니다. 그리고 그 할인만큼 덜 받게 됩니다.
       */
      const rollback = await supabase
        .from(ORDERS)
        .update({ discount: 0, total_amount: totalAmount + discount })
        .eq('id', row.id)
        .select('id');

      if (!rollback.error && rollback.data && rollback.data.length > 0) {
        row.discount = 0;
        row.total_amount = totalAmount + discount;
      } else {
        /*
         * ★ 손님을 막지 않습니다. 주문은 이미 저장되어 있고 결제로 넘어갑니다.
         *   여기서 던지면 손님은 오류를 보고 다시 주문해 중복 주문이 됩니다.
         *   대신 사람을 부릅니다. 금액이 어긋난 채 조용히 넘어가면 안 됩니다.
         */
        console.error('[orders] 할인 되돌리기 실패 — 금액이 어긋납니다:', row.order_no);
        try {
          await notifyDiscountMismatch(
            row.order_no,
            row.id,
            discount,
            totalAmount + discount
          );
        } catch (notifyError) {
          console.warn('[orders] 금액 불일치 알림 실패:', notifyError);
        }
      }
    }
  }

  /* ★ 재고 차감은 위(품목 저장 직후)에서 이미 끝났습니다.
       모자라면 그 자리에서 주문을 지우고 멈춥니다. */

  const items = ((itemData ?? []) as OrderItemRow[]).map(rowToItem);
  return rowToOrder(row, items, await loadHistory(row.id));
}

/* ------------------------------------------------------------------
 * 상태 · 배송 · 메모
 * ------------------------------------------------------------------ */

export async function addHistory(
  orderId: string,
  fromStatus: string | null,
  toStatus: string,
  memo: string
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(HISTORY).insert({
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    memo: memo || null,
  });
  if (error && !isMissingTable(error.code)) {
    console.warn('[orders] 이력 저장 실패:', error.message);
  }
}

/**
 * 상태 변경. 이력에 남기고, 취소·반품이면 재고를 되돌립니다.
 * 결제완료로 바꾸면 paid_at 을 채웁니다.
 */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  memo = ''
): Promise<Order> {
  const supabase = requireSupabaseAdmin();
  const before = await getOrderById(id);
  if (!before) throw new Error('주문을 찾을 수 없습니다.');
  if (before.status === status && !memo) {
    return before;
  }

  const patch: Record<string, unknown> = { status };
  if (status === 'paid' && !before.paidAt) patch.paid_at = new Date().toISOString();

  assertWritten(
    await supabase.from(ORDERS).update(patch).eq('id', id).select('id'),
    '상태를 바꾸지 못했습니다'
  );

  await addHistory(id, before.status, status, memo);

  /*
   * 취소·반품·결제실패로 바뀌면 아직 살아 있는 품목의 재고를 되돌립니다.
   *
   * ★ 예전에는 여기서 바로 adjustStock 을 불렀습니다.
   *   "되돌림 상태가 아니었다가 되었을 때만" 이라는 조건 하나로 막았는데,
   *   4-B 에서 결제실패가 되돌림 상태에 들어오면서
   *     결제대기 → 결제실패(되돌림) → 취소완료(또 되돌림)
   *   이라는 길이 생겼습니다. 그 조건은 이 길을 막지 못합니다.
   *   releaseOrderStock 이 DB 에서 한 번만 통과시킵니다.
   */
  if (isStockReleasing(status) && !isStockReleasing(before.status)) {
    await releaseOrderStock(before, memo || `${statusLabel(status)} 처리`);

    // ★ 쓴 포인트는 돌려주고, 이 주문으로 적립된 포인트(구매·리뷰)는 회수합니다.
    if (before.userId) {
      await revokeOrderPoints(before.userId, before.id, before.discount);
      /*
       * ★ 추천 실적에서도 뺍니다.
       *   취소·반품된 주문을 첫 구매로 인정해 두면, 주문했다가 바로 무르는 식으로
       *   실적을 만들 수 있습니다. 진행률만 되돌리고 이미 나간 포인트는 두지만,
       *   다음 회차 지급이 그만큼 늦어집니다.
       */
      await revertFirstPurchase(before.userId, before.id);
    }
  }

  // ★ 구매 적립은 배송완료·구매확정 시점에만 지급합니다.
  //   주문 즉시 주면 취소·반품 때 회수가 복잡해집니다.
  //   기준 금액은 배송비를 뺀 상품금액에서 쓴 포인트를 뺀 값입니다.
  if (before.userId && (status === 'delivered' || status === 'confirmed')) {
    const live = before.items.filter((item) => item.itemStatus !== 'cancelled');
    const base = Math.max(
      0,
      live.reduce((sum, item) => sum + item.lineTotal, 0) - before.discount
    );
    try {
      await earnPurchasePoints(before.userId, before.id, base);
    } catch (error) {
      console.warn('[orders] 구매 적립 실패:', id, error);
    }

    /*
     * ★ 추천으로 가입한 회원이면 "첫 구매" 실적을 남깁니다.
     *   적립과 같은 시점(배송완료·구매확정)에 처리합니다.
     *   주문 즉시 인정하면 취소·반품 때 되돌릴 일이 훨씬 복잡해집니다.
     *   실적이 늘면 추천인의 목표가 채워졌는지도 여기서 함께 확인합니다.
     */
    try {
      await markFirstPurchase(before.userId, before.id);
    } catch (error) {
      console.warn('[orders] 추천 첫 구매 기록 실패:', id, error);
    }
  }

  const after = await getOrderById(id);
  return after ?? before;
}

/** 여러 건의 상태를 한 번에 바꿉니다. 실패한 건은 건너뛰고 개수를 돌려줍니다. */
export async function bulkUpdateStatus(
  ids: string[],
  status: OrderStatus,
  memo = ''
): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await updateOrderStatus(id, status, memo);
      done += 1;
    } catch (error) {
      console.warn('[orders] 일괄 상태 변경 실패:', id, error);
      failed += 1;
    }
  }
  return { done, failed };
}

/**
 * 송장 입력.
 * ★ 송장을 넣으면 상태를 자동으로 '배송중'으로 바꿉니다.
 *   이미 배송완료·구매확정인 주문은 되돌리지 않습니다.
 */
export async function setTracking(
  id: string,
  courier: string,
  trackingNo: string
): Promise<Order> {
  const supabase = requireSupabaseAdmin();
  const before = await getOrderById(id);
  if (!before) throw new Error('주문을 찾을 수 없습니다.');

  assertWritten(
    await supabase
      .from(ORDERS)
      .update({ courier: courier || null, tracking_no: trackingNo.trim() || null })
      .eq('id', id)
      .select('id'),
    '송장을 저장하지 못했습니다'
  );

  const shouldShip =
    Boolean(trackingNo.trim()) &&
    !['shipping', 'delivered', 'confirmed', 'cancelled', 'returned'].includes(
      before.status
    );

  if (shouldShip) {
    return updateOrderStatus(id, 'shipping', `송장 등록 (${courier} ${trackingNo})`);
  }

  await addHistory(id, before.status, before.status, `송장 수정 (${courier} ${trackingNo})`);
  return (await getOrderById(id)) ?? before;
}

/** 배송지 수정 — 출고 전까지만 허용합니다. (호출부에서 상태를 먼저 확인하세요) */
export async function updateShippingAddress(
  id: string,
  patch: {
    receiverName: string;
    receiverPhone: string;
    postcode: string;
    address1: string;
    address2: string;
    deliveryMemo: string;
  }
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase
      .from(ORDERS)
      .update({
        receiver_name: patch.receiverName.trim(),
        receiver_phone: patch.receiverPhone.trim(),
        postcode: patch.postcode.trim(),
        address1: patch.address1.trim(),
        address2: patch.address2.trim() || null,
        delivery_memo: patch.deliveryMemo.trim() || null,
      })
      .eq('id', id)
      .select('id'),
    '배송지를 수정하지 못했습니다'
  );
}

export async function setAdminMemo(id: string, memo: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase
      .from(ORDERS)
      .update({ admin_memo: memo.trim() || null })
      .eq('id', id)
      .select('id'),
    '메모를 저장하지 못했습니다'
  );
}

/**
 * 부분 취소 — 품목 하나를 취소 처리하고 총액을 다시 계산합니다.
 * 실제 환불(계좌 이체)은 사람이 직접 합니다.
 */
export async function cancelOrderItem(orderId: string, itemId: string): Promise<Order> {
  const supabase = requireSupabaseAdmin();
  const order = await getOrderById(orderId);
  if (!order) throw new Error('주문을 찾을 수 없습니다.');

  const target = order.items.find((item) => item.id === itemId);
  if (!target) throw new Error('취소할 상품을 찾을 수 없습니다.');
  if (target.itemStatus === 'cancelled') return order;

  assertWritten(
    await supabase
      .from(ITEMS)
      .update({ item_status: 'cancelled' })
      .eq('id', itemId)
      .select('id'),
    '부분 취소에 실패했습니다'
  );

  // 남은 품목으로 금액을 다시 계산합니다.
  const remaining = order.items.filter(
    (item) => item.id !== itemId && item.itemStatus === 'normal'
  );
  const itemsTotal = remaining.reduce((sum, item) => sum + item.lineTotal, 0);
  // 전부 취소되면 배송비도 받지 않습니다.
  const shippingFee = remaining.length === 0 ? 0 : order.shippingFee;
  const extraShippingFee = remaining.length === 0 ? 0 : order.extraShippingFee;

  /*
   * ★★ 0원 밑으로 내려가지 않게 막습니다.
   *   쓴 포인트가 남은 상품금액보다 크면 그냥 빼기만 해서는 음수가 됩니다.
   *   예) 10,000원어치를 사면서 포인트 5,000원을 쓴 주문에서 그 상품을 취소하면
   *       0 + 0 + 0 − 5,000 = −5,000원
   *   이 음수가 주문 목록·매출 통계·CSV 내보내기에 그대로 들어갑니다.
   *
   * ★★ 할인(discount)은 줄이지 않습니다. 반드시 그대로 두어야 합니다.
   *   포인트 반환이 이 값을 읽어서 돌려줍니다.
   *     revokeOrderPoints(userId, id, before.discount)
   *   여기서 할인을 깎으면 손님이 쓴 포인트를 그만큼 못 돌려받습니다.
   *   그래서 "받을 돈" 만 0에서 멈추고, "쓴 포인트" 는 기록 그대로 둡니다.
   *   그 결과 items_total − discount 와 total_amount 가 어긋날 수 있는데,
   *   둘은 원래 다른 것을 뜻합니다. 어긋난 채로 두는 편이 맞습니다.
   */
  const totalAmount = Math.max(
    0,
    itemsTotal + shippingFee + extraShippingFee - order.discount
  );

  assertWritten(
    await supabase
      .from(ORDERS)
      .update({
        items_total: itemsTotal,
        shipping_fee: shippingFee,
        extra_shipping_fee: extraShippingFee,
        total_amount: totalAmount,
      })
      .eq('id', orderId)
      .select('id'),
    '금액을 다시 계산하지 못했습니다'
  );

  /*
   * 취소한 품목의 재고를 되돌립니다.
   * ★ 기록을 남깁니다. 이 되돌림이 있었기 때문에 나중에 주문 전체를 정리할 때
   *   같은 품목을 또 되돌리지 않습니다. (releaseOrderStock 이 cancelled 를 제외)
   */
  await adjustStock(
    [
      {
        productId: target.productId,
        optionKey: target.optionKey,
        quantity: target.quantity,
      },
    ],
    1
  );

  /*
   * ★ 품목 하나를 취소한 사실만 남깁니다. 상태는 아직 그대로입니다.
   *   예전에는 여기에 미리 'cancelled' 를 적어 두었는데, 실제 상태 변경은
   *   그 아래에서 따로 했습니다. 이력이 사실보다 앞서 있었습니다.
   */
  await addHistory(
    orderId,
    order.status,
    order.status,
    `부분 취소: ${target.productName}${target.optionKey ? ` (${target.optionKey})` : ''} x${target.quantity}`
  );

  /*
   * 남은 상품이 하나도 없으면 주문 전체를 취소로 바꿉니다.
   *
   * ★★ 반드시 updateOrderStatus 를 거칩니다. 상태만 직접 바꾸면 안 됩니다.
   *   예전에는 여기서 DB 를 직접 고쳤습니다.
   *     await supabase.from(ORDERS).update({ status: 'cancelled' })...
   *   그러면 updateOrderStatus 안에 있는 것들이 전부 건너뛰어집니다.
   *     · 손님이 쓴 포인트 반환    ← 돈입니다. 실제로 새고 있었습니다
   *     · 이 주문으로 준 적립 회수
   *     · 추천 첫 구매 실적 되돌리기
   *   [취소 완료] 버튼은 이미 이 함수를 거칩니다. 두 길이 달랐던 것입니다.
   *
   * ★ 재고가 두 번 돌아가지 않습니다.
   *   updateOrderStatus 안의 releaseOrderStock 은 itemStatus 가 normal 이 아닌
   *   품목을 건너뜁니다. 이 시점에는 모든 품목이 cancelled 이므로 하나도
   *   되돌리지 않습니다. 재고는 품목을 취소할 때 이미 하나씩 돌아갔습니다.
   */
  if (remaining.length === 0 && order.status !== 'cancelled') {
    return await updateOrderStatus(
      orderId,
      'cancelled',
      '모든 품목이 취소되어 주문을 취소 처리했습니다.'
    );
  }

  return (await getOrderById(orderId)) ?? order;
}

/* ==================================================================
 * KSNET 승인 결과 반영 (4-A)
 * ==================================================================
 *
 * ★ 이 구역이 4-A 의 심장입니다. 고칠 때는 반드시 아래 네 가지를 다시 확인하세요.
 *
 *   1) authyn 이 'O' 인가
 *   2) PG 가 알려 준 금액이 우리 DB 의 결제금액과 정확히 일치하는가
 *   3) PG 가 알려 준 주문번호가 우리가 보낸 주문번호와 일치하는가
 *   4) 그 주문이 이미 결제완료 상태는 아닌가 (중복 처리 방지)
 *
 *   하나라도 어긋나면 결제완료로 바꾸지 않습니다.
 *   금액이 다른 승인을 그대로 완료 처리하는 것이 가장 위험합니다.
 *
 * ★ 금액은 반드시 DB 에서 다시 읽습니다. 클라이언트가 보낸 값을 쓰지 않습니다.
 * ------------------------------------------------------------------ */

/** 승인 결과를 반영하고 나서 무슨 일이 있었는지 */
export type KsnetApplyOutcome =
  /** 결제완료로 바꿨습니다 */
  | 'paid'
  /** 이미 처리된 주문이었습니다 — 아무것도 바꾸지 않았습니다 */
  | 'already'
  /** 금액·주문번호가 어긋나 검토필요로 두었습니다 */
  | 'review'
  /** 카드사가 거절했습니다 — 주문은 결제대기 그대로입니다 */
  | 'declined';

/** 승인 결과 중 주문에 저장할 값 */
export type KsnetApprovalFacts = {
  authyn: string;
  trno: string;
  authno: string;
  amount: number | null;
  ordno: string;
  tradeAt: string;
  issuerCode: string;
  acquirerCode: string;
  installment: number | null;
  resultCode: string;
  message: string;
};

/** 승인 결과에서 주문에 그대로 옮겨 적는 칸들 */
function pgPatch(facts: KsnetApprovalFacts): Record<string, unknown> {
  return {
    pg_provider: 'ksnet',
    pg_tid: facts.trno || null,
    pg_auth_no: facts.authno || null,
    pg_trade_at: facts.tradeAt || null,
    pg_amount: typeof facts.amount === 'number' ? facts.amount : null,
    pg_issuer_code: facts.issuerCode || null,
    pg_acquirer_code: facts.acquirerCode || null,
    pg_installment: typeof facts.installment === 'number' ? facts.installment : null,
    pg_result_code: facts.resultCode || null,
    pg_message: facts.message || null,
  };
}

/**
 * 승인 결과를 주문에 반영합니다.
 *
 * @param orderNo 우리가 결제창에 넘긴 주문번호
 * @param facts   recv_post.jsp 가 돌려준 값 (이미 EUC-KR → UTF-8 변환된 상태)
 */
export async function applyKsnetApproval(
  orderNo: string,
  facts: KsnetApprovalFacts
): Promise<{ outcome: KsnetApplyOutcome; order: Order | null; reason: string }> {
  const supabase = requireSupabaseAdmin();

  const order = await getOrderByNo(orderNo);
  if (!order) {
    return { outcome: 'review', order: null, reason: `주문번호 ${orderNo} 를 찾지 못했습니다.` };
  }

  /* ── 4) 중복 처리 방지 ──────────────────────────────────
   * 새로고침·뒤로가기·노티 중복으로 같은 승인이 두 번 들어올 수 있습니다.
   * 이미 결제 확인이 끝난 주문이면 아무것도 하지 않고 조용히 넘어갑니다.
   * 재고·포인트를 다시 차감하면 안 됩니다. */
  if (isPaidStatus(order.status)) {
    return { outcome: 'already', order, reason: '이미 처리된 주문입니다.' };
  }

  /* ── 1) 승인 여부 ───────────────────────────────────── */
  if (facts.authyn !== 'O') {
    /*
     * 카드사가 거절했습니다. 돈은 빠져나가지 않았습니다.
     * ★ 주문 상태는 '결제대기' 그대로 둡니다.
     *   '결제실패' 로 바꿔 버리면 손님이 다시 결제할 수 없고,
     *   재고를 되돌렸다가 다시 담는 사이에 품절이 날 수 있습니다.
     *   거절 사유만 남기고 손님이 다시 시도할 수 있게 둡니다.
     */
    await supabase
      .from(ORDERS)
      .update(pgPatch(facts))
      .eq('id', order.id)
      .eq('status', 'pending_payment');

    await addHistory(
      order.id,
      order.status,
      order.status,
      `카드 결제 거절 (${facts.authno || facts.resultCode || '코드없음'}) ${facts.message}`.trim()
    );

    return {
      outcome: 'declined',
      order,
      reason: facts.message || '카드사가 결제를 거절했습니다.',
    };
  }

  /* ── 2) 금액 대조 · 3) 주문번호 대조 ─────────────────
   * ★ 여기가 가장 위험한 자리입니다.
   *   금액이 다른 승인을 완료로 넘기면 물건만 나가고 돈은 덜 들어옵니다. */
  const problems: string[] = [];
  if (facts.amount !== order.totalAmount) {
    problems.push(
      `승인 금액(${facts.amount ?? '없음'})이 주문 금액(${order.totalAmount})과 다릅니다.`
    );
  }
  if (facts.ordno && facts.ordno !== order.orderNo) {
    problems.push(`승인 주문번호(${facts.ordno})가 우리 주문번호(${order.orderNo})와 다릅니다.`);
  }

  if (problems.length > 0) {
    const reason = problems.join(' ');
    /*
     * ★ 절대 결제완료로 바꾸지 않습니다.
     *   승인은 이미 났을 수 있으므로 '결제실패' 도 아닙니다.
     *   사람이 KSNET 거래내역과 대조해야 하는 '검토필요' 로 둡니다.
     *
     * ★ 여기서도 상태 조건을 붙입니다.
     *   0건이면 그 사이 다른 요청이 먼저 처리한 것입니다. 중복이므로
     *   이력을 또 남기지 않고 조용히 넘어갑니다.
     *   (assertWritten 을 쓰면 이 경우에 예외가 나고, 호출부가 그것을
     *    "승인 확인 실패" 로 잘못 알아듣습니다)
     */
    const marked = await supabase
      .from(ORDERS)
      .update({ ...pgPatch(facts), status: 'payment_review' })
      .eq('id', order.id)
      .eq('status', 'pending_payment')
      .select('id');

    if (marked.error) {
      throw new Error(`검토필요로 바꾸지 못했습니다: ${marked.error.message}`);
    }
    if (!marked.data || marked.data.length === 0) {
      return {
        outcome: 'already',
        order: await getOrderById(order.id),
        reason: '다른 요청이 먼저 처리했습니다.',
      };
    }

    await addHistory(order.id, order.status, 'payment_review', `금액·주문번호 불일치 — ${reason}`);

    return { outcome: 'review', order: await getOrderById(order.id), reason };
  }

  /* ── 전부 통과 — 결제완료로 ──────────────────────────
   * ★ 상태 조건을 붙여 갱신합니다. (DB 수준의 조건부 갱신)
   *   같은 승인이 동시에 두 번 들어와도 한 번만 통과합니다.
   *   조건을 빼고 갱신하면 두 요청이 모두 "내가 바꿨다" 고 여겨
   *   알림이 두 번 가고 이후 처리도 두 번 돕니다. */
  const claimed = await supabase
    .from(ORDERS)
    .update({
      ...pgPatch(facts),
      status: 'paid',
      paid_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('status', 'pending_payment')
    .select('id');

  if (claimed.error) {
    throw new Error(`결제완료로 바꾸지 못했습니다: ${claimed.error.message}`);
  }

  // 0건이면 그 사이 다른 요청이 먼저 처리한 것입니다. 중복이므로 조용히 넘어갑니다.
  if (!claimed.data || claimed.data.length === 0) {
    return {
      outcome: 'already',
      order: await getOrderById(order.id),
      reason: '다른 요청이 먼저 처리했습니다.',
    };
  }

  await addHistory(
    order.id,
    order.status,
    'paid',
    `카드 결제 승인 (승인번호 ${facts.authno} · 거래번호 ${facts.trno})`
  );

  return { outcome: 'paid', order: await getOrderById(order.id), reason: '' };
}

/**
 * 승인 확인 자체를 못 했을 때 — '승인확인실패' 로 둡니다.
 *
 * ★ 절대 '결제실패' 로 두지 마세요.
 *   실제로는 승인이 났는데 우리만 모르는 상황일 수 있습니다.
 *   그 상태에서 손님에게 "실패했으니 다시 결제하세요" 라고 하면 이중결제가 납니다.
 * ★ 이미 결제 처리가 끝난 주문이면 건드리지 않습니다.
 */
/**
 * ★ 4-B — 돌려주는 값이 바뀌었습니다.
 *   "정말로 이번에 상태를 바꿨는지" 를 호출부가 알아야 합니다.
 *   자동정리는 실제로 바뀐 건만 세고 알려야 하는데, 예전처럼 주문만 돌려주면
 *   이미 승인확인실패였던 주문까지 매번 새로 처리한 것으로 세게 됩니다.
 */
export async function markPaymentUnconfirmed(
  orderNo: string,
  reason: string
): Promise<{ moved: boolean; order: Order | null }> {
  const supabase = requireSupabaseAdmin();

  const order = await getOrderByNo(orderNo);
  if (!order) return { moved: false, order: null };
  if (isPaidStatus(order.status)) return { moved: false, order };

  const { data, error } = await supabase
    .from(ORDERS)
    .update({ status: 'payment_unconfirmed', pg_provider: 'ksnet', pg_message: reason || null })
    .eq('id', order.id)
    .eq('status', 'pending_payment')
    .select('id');

  if (error) {
    console.error('[orders] 승인확인실패 처리 실패:', error.message);
    return { moved: false, order };
  }
  // 0건이면 그 사이 다른 요청이 먼저 처리했습니다.
  if (!data || data.length === 0) {
    return { moved: false, order: await getOrderById(order.id) };
  }

  await addHistory(order.id, order.status, 'payment_unconfirmed', `승인 확인 실패 — ${reason}`);
  return { moved: true, order: await getOrderById(order.id) };
}

/* ------------------------------------------------------------------
 * 취소 (4-A)
 * ------------------------------------------------------------------
 * ★ KSNET 은 가맹점에 취소 API 권한을 주지 않습니다.
 *   실제 환불은 대행사를 통해 사람이 처리하고 며칠이 걸립니다.
 *   그래서 "요청 접수" 와 "환불 완료" 를 반드시 나눕니다.
 *   버튼 하나로 바로 취소완료가 되게 만들면
 *   "취소했다고 했는데 돈이 안 들어온다" 는 분쟁이 반드시 납니다.
 * ------------------------------------------------------------------ */

/** 취소 요청 접수 — 아직 환불되지 않았습니다. 재고도 되돌리지 않습니다. */
export async function requestOrderCancel(id: string, memo: string): Promise<Order> {
  const supabase = requireSupabaseAdmin();
  const before = await getOrderById(id);
  if (!before) throw new Error('주문을 찾을 수 없습니다.');
  if (before.status === 'cancelled') {
    throw new Error('이미 취소가 끝난 주문입니다.');
  }

  assertWritten(
    await supabase
      .from(ORDERS)
      .update({
        status: 'cancel_requested',
        cancel_requested_at: new Date().toISOString(),
        cancel_memo: memo.trim() || null,
      })
      .eq('id', id)
      .select('id'),
    '취소 요청을 접수하지 못했습니다'
  );

  await addHistory(id, before.status, 'cancel_requested', memo.trim() || '취소 요청 접수');
  return (await getOrderById(id)) ?? before;
}

/**
 * 취소 완료 — 실제 환불까지 끝났을 때만 누르는 버튼입니다.
 * 재고와 사용 포인트는 updateOrderStatus 가 되돌립니다.
 */
export async function completeOrderCancel(id: string, memo: string): Promise<Order> {
  const supabase = requireSupabaseAdmin();
  const before = await getOrderById(id);
  if (!before) throw new Error('주문을 찾을 수 없습니다.');
  if (before.status === 'cancelled') return before;

  // 취소 처리일과 메모를 먼저 남깁니다. 상태 변경이 실패해도 기록은 남습니다.
  await supabase
    .from(ORDERS)
    .update({
      cancel_done_at: new Date().toISOString(),
      cancel_memo: memo.trim() || before.cancelMemo || null,
    })
    .eq('id', id);

  // ★ 재고 되돌리기·포인트 반환은 updateOrderStatus 안에 이미 있습니다.
  //   같은 로직을 여기서 다시 쓰면 언젠가 어긋납니다.
  return await updateOrderStatus(id, 'cancelled', memo.trim() || '환불 완료');
}

/**
 * 현금영수증 발급 완료 표시 (4-A).
 * ★ PG 가 현금영수증을 지원하지 않아 운영자가 홈택스에서 직접 발급합니다.
 *   여기 체크는 "발급했다" 는 기록일 뿐, 실제 발급과는 무관합니다.
 */
export async function setCashReceiptIssued(id: string, issued: boolean): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase
      .from(ORDERS)
      .update({
        cash_receipt_issued: issued,
        cash_receipt_issued_at: issued ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('id'),
    '현금영수증 발급 표시를 바꾸지 못했습니다'
  );
}

/** 손님의 취소 요청 — 상태는 바꾸지 않고 이력에만 남깁니다. */
export async function requestCancel(orderId: string, reason: string): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('주문을 찾을 수 없습니다.');
  await addHistory(
    orderId,
    order.status,
    order.status,
    `[손님 취소 요청] ${reason.trim() || '사유 미입력'}`
  );
}

/* ------------------------------------------------------------------
 * 통계
 * ------------------------------------------------------------------ */

/** 상태별 건수. 목록 탭의 뱃지와 대시보드 카드에 씁니다. */
/**
 * 상태별 주문 건수.
 *
 * ★ 예전에는 status 컬럼 전체를 가져와 세었습니다.
 *   주문이 쌓일수록 전송량이 계속 늘어납니다.
 *   지금은 상태마다 count 쿼리를 던지고 한 번에 기다립니다. (행을 가져오지 않습니다)
 */
export async function countOrdersByStatus(): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};

  const results = await Promise.all(
    ORDER_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from(ORDERS)
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      return { status, count: error ? 0 : (count ?? 0) };
    })
  );

  const result: Record<string, number> = {};
  for (const row of results) {
    if (row.count > 0) result[row.status] = row.count;
  }
  return result;
}

/** 사이드바 뱃지에 쓰는 입금대기 건수 */
export async function countPendingPayment(): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from(ORDERS)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_payment');
  if (error) return 0;
  return count ?? 0;
}

/** 여러 상태를 한 번에 세는 공통부 */
async function countByStatuses(statuses: string[]): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from(ORDERS)
    .select('id', { count: 'exact', head: true })
    .in('status', statuses);
  if (error) return 0;
  return count ?? 0;
}

/**
 * 사람이 확인해야 하는 주문 수 — 승인확인실패 + 검토필요.
 * ★ 돈이 오갔는지 우리가 모르는 주문입니다. 사이드바 뱃지로 매일 눈에 띄어야 합니다.
 */
export async function countNeedsCheck(): Promise<number> {
  return countByStatuses(NEEDS_CHECK_STATUSES);
}

/** 아직 안 보낸 주문 수 — 결제완료 + 상품준비중 */
export async function countUnshipped(): Promise<number> {
  return countByStatuses(UNSHIPPED_STATUSES);
}

/** 기간 내 매출 합계 — 취소·반품·결제실패는 빼고 셉니다. */
async function sumAmount(fromIso: string, toIso: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from(ORDERS)
    .select('total_amount, status')
    .gte('created_at', fromIso)
    .lte('created_at', toIso);
  if (error || !data) return 0;

  return (data as { total_amount: number; status: string }[])
    .filter((row) => isSalesStatus(row.status))
    .reduce((sum, row) => sum + (row.total_amount ?? 0), 0);
}

/**
 * 대시보드 숫자.
 * ★ 데이터가 하나도 없어도 화면이 깨지지 않게 전부 0 으로 돌려줍니다.
 */
export async function getDashboardStats(now = new Date()): Promise<DashboardStats> {
  const empty: DashboardStats = {
    todayAmount: 0,
    yesterdayAmount: 0,
    monthAmount: 0,
    lastMonthAmount: 0,
    todayCount: 0,
    pendingPaymentCount: 0,
    unshippedCount: 0,
    countByStatus: {},
    recentOrders: [],
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const today = kstToday(now);
  const yesterday = kstDaysAgo(1, now);

  // 이번 달 · 지난 달 (한국 시간 기준)
  const [year, month] = today.split('-').map(Number);
  const monthStart = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const lastMonthYear = month === 1 ? year - 1 : year;
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastMonthStart = `${String(lastMonthYear).padStart(4, '0')}-${String(lastMonth).padStart(2, '0')}-01`;
  // 지난 달의 마지막 날 = 이번 달 1일의 하루 전
  const lastMonthEnd = new Date(new Date(`${monthStart}T00:00:00+09:00`).getTime() - 1000);
  const lastMonthEndDay = kstToday(lastMonthEnd);

  try {
    const [
      todayAmount,
      yesterdayAmount,
      monthAmount,
      lastMonthAmount,
      todayCountResult,
      countByStatus,
      recent,
    ] = await Promise.all([
      sumAmount(kstStart(today), kstEnd(today)),
      sumAmount(kstStart(yesterday), kstEnd(yesterday)),
      sumAmount(kstStart(monthStart), kstEnd(today)),
      sumAmount(kstStart(lastMonthStart), kstEnd(lastMonthEndDay)),
      supabase
        .from(ORDERS)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', kstStart(today))
        .lte('created_at', kstEnd(today)),
      countOrdersByStatus(),
      getOrders({ limit: 10 }),
    ]);

    const unshippedCount = UNSHIPPED_STATUSES.reduce(
      (sum, status) => sum + (countByStatus[status] ?? 0),
      0
    );

    return {
      todayAmount,
      yesterdayAmount,
      monthAmount,
      lastMonthAmount,
      todayCount: todayCountResult.count ?? 0,
      pendingPaymentCount: countByStatus.pending_payment ?? 0,
      unshippedCount,
      countByStatus,
      recentOrders: recent.orders,
    };
  } catch (error) {
    console.warn('[orders] 대시보드 집계 실패:', error);
    return empty;
  }
}

/** 상태 문자열을 안전하게 OrderStatus 로 바꿉니다. */
export function toOrderStatus(value: string): OrderStatus | null {
  return isOrderStatus(value) ? value : null;
}

/* ------------------------------------------------------------------
 * 입금대기 자동취소 (3-C)
 * ------------------------------------------------------------------ */

/**
 * 자동취소에서 제외되는 조건.
 *
 * ★ JZL CLOSET 은 위탁배송 구조입니다.
 *   공급처(뉴욕트렌딕)에 이미 발송 요청이 나간 건을 자동으로 취소하면
 *   물건은 가는데 주문은 없어지는 배송 사고가 납니다.
 *   아래에 해당하면 건드리지 않고 관리자가 직접 처리하게 둡니다.
 */
export function isAutoCancelExempt(order: Order): boolean {
  // 1) 관리자가 직접 제외 표시를 한 주문
  if (order.autoCancelExcluded) return true;
  // 2) 송장번호가 들어간 주문 — 이미 발송된 것으로 봅니다
  if (order.trackingNo.trim()) return true;
  // 3) 관리자 메모에 발송요청 표시가 있는 주문
  if (/발송\s*요청|출고\s*요청/.test(order.adminMemo)) return true;
  return false;
}

export type AutoCancelResult = {
  /** 실제로 취소한 주문 */
  cancelled: Order[];
  /** 기한은 지났지만 제외 조건에 걸려 남겨 둔 주문 수 */
  skipped: number;
};

/**
 * 입금 기한이 지난 '입금대기' 주문을 취소합니다.
 *
 * ★ 상태 변경은 updateOrderStatus 를 그대로 씁니다.
 *   재고 되돌리기 · 사용 포인트 반환 · 상태 이력 남기기가 이미 그 안에 있습니다.
 *   같은 로직을 여기서 다시 쓰면 언젠가 어긋납니다.
 * ★ 적립 예정 포인트는 배송완료 시점에 지급하므로 이 단계에서는 나간 적이 없습니다.
 *   (그래도 updateOrderStatus 가 회수까지 확인합니다)
 *
 * @param hours 입금 기한(시간). 관리자 설정의 depositHours 를 넘깁니다.
 * @param limit 한 번에 처리할 최대 건수. 폭주를 막기 위한 안전장치입니다.
 */
export async function autoCancelUnpaidOrders(
  hours: number,
  limit = 50
): Promise<AutoCancelResult> {
  const empty: AutoCancelResult = { cancelled: [], skipped: 0 };

  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;
  if (!Number.isFinite(hours) || hours < 1) return empty;

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  /*
   * ★ 후보만 가볍게 뽑습니다. select('*') 로 전체를 끌어오지 않습니다.
   *
   * ★★ 무통장입금 주문만 자동취소합니다. (4-A)
   *   카드·간편결제 주문은 절대 자동으로 취소하지 마세요.
   *   손님이 결제를 마쳤는데 우리가 승인 결과를 못 받은 경우가 있을 수 있습니다.
   *   그 주문을 자동으로 취소해 버리면 돈은 빠져나갔는데 주문은 사라집니다.
   *   손님은 결제했다고 하고 우리 기록에는 없는, 가장 풀기 어려운 분쟁이 됩니다.
   *   카드 주문이 결제대기로 남아 있으면 관리자가 직접 확인하고 처리합니다.
   */
  const { data, error } = await supabase
    .from(ORDERS)
    .select('id')
    .eq('status', 'pending_payment')
    .eq('payment_method', 'bank_transfer')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data || data.length === 0) return empty;

  const result: AutoCancelResult = { cancelled: [], skipped: 0 };

  for (const row of data as { id: string }[]) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const order = await getOrderById(row.id);
      if (!order || order.status !== 'pending_payment') continue;

      if (isAutoCancelExempt(order)) {
        result.skipped += 1;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const cancelled = await updateOrderStatus(order.id, 'cancelled', '미입금 자동취소');
      result.cancelled.push(cancelled);
    } catch (error) {
      // 한 건이 실패해도 나머지는 계속 처리합니다.
      console.warn('[orders] 자동취소 실패:', row.id, error);
    }
  }

  return result;
}

/**
 * ============================================================
 * 결제대기로 오래 남은 카드·간편결제 주문 찾기 (4-B)
 * ============================================================
 *
 * ★★ 무통장입금은 여기에 들어오지 않습니다.
 *   그쪽은 autoCancelUnpaidOrders 가 지금까지 하던 대로 처리합니다.
 *   두 흐름을 섞으면 한쪽을 고칠 때 다른 쪽이 조용히 바뀝니다.
 *
 * ★ 여기서는 찾기만 합니다. 어떻게 할지는 lib/card-sweep.ts 가 정합니다.
 *   찾은 주문을 바로 정리하면 안 됩니다. KSNET 에 승인 여부를 먼저 물어야 합니다.
 */
export async function findStalePendingCardOrders(
  minutes: number,
  limit = 30
): Promise<Order[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  if (!Number.isFinite(minutes) || minutes < 1) return [];

  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  /*
   * ★ 후보 id 만 가볍게 뽑습니다. select(*) 로 전체를 끌어오지 않습니다.
   * ★ neq(bank_transfer) 로 무통장입금을 확실히 제외합니다.
   *   isPgMethod 로 코드에서 거르면, 나중에 결제수단이 늘 때 이 조건이
   *   조용히 어긋납니다. DB 조건에 직접 박아 둡니다.
   */
  const { data, error } = await supabase
    .from(ORDERS)
    .select('id')
    .eq('status', 'pending_payment')
    .neq('payment_method', 'bank_transfer')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data || data.length === 0) return [];

  const orders: Order[] = [];
  for (const row of data as { id: string }[]) {
    // eslint-disable-next-line no-await-in-loop
    const order = await getOrderById(row.id);
    // 그 사이 상태가 바뀌었으면 건드리지 않습니다.
    if (order && order.status === 'pending_payment') orders.push(order);
  }
  return orders;
}

/**
 * ============================================================
 * 자정 점검용 — 오늘 것과 어제 이전 것을 갈라 돌려줍니다 (4-B)
 * ============================================================
 *
 * ★★ 왜 나누는가
 *   승인 재조회는 당일에 한해 가능합니다.
 *     오늘 들어온 건   → 아직 물어볼 수 있습니다
 *     어제 이전 건     → 이미 물어볼 수 없습니다
 *   처리 방법이 완전히 다르므로 조회 단계에서 갈라 둡니다.
 *
 * ★ "오늘" 은 한국 시간 기준입니다. 서버는 UTC 로 돕니다.
 *   UTC 기준으로 자르면 한국 시간 오전 9시에 날짜가 바뀌어,
 *   그날 새벽 주문이 "어제 것" 으로 잘못 분류됩니다.
 */
export async function findTodayPendingCardOrders(
  limit = 100
): Promise<{ today: Order[]; older: Order[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { today: [], older: [] };

  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const midnightKst = Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate()
  ) - KST_OFFSET;
  const boundary = new Date(midnightKst).toISOString();

  const { data, error } = await supabase
    .from(ORDERS)
    .select('id, created_at')
    .eq('status', 'pending_payment')
    .neq('payment_method', 'bank_transfer')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data) return { today: [], older: [] };

  const today: Order[] = [];
  const older: Order[] = [];
  for (const row of data as { id: string; created_at: string }[]) {
    // eslint-disable-next-line no-await-in-loop
    const order = await getOrderById(row.id);
    if (!order || order.status !== 'pending_payment') continue;
    if (row.created_at >= boundary) today.push(order);
    else older.push(order);
  }
  return { today, older };
}

/**
 * 카드 주문을 결제실패로 정리합니다. (4-B)
 *
 * ★ 조건부 UPDATE 입니다. 결제대기일 때만 바뀝니다.
 *   그 사이 승인이 들어와 결제완료가 되었다면 아무 일도 하지 않습니다.
 *   이 한 줄이 "결제한 손님의 주문이 사라지는" 사고를 막습니다.
 *
 * ★ 재고·포인트 되돌림은 updateOrderStatus 안에서 일어납니다.
 *   (isStockReleasing 에 failed 가 들어 있고, releaseOrderStock 이 한 번만 통과시킵니다)
 *
 * @returns 이번 호출이 실제로 바꿨는지
 */
export async function failPendingCardOrder(
  order: Order,
  memo: string
): Promise<boolean> {
  const supabase = requireSupabaseAdmin();

  const claimed = await supabase
    .from(ORDERS)
    .update({ status: 'failed' })
    .eq('id', order.id)
    .eq('status', 'pending_payment')
    .select('id');

  if (claimed.error) {
    throw new Error(`결제실패로 바꾸지 못했습니다: ${claimed.error.message}`);
  }
  // 0건이면 그 사이 다른 요청이 먼저 처리했습니다. 건드리지 않습니다.
  if (!claimed.data || claimed.data.length === 0) return false;

  await addHistory(order.id, order.status, 'failed', memo);

  // 재고를 돌려놓습니다. 두 번 되돌지 않도록 DB 가 막습니다.
  await releaseOrderStock(order, memo);

  /*
   * ★ 쓴 포인트도 돌려줍니다.
   *   updateOrderStatus 를 거치지 않고 상태를 직접 바꿨으므로 여기서 부릅니다.
   *   (상태를 조건부로 잡아야 해서 updateOrderStatus 를 쓸 수 없었습니다)
   */
  if (order.userId) {
    try {
      await revokeOrderPoints(order.userId, order.id, order.discount);
    } catch (error) {
      console.warn('[orders] 결제실패 포인트 되돌림 실패:', order.id, error);
    }
  }

  return true;
}

/**
 * ============================================================
 * 결제 Key 를 주문에 적어 둡니다 (4-B)
 * ============================================================
 *
 * ★★ 왜 필요한가
 *   승인 재조회(recv_post.jsp · sndActionType=1)는 결제 Key 로만 됩니다.
 *   주문번호로는 물어볼 수 없습니다.
 *   4-A 는 이 값을 결제창 복귀 시점에 받아 승인 확인에만 쓰고 버렸습니다.
 *   그래서 손님이 결제창을 닫고 나간 주문은 나중에 확인할 방법이 없었습니다.
 *
 * ★ 승인 확인보다 먼저 부릅니다.
 *   승인 확인이 통신 오류로 실패하더라도 열쇠는 남아야 합니다.
 *   그래야 10분 뒤 정리 작업이 다시 물어볼 수 있습니다.
 *
 * ★ 실패해도 결제 처리를 막지 않습니다. 칸이 아직 없는 환경도 있습니다.
 */
export async function saveKsnetPaymentKey(
  orderNo: string,
  commConId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !orderNo || !commConId) return;

  const { error } = await supabase
    .from(ORDERS)
    .update({ pg_comm_con_id: commConId, pg_provider: 'ksnet' })
    .eq('order_no', orderNo);

  if (error) {
    if (isMissingColumn(error)) {
      console.warn(
        '[orders] pg_comm_con_id 칸이 없습니다. supabase/schema-4b.sql 을 실행해 주세요.'
      );
      return;
    }
    console.warn('[orders] 결제 Key 를 저장하지 못했습니다:', orderNo, error.message);
  }
}

/**
 * 자동정리 알림을 이번에 보내도 되는지 묻고, 되면 자리를 잡습니다.
 *
 * ★★ 카드 정리는 10분마다 돕니다. 표시가 없으면 같은 주문으로 하루 144번
 *   알림이 갑니다. 알림이 잦으면 정작 중요한 것을 놓칩니다.
 * ★ 비어 있을 때만 채우는 조건부 UPDATE 라, 동시에 두 번 돌아도 하나만 통과합니다.
 * ★ 칸이 없으면(SQL 미실행) 그냥 보냅니다. 못 보내는 것보다 낫습니다.
 *
 * @returns 이번에 알려도 되는지
 */
export async function claimSweepNotice(orderId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const claim = await supabase
    .from(ORDERS)
    .update({ sweep_notified_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('sweep_notified_at', null)
    .select('id');

  if (claim.error) {
    if (isMissingColumn(claim.error)) return true;
    console.warn('[orders] 알림 표시를 남기지 못했습니다:', claim.error.message);
    return true;
  }
  return Boolean(claim.data && claim.data.length > 0);
}

/** 관리자 주문 상세의 '자동취소 제외' 토글 */
export async function setAutoCancelExcluded(
  id: string,
  excluded: boolean
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase
      .from(ORDERS)
      .update({ auto_cancel_excluded: excluded })
      .eq('id', id)
      .select('id'),
    '자동취소 제외 설정을 바꾸지 못했습니다'
  );
}

/**
 * 입금 기한 시각.
 * ★ 주문 완료 화면·마이페이지·텔레그램이 모두 이 함수를 씁니다.
 *   각자 계산하면 언젠가 한 곳만 어긋납니다.
 */
export function depositDeadline(createdAt: string | null, hours: number): Date | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return new Date(created.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
}

/* ------------------------------------------------------------------
 * 주문자 목록 (3-C)
 * ------------------------------------------------------------------ */

export type OrdererSummary = {
  /** 이름+연락처를 합친 식별자. 비회원도 같은 사람으로 묶입니다. */
  key: string;
  name: string;
  phone: string;
  email: string;
  /** 회원이면 회원 id. 여러 번 중 한 번이라도 회원이면 채워집니다. */
  userId: string | null;
  orderCount: number;
  /** 취소·반품·실패를 뺀 실매출 합계 */
  totalAmount: number;
  cancelledCount: number;
  lastOrderedAt: string | null;
};

/** 매출에서 빼는 상태 — 통계와 같은 기준입니다. */
// 목록은 lib/order-status.ts 의 NON_SALES_STATUSES 하나만 씁니다.

/**
 * 주문자별 요약.
 *
 * ★ 회원 목록은 가입한 사람만 보여 줍니다. 비회원 주문이 그대로 유지되는 구조라
 *   "누가 얼마나 샀는지" 를 보려면 주문 쪽에서 묶어야 합니다.
 * ★ 필요한 컬럼만 한 번에 읽고 메모리에서 묶습니다. 조회는 한 번뿐입니다.
 */
export async function getOrdererSummaries(
  limit = 500
): Promise<OrdererSummary[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(ORDERS)
    .select(
      'user_id, orderer_name, orderer_phone, orderer_email, total_amount, status, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(4000);

  if (error || !data) return [];

  type Row = {
    user_id: string | null;
    orderer_name: string | null;
    orderer_phone: string | null;
    orderer_email: string | null;
    total_amount: number | null;
    status: string;
    created_at: string | null;
  };

  const map = new Map<string, OrdererSummary>();

  for (const row of data as Row[]) {
    const name = (row.orderer_name ?? '').trim();
    const phone = (row.orderer_phone ?? '').replace(/[^0-9]/g, '');
    // 회원이면 회원 id 로, 비회원이면 이름+연락처로 묶습니다.
    const key = row.user_id ?? `${name}:${phone}`;
    if (!key.trim() || key === ':') continue;

    const current =
      map.get(key) ??
      ({
        key,
        name,
        phone: (row.orderer_phone ?? '').trim(),
        email: (row.orderer_email ?? '').trim(),
        userId: row.user_id,
        orderCount: 0,
        totalAmount: 0,
        cancelledCount: 0,
        lastOrderedAt: null,
      } satisfies OrdererSummary);

    current.orderCount += 1;
    if (!isSalesStatus(row.status)) {
      current.cancelledCount += 1;
    } else {
      current.totalAmount += row.total_amount ?? 0;
    }
    if (!current.userId && row.user_id) current.userId = row.user_id;
    if (!current.email && row.orderer_email) current.email = row.orderer_email.trim();
    // 목록을 최신순으로 읽었으므로 처음 만난 값이 가장 최근입니다.
    if (!current.lastOrderedAt) current.lastOrderedAt = row.created_at;

    map.set(key, current);
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);
}

/**
 * ============================================================
 * 사람이 확인한 결론을 확정합니다 (4-B)
 * ============================================================
 *
 * ★★ 자동으로는 결론을 내지 않는 두 상태를 마무리하는 자리입니다.
 *     payment_unconfirmed  승인 여부를 우리가 모릅니다
 *     payment_review       승인은 났는데 금액·주문번호가 우리 기록과 다릅니다
 *   운영자가 KSNET 거래내역에서 확인한 뒤에만 부릅니다.
 *
 * ★ 이 함수는 우리 기록만 바꿉니다. 실제 승인·취소는 일어나지 않습니다.
 *   KSNET 은 가맹점에 취소 권한을 주지 않습니다.
 *
 * ★★ 결제완료로 확정할 때 재고를 다시 깎지 않습니다.
 *   주문을 만들 때 이미 깎았습니다. 다만 그 사이 자동정리가 재고를 되돌렸다면
 *   지금 다시 잡아야 합니다. 그 판단은 stock_released_at 으로 합니다.
 *
 * ★★ 결제실패로 확정할 때는 아직 안 돌아온 재고만 되돌립니다.
 *   releaseOrderStock 이 DB 에서 한 번만 통과시키므로 두 번 돌아가지 않습니다.
 */
export async function confirmUncertainPayment(
  id: string,
  decision: 'paid' | 'failed'
): Promise<{ order: Order; shortages: StockShortage[] }> {
  const supabase = requireSupabaseAdmin();
  const before = await getOrderById(id);
  if (!before) throw new Error('주문을 찾을 수 없습니다.');

  if (before.status !== 'payment_unconfirmed' && before.status !== 'payment_review') {
    throw new Error(
      `확인이 필요한 주문이 아닙니다. (지금 상태: ${statusLabel(before.status)})`
    );
  }

  if (decision === 'paid') {
    /*
     * ★ 자동정리가 재고를 되돌려 두었다면 다시 잡아야 합니다.
     *   되돌린 뒤 그 물건이 팔렸을 수도 있으므로, 재고가 모자라도 막지 않고
     *   깎기만 합니다. (0 밑으로는 내려가지 않습니다)
     *   운영자는 이미 승인을 확인하고 누른 것이라 주문을 되돌릴 수 없습니다.
     *   재고가 모자라면 그건 사람이 공급처와 풀어야 할 문제입니다.
     */
    let shortages: StockShortage[] = [];
    if (before.stockReleasedAt) {
      shortages = await adjustStock(
        before.items
          .filter((item) => item.itemStatus === 'normal')
          .map((item) => ({
            productId: item.productId,
            productSlug: item.productSlug,
            optionKey: item.optionKey,
            quantity: item.quantity,
          })),
        -1,
        {
          orderId: before.id,
          orderNo: before.orderNo,
          reason: '승인 확인 후 결제완료로 확정 — 되돌렸던 재고를 다시 잡음',
        },
        /*
         * ★★ 이 자리만 재고가 모자라도 막지 않습니다.
         *   주문 접수는 모자라면 통째로 실패하지만, 여기는 이미 카드 승인이
         *   난 뒤입니다. 손님 돈이 빠져나간 상태라 주문을 되돌릴 수 없습니다.
         *   0 에서 멈추고 부족분을 돌려받아 사람에게 알립니다.
         */
        true
      );
      await supabase.from(ORDERS).update({ stock_released_at: null }).eq('id', id);
    }

    assertWritten(
      await supabase
        .from(ORDERS)
        .update({ status: 'paid', paid_at: before.paidAt ?? new Date().toISOString() })
        .eq('id', id)
        .select('id'),
      '결제완료로 바꾸지 못했습니다'
    );
    /* ★ 알림·화면·이력에 쓰려고 상품명을 채워 둡니다. slug+옵션으로 주문 품목과 맞춥니다. */
    shortages = shortages.map((x) => ({
      ...x,
      productName:
        before.items.find(
          (item) => item.productSlug === x.productSlug && item.optionKey === x.optionKey
        )?.productName ?? x.productSlug ?? '(상품 이름 없음)',
    }));

    /*
     * ★ 재고가 모자랐다면 이력에도 남깁니다.
     *   나중에 "왜 재고가 0인데 준비 중이지" 를 되짚는 유일한 단서입니다.
     *   상품명까지 적습니다. 옵션 키만 적으면 어느 상품인지 알 수 없습니다.
     */
    const shortageNote =
      shortages.length > 0
        ? ` (재고 부족 — ${shortages
            .map(
              (x) =>
                `${x.productName ?? x.productSlug}${x.optionKey ? ` (${x.optionKey})` : ''} ${x.wanted}개 필요 · ${x.available}개만 있었음`
            )
            .join(', ')})`
        : '';

    await addHistory(
      id,
      before.status,
      'paid',
      `운영자가 KSNET 거래내역에서 승인을 확인하고 결제완료로 확정했습니다.${shortageNote}`
    );
    return { order: (await getOrderById(id)) as Order, shortages };
  }

  /* ── 결제실패로 확정 ── */
  assertWritten(
    await supabase.from(ORDERS).update({ status: 'failed' }).eq('id', id).select('id'),
    '결제실패로 바꾸지 못했습니다'
  );
  await addHistory(
    id,
    before.status,
    'failed',
    '운영자가 KSNET 거래내역에서 승인이 없음을 확인하고 결제실패로 확정했습니다.'
  );

  // 아직 안 돌아온 재고만 되돌립니다. (DB 가 두 번 되돌리지 않게 막습니다)
  await releaseOrderStock(before, '운영자가 결제실패로 확정');

  // 쓴 포인트도 돌려줍니다.
  if (before.userId) {
    try {
      await revokeOrderPoints(before.userId, before.id, before.discount);
    } catch (error) {
      console.warn('[orders] 확정 후 포인트 되돌림 실패:', id, error);
    }
  }

  return { order: (await getOrderById(id)) as Order, shortages: [] };
}
