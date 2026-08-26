import 'server-only';

import { isSalesStatus } from '@/lib/order-status';
import { getPaymentSettings, getShippingSettings } from '@/lib/settings';
import { getSupabaseAdminFresh } from '@/lib/supabase/server';
import { kstEnd, kstStart } from '@/lib/orders';

/**
 * ================================================================
 * ** 수익 관리 — 순수익 계산 (2026-08-27)
 * ================================================================
 *
 * 계산식 (사장님 확정)
 *
 *   순수익 = 매출 − 원가 − 배송비부담 − 카드수수료 − 이체수수료
 *
 *   매출        orders.total_amount  (포인트로 깎인 금액이 이미 빠져 있습니다)
 *   원가        Σ(unit_cost × 수량)   (item_status = 'normal' 인 줄만)
 *   배송비부담  주문 1건당 −3,000원 (늘 나갑니다. 아래 긴 설명을 보세요)
 *   카드수수료  카드결제면 매출 × 요율(%), 무통장이면 0
 *   이체수수료  카드결제면 건당 200원, 무통장이면 0
 *
 * ----------------------------------------------------------------
 * ** 매출 판정을 여기서 새로 쓰지 않습니다.
 *   isSalesStatus() 하나만 씁니다. lib/order-status.ts 의 NON_SALES_STATUSES 가
 *   유일한 원본입니다. 통계 화면(lib/stats.ts)도 같은 함수를 씁니다.
 *
 *   인계 문서에 "매출 기준이 두 곳에 있어서 회원 구매금액과 대시보드 매출이
 *   달랐다" 는 기록이 있습니다. 조건을 손으로 다시 쓰면 그 일이 또 납니다.
 *
 * ** 관리자 전용입니다. getSupabaseAdminFresh() 를 씁니다.
 *   저장된 옛 답을 쓰면 어제 숫자를 오늘 숫자로 착각합니다.
 *
 * ----------------------------------------------------------------
 * ** 가정 — 확인이 필요합니다 (2026-08-27, 사장님이 KSNET 에 확인 예정)
 *
 *   취소된 주문은 카드 수수료를 0 으로 잡습니다.
 *   KSNET 이 취소할 때 수수료를 **돌려준다**고 가정한 것입니다.
 *
 *   ★ 돌려주지 않는다면 그만큼이 그대로 손실인데 이 계산에는 안 잡힙니다.
 *     확인되면 이 자리를 고쳐야 합니다. 고칠 곳은 아래 한 군데뿐입니다 —
 *     취소된 주문은 isSalesStatus() 에서 걸러져 아예 안 들어옵니다.
 *     수수료만 따로 세려면 "취소된 주문의 수수료" 를 따로 모아야 합니다.
 * ================================================================
 */

/** 주문 하나의 마진 */
export type OrderMargin = {
  orderNo: string;
  status: string;
  paymentMethod: string;
  createdAt: string | null;
  /** 실제로 들어온 돈 (포인트 사용분이 이미 빠진 금액) */
  sales: number;
  /** 살아 있는 품목의 원가 합계 */
  cost: number;
  /** 우리가 부담한 배송비 (양수로 담습니다. 뺄 때 음수가 됩니다) */
  shippingBurden: number;
  cardFee: number;
  transferFee: number;
  profit: number;
  /** 원가를 모르는 품목이 하나라도 있으면 true — 마진을 믿으면 안 됩니다 */
  costMissing: boolean;
};

export type ProfitStats = {
  sales: number;
  cost: number;
  shippingBurden: number;
  cardFee: number;
  transferFee: number;
  profit: number;
  /** 순수익 ÷ 매출 (%). 매출이 0 이면 null */
  margin: number | null;
  orderCount: number;
  /** 원가를 모르는 품목이 낀 주문 수 — 화면에 크게 보여 줍니다 */
  costMissingOrders: number;
  /** 아직 원가를 안 넣은 상품 수 (전체 상품 기준) */
  productsWithoutCost: number;
  productTotal: number;
  /** 곧 빠질 돈 — 취소요청 상태로 매출에 들어 있는 건수와 금액 */
  cancelRequestedCount: number;
  cancelRequestedAmount: number;
  /** 계산에 쓴 값 (화면에 그대로 보여 줍니다) */
  cardFeeRate: number;
  transferFeeEach: number;
  shippingBurdenEach: number;
  orders: OrderMargin[];
};

export function emptyProfit(): ProfitStats {
  return {
    sales: 0,
    cost: 0,
    shippingBurden: 0,
    cardFee: 0,
    transferFee: 0,
    profit: 0,
    margin: null,
    orderCount: 0,
    costMissingOrders: 0,
    productsWithoutCost: 0,
    productTotal: 0,
    cancelRequestedCount: 0,
    cancelRequestedAmount: 0,
    cardFeeRate: 0,
    transferFeeEach: 0,
    shippingBurdenEach: 0,
    orders: [],
  };
}

type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  payment_method: string | null;
  total_amount: number | null;
  shipping_fee: number | null;
  created_at: string | null;
};

type ItemRow = {
  order_id: string;
  quantity: number | null;
  unit_cost?: number | null;
  item_status: string | null;
};

/** in() 에 한 번에 너무 많이 넣지 않습니다. lib/stats.ts 와 같은 크기입니다. */
const CHUNK = 200;

/**
 * 아직 원가를 안 넣은 상품이 몇 개인지.
 *
 * ** 이 숫자를 화면에 크게 보여 줘야 합니다.
 *   원가가 빠진 채로 계산하면 순수익이 실제보다 커 보입니다.
 *   "잘 남는다" 고 착각하게 만드는 숫자는 없느니만 못합니다.
 *
 * * 칸이 아직 없으면 "전부 미입력" 으로 셉니다. 실제로 그렇습니다.
 */
async function countProductsWithoutCost(): Promise<{ without: number; total: number }> {
  const supabase = getSupabaseAdminFresh();
  if (!supabase) return { without: 0, total: 0 };

  const total = await supabase.from('products').select('id', { count: 'exact', head: true });
  const productTotal = total.count ?? 0;

  const missing = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .is('cost_price', null);

  if (missing.error) {
    // 칸이 아직 없습니다. 그러면 전부 미입력입니다.
    console.warn(
      '[profit] cost_price 칸이 아직 없습니다. 상품 전부를 원가 미입력으로 셉니다. ' +
        '정리SQL/11-원가-칸-추가.sql 을 실행해 주세요.'
    );
    return { without: productTotal, total: productTotal };
  }

  return { without: missing.count ?? 0, total: productTotal };
}

/**
 * 기간 안의 순수익.
 *
 * @param from 'YYYY-MM-DD' (한국 시간 기준 그날 00:00 부터)
 * @param to   'YYYY-MM-DD' (한국 시간 기준 그날 23:59 까지)
 */
export async function getProfitStats(from: string, to: string): Promise<ProfitStats> {
  const supabase = getSupabaseAdminFresh();
  if (!supabase) return emptyProfit();

  const [payment, shipping, productCount] = await Promise.all([
    getPaymentSettings(),
    getShippingSettings(),
    countProductsWithoutCost(),
  ]);

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_no, status, payment_method, total_amount, shipping_fee, created_at')
    .gte('created_at', kstStart(from))
    .lte('created_at', kstEnd(to));

  if (error) {
    console.error('[profit] 주문 조회 실패:', error.message);
    return emptyProfit();
  }

  const rows = (data ?? []) as OrderRow[];

  /*
   * ** 매출로 세는 주문만 남깁니다.
   *   취소완료 반품 결제실패 결제대기 승인확인실패 검토필요는 빠집니다.
   *   교환과 취소요청은 남습니다. (사장님 확정)
   */
  const live = rows.filter((row) => isSalesStatus(row.status));

  const base = emptyProfit();
  base.cardFeeRate = payment.cardFeeRate;
  base.transferFeeEach = payment.transferFee;
  base.shippingBurdenEach = shipping.baseFee;
  base.productsWithoutCost = productCount.without;
  base.productTotal = productCount.total;

  if (live.length === 0) return base;

  /* ── 품목별 원가를 모읍니다 ─────────────────────────────── */
  const ids = live.map((row) => row.id);
  const items: ItemRow[] = [];
  let costColumnMissing = false;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    // eslint-disable-next-line no-await-in-loop
    const result = await supabase
      .from('order_items')
      .select('order_id, quantity, unit_cost, item_status')
      .in('order_id', slice);

    if (result.error) {
      /*
       * ** 칸이 아직 없으면 unit_cost 를 빼고 다시 읽습니다.
       *   원가는 0 으로 잡히지만 매출과 수수료는 그대로 보입니다.
       *   화면이 통째로 비는 것보다 낫습니다.
       */
      costColumnMissing = true;
      // eslint-disable-next-line no-await-in-loop
      const retry = await supabase
        .from('order_items')
        .select('order_id, quantity, item_status')
        .in('order_id', slice);
      if (retry.error) {
        console.error('[profit] 주문 품목 조회 실패:', retry.error.message);
        return base;
      }
      items.push(...((retry.data ?? []) as ItemRow[]));
      continue;
    }
    items.push(...((result.data ?? []) as ItemRow[]));
  }

  if (costColumnMissing) {
    console.warn(
      '[profit] order_items.unit_cost 칸이 아직 없습니다. 원가를 0 으로 계산합니다. ' +
        '정리SQL/11-원가-칸-추가.sql 을 실행해 주세요.'
    );
  }

  /** 주문 id → { 원가합계, 원가모름 } */
  const costByOrder = new Map<string, { cost: number; missing: boolean }>();
  for (const item of items) {
    // ** 부분취소된 줄은 세지 않습니다. 그 물건은 안 나갔습니다.
    if (item.item_status === 'cancelled') continue;

    const current = costByOrder.get(item.order_id) ?? { cost: 0, missing: false };
    const quantity = item.quantity ?? 0;

    if (typeof item.unit_cost === 'number') {
      current.cost += item.unit_cost * quantity;
    } else {
      // 원가를 모르는 품목입니다. 0 으로 두되 "모름" 표시를 남깁니다.
      current.missing = true;
    }
    costByOrder.set(item.order_id, current);
  }

  /* ── 주문별로 계산합니다 ────────────────────────────────── */
  const margins: OrderMargin[] = [];

  for (const row of live) {
    const sales = row.total_amount ?? 0;
    const found = costByOrder.get(row.id) ?? { cost: 0, missing: true };

    /*
     * ============================================================
     * ** 배송비는 주문마다 늘 나갑니다 (2026-08-27)
     * ============================================================
     *
     * ** 손님이 배송비를 냈든 안 냈든 **택배는 똑같이 나갑니다.**
     *   그래서 부담은 언제나 실비(기본 배송비)입니다.
     *
     * ** 처음에는 "손님이 냈으면 0, 무료배송이면 3,000" 으로 짰습니다.
     *   그건 틀립니다. 매출을 total_amount 로 잡고 있는데, 그 안에는
     *   손님이 낸 배송비 3,000원이 **이미 들어 있습니다.**
     *   부담을 0 으로 두면 그 3,000원이 그대로 순수익으로 잡혀,
     *   실제로는 남지 않은 돈이 남은 것처럼 보입니다.
     *
     *   지금처럼 늘 빼면 결과가 사장님이 적어 주신 것과 같아집니다.
     *     배송비 받음   +3,000(매출) − 3,000(부담) = 0
     *     무료배송      +0          − 3,000(부담) = −3,000
     *
     * ** 매출은 통계 화면과 같은 total_amount 를 씁니다.
     *   두 화면의 총 매출이 어긋나면 안 됩니다.
     *
     * * 도서산간 추가 실비는 이번에 넣지 않습니다. (사장님 판단)
     *   손님이 낸 도서산간 3,000원은 매출에 들어 있는데 우리 부담은 안 잡습니다.
     *   그만큼 순수익이 크게 보입니다. 도서산간 주문에만 해당합니다.
     */
    const shippingBurden = shipping.baseFee;

    /*
     * ** 수수료는 카드에만 붙습니다.
     *   이체수수료 200원도 카드입니다. KSNET 즉시결제 구조 때문입니다.
     *   무통장입금은 둘 다 0 입니다. (사장님 확인, 2026-08-27)
     */
    const isCard = row.payment_method !== 'bank_transfer';
    const cardFee = isCard ? Math.round((sales * payment.cardFeeRate) / 100) : 0;
    const transferFee = isCard ? payment.transferFee : 0;

    const profit = sales - found.cost - shippingBurden - cardFee - transferFee;

    margins.push({
      orderNo: row.order_no,
      status: row.status,
      paymentMethod: row.payment_method ?? '',
      createdAt: row.created_at,
      sales,
      cost: found.cost,
      shippingBurden,
      cardFee,
      transferFee,
      profit,
      costMissing: found.missing,
    });
  }

  margins.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

  /* ── 합계 ───────────────────────────────────────────────── */
  const sum = (pick: (m: OrderMargin) => number) =>
    margins.reduce((total, m) => total + pick(m), 0);

  const sales = sum((m) => m.sales);
  const profit = sum((m) => m.profit);

  const cancelRequested = margins.filter((m) => m.status === 'cancel_requested');

  return {
    ...base,
    sales,
    cost: sum((m) => m.cost),
    shippingBurden: sum((m) => m.shippingBurden),
    cardFee: sum((m) => m.cardFee),
    transferFee: sum((m) => m.transferFee),
    profit,
    margin: sales > 0 ? Math.round((profit / sales) * 1000) / 10 : null,
    orderCount: margins.length,
    costMissingOrders: margins.filter((m) => m.costMissing).length,
    cancelRequestedCount: cancelRequested.length,
    cancelRequestedAmount: cancelRequested.reduce((t, m) => t + m.sales, 0),
    orders: margins,
  };
}
