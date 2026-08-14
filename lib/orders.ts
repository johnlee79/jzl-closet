import 'server-only';

import {
  UNSHIPPED_STATUSES,
  isOrderStatus,
  isStockReleasing,
  type OrderStatus,
} from '@/lib/order-status';
import { isCombinationAvailable } from '@/lib/product-utils';
import { normalizeOptions } from '@/lib/products';
import { getPaymentSettings, getShippingSettings } from '@/lib/settings';
import { isRemoteArea } from '@/lib/site-config';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';
import { getBrands } from '@/lib/taxonomy';
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
  courier: string | null;
  tracking_no: string | null;
  admin_memo: string | null;
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
    pgProvider: row.pg_provider,
    pgTid: row.pg_tid,
    paidAt: row.paid_at,
    courier: row.courier ?? '',
    trackingNo: row.tracking_no ?? '',
    adminMemo: row.admin_memo ?? '',
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
    // 같은 조건을 두 번 겁니다. (건수용 · 목록용)
    let countQuery = supabase.from(ORDERS).select('id', { count: 'exact', head: true });
    if (filter.status && filter.status !== 'all') {
      countQuery = countQuery.eq('status', filter.status);
    }
    if (filter.from) countQuery = countQuery.gte('created_at', kstStart(filter.from));
    if (filter.to) countQuery = countQuery.lte('created_at', kstEnd(filter.to));
    if (searchExpression) countQuery = countQuery.or(searchExpression);

    let listQuery = supabase.from(ORDERS).select('*');
    if (filter.status && filter.status !== 'all') {
      listQuery = listQuery.eq('status', filter.status);
    }
    if (filter.from) listQuery = listQuery.gte('created_at', kstStart(filter.from));
    if (filter.to) listQuery = listQuery.lte('created_at', kstEnd(filter.to));
    if (searchExpression) listQuery = listQuery.or(searchExpression);

    listQuery = listQuery.order('created_at', { ascending: false });
    if (filter.limit !== undefined) {
      const from = filter.offset ?? 0;
      listQuery = listQuery.range(from, from + filter.limit - 1);
    }

    const [countResult, listResult] = await Promise.all([countQuery, listQuery]);

    if (listResult.error) {
      if (!isMissingTable(listResult.error.code)) {
        console.error('[orders] 목록 조회 실패:', listResult.error.message);
      }
      return { orders: [], total: 0 };
    }

    const rows = (listResult.data ?? []) as OrderRow[];
    const itemMap = await loadItems(rows.map((row) => row.id));
    const orders = rows.map((row) => rowToOrder(row, itemMap.get(row.id) ?? []));
    return { orders, total: countResult.count ?? orders.length };
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

  let query = supabase.from(ORDERS).select('*').eq('user_id', userId);
  if (status && status !== 'all') query = query.eq('status', status);
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

/** 옵션 조합의 재고를 delta 만큼 더합니다. (주문 시 -수량, 취소 시 +수량) */
async function adjustStock(
  entries: { productId: string | null; optionKey: string; quantity: number }[],
  delta: -1 | 1
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  for (const entry of entries) {
    if (!entry.productId || !entry.optionKey) continue;

    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, options')
        .eq('id', entry.productId)
        .maybeSingle();
      if (error || !data) continue;

      const options = normalizeOptions((data as { options: unknown }).options);
      let touched = false;

      const combinations = options.combinations.map((combination) => {
        if (combination.key !== entry.optionKey) return combination;
        // ★ 재고를 관리하지 않는 조합(stock === null)은 건드리지 않습니다.
        if (combination.stock === null) return combination;
        touched = true;
        return {
          ...combination,
          stock: Math.max(0, combination.stock + delta * entry.quantity),
        };
      });

      if (!touched) continue;

      await supabase
        .from('products')
        .update({ options: { groups: options.groups, combinations } })
        .eq('id', entry.productId);
    } catch (error) {
      // 재고 반영 실패가 주문 처리를 막지 않도록 로그만 남깁니다.
      console.warn('[orders] 재고 반영 실패:', entry.productId, entry.optionKey, error);
    }
  }
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
  const discount = 0; // 쿠폰·적립금은 다음 단계입니다.
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

  await addHistory(row.id, null, 'pending_payment', '주문이 접수되었습니다.');

  // 재고 차감 — 재고를 관리하는 조합만 줄어듭니다.
  await adjustStock(
    lines.map((line) => ({
      productId: line.productId,
      optionKey: line.optionKey,
      quantity: line.quantity,
    })),
    -1
  );

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

  const { error } = await supabase.from(ORDERS).update(patch).eq('id', id);
  if (error) throw new Error(`상태를 바꾸지 못했습니다: ${error.message}`);

  await addHistory(id, before.status, status, memo);

  // 취소·반품으로 바뀌면 아직 살아 있는 품목의 재고를 되돌립니다.
  if (isStockReleasing(status) && !isStockReleasing(before.status)) {
    await adjustStock(
      before.items
        .filter((item) => item.itemStatus === 'normal')
        .map((item) => ({
          productId: item.productId,
          optionKey: item.optionKey,
          quantity: item.quantity,
        })),
      1
    );
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

  const { error } = await supabase
    .from(ORDERS)
    .update({ courier: courier || null, tracking_no: trackingNo.trim() || null })
    .eq('id', id);
  if (error) throw new Error(`송장을 저장하지 못했습니다: ${error.message}`);

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
  const { error } = await supabase
    .from(ORDERS)
    .update({
      receiver_name: patch.receiverName.trim(),
      receiver_phone: patch.receiverPhone.trim(),
      postcode: patch.postcode.trim(),
      address1: patch.address1.trim(),
      address2: patch.address2.trim() || null,
      delivery_memo: patch.deliveryMemo.trim() || null,
    })
    .eq('id', id);
  if (error) throw new Error(`배송지를 수정하지 못했습니다: ${error.message}`);
}

export async function setAdminMemo(id: string, memo: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from(ORDERS)
    .update({ admin_memo: memo.trim() || null })
    .eq('id', id);
  if (error) throw new Error(`메모를 저장하지 못했습니다: ${error.message}`);
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

  const { error } = await supabase
    .from(ITEMS)
    .update({ item_status: 'cancelled' })
    .eq('id', itemId);
  if (error) throw new Error(`부분 취소에 실패했습니다: ${error.message}`);

  // 남은 품목으로 금액을 다시 계산합니다.
  const remaining = order.items.filter(
    (item) => item.id !== itemId && item.itemStatus === 'normal'
  );
  const itemsTotal = remaining.reduce((sum, item) => sum + item.lineTotal, 0);
  // 전부 취소되면 배송비도 받지 않습니다.
  const shippingFee = remaining.length === 0 ? 0 : order.shippingFee;
  const extraShippingFee = remaining.length === 0 ? 0 : order.extraShippingFee;
  const totalAmount = itemsTotal + shippingFee + extraShippingFee - order.discount;

  const { error: totalError } = await supabase
    .from(ORDERS)
    .update({
      items_total: itemsTotal,
      shipping_fee: shippingFee,
      extra_shipping_fee: extraShippingFee,
      total_amount: totalAmount,
    })
    .eq('id', orderId);
  if (totalError) throw new Error(`금액을 다시 계산하지 못했습니다: ${totalError.message}`);

  // 취소한 품목의 재고를 되돌립니다.
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

  await addHistory(
    orderId,
    order.status,
    remaining.length === 0 ? 'cancelled' : order.status,
    `부분 취소: ${target.productName}${target.optionKey ? ` (${target.optionKey})` : ''} x${target.quantity}`
  );

  // 남은 상품이 하나도 없으면 주문 전체를 취소로 바꿉니다.
  if (remaining.length === 0 && order.status !== 'cancelled') {
    await supabase.from(ORDERS).update({ status: 'cancelled' }).eq('id', orderId);
  }

  return (await getOrderById(orderId)) ?? order;
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
export async function countOrdersByStatus(): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};

  const { data, error } = await supabase.from(ORDERS).select('status');
  if (error || !data) return {};

  const result: Record<string, number> = {};
  for (const row of data as { status: string }[]) {
    result[row.status] = (result[row.status] ?? 0) + 1;
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
    .filter((row) => !['cancelled', 'returned', 'failed'].includes(row.status))
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
