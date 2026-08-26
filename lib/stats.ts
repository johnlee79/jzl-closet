import 'server-only';

import { brandLabel } from '@/lib/brands';
import { categoryNameKo } from '@/lib/categories';
import { kstEnd, kstStart } from '@/lib/orders';
import { isAwaitingPayment, isSalesStatus } from '@/lib/order-status';
import { getSupabaseAdminFresh } from '@/lib/supabase/server';
import { getBrands, getCachedCategories } from '@/lib/taxonomy';

/**
 * 매출·상품 통계. 서버 전용입니다.
 *
 * ★ 방문자 통계(페이지뷰·체류시간·이탈률)는 여기서 다루지 않습니다.
 *   GA4 를 이미 붙여 두었으니 그쪽에서 봅니다.
 *
 * ★ 취소·반품·결제실패 주문은 매출에서 뺍니다.
 *   부분취소된 품목(item_status='cancelled')도 상품 통계에서 뺍니다.
 */

/** 매출에서 빼는 주문 상태 — lib/order-status.ts 한 곳에서만 정합니다. (4-A) */

export type SalesStats = {
  totalSales: number;
  orderCount: number;
  averageOrder: number;
  cancelledAmount: number;
  cancelledCount: number;
  /** 아직 입금·승인 전이라 매출에서 뺀 금액. 들어올 예정입니다. */
  pendingAmount: number;
  pendingCount: number;
  /** 일자별 매출 (오래된 날짜부터) */
  daily: { day: string; amount: number; count: number }[];
  /** 상태별 주문 건수 */
  byStatus: Record<string, number>;
};

export type ProductStats = {
  /** 판매 수량 상위 */
  top: { slug: string; name: string; quantity: number; amount: number }[];
  byCategory: { key: string; label: string; amount: number }[];
  byBrand: { key: string; label: string; amount: number }[];
};

export function emptySales(): SalesStats {
  return {
    totalSales: 0,
    orderCount: 0,
    averageOrder: 0,
    cancelledAmount: 0,
    cancelledCount: 0,
    pendingAmount: 0,
    pendingCount: 0,
    daily: [],
    byStatus: {},
  };
}

/** ISO 시각 → 한국 날짜 'yyyy-mm-dd' */
function toKstDay(value: string): string {
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** from~to 사이의 모든 날짜 (빈 날도 0으로 채워 그래프가 끊기지 않게) */
function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let time = start; time <= end; time += 24 * 60 * 60 * 1000) {
    days.push(new Date(time).toISOString().slice(0, 10));
    // 기간이 지나치게 길면 그래프가 의미를 잃습니다.
    if (days.length > 400) break;
  }
  return days;
}

/* ------------------------------------------------------------------
 * 매출
 * ------------------------------------------------------------------ */

export async function getSalesStats(from: string, to: string): Promise<SalesStats> {
  /*
   * ** 저장된 답을 쓰지 않는 클라이언트로 읽습니다. (2026-08-26)
   *   관리자 전용 화면입니다. 손님 화면은 이 함수를 부르지 않습니다.
   *   회원 목록에 DB 에 없는 사람이 11명 뜬 일과 같은 뿌리를 막습니다.
   *   까닭은 lib/supabase/server.ts 의 getSupabaseAdminFresh 설명에 있습니다.
   * * 세는 조건은 한 글자도 바꾸지 않았습니다. 조회를 보내는 방법만 바꿉니다.
   */
  const supabase = getSupabaseAdminFresh();
  if (!supabase) return emptySales();

  const { data, error } = await supabase
    .from('orders')
    .select('id, total_amount, status, created_at')
    .gte('created_at', kstStart(from))
    .lte('created_at', kstEnd(to));

  if (error || !data) return emptySales();

  const rows = data as {
    id: string;
    total_amount: number | null;
    status: string;
    created_at: string | null;
  }[];

  const byStatus: Record<string, number> = {};
  const dailyMap = new Map<string, { amount: number; count: number }>();

  let totalSales = 0;
  let orderCount = 0;
  let cancelledAmount = 0;
  let cancelledCount = 0;
  let pendingAmount = 0;
  let pendingCount = 0;

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    const amount = row.total_amount ?? 0;

    /*
     * ★★ 매출이 아닌 것을 두 종류로 나눕니다. (2026-08-25)
     *     들어올 예정  결제대기        → pendingAmount
     *     끝난 것      취소·반품·실패  → cancelledAmount
     *
     *   전에는 한 칸이었습니다. 결제대기를 매출에서 빼기 시작하면서
     *   입금 전 주문이 화면의 "취소·반품" 칸으로 들어가게 됩니다.
     *   숫자는 맞아도 뜻이 거짓말이 됩니다. 취소한 적 없는 손님의 주문이
     *   취소로 집계되면 그 숫자로는 아무 판단도 할 수 없습니다.
     */
    if (isAwaitingPayment(row.status)) {
      pendingAmount += amount;
      pendingCount += 1;
      continue;
    }

    if (!isSalesStatus(row.status)) {
      cancelledAmount += amount;
      cancelledCount += 1;
      continue;
    }

    totalSales += amount;
    orderCount += 1;

    if (row.created_at) {
      const day = toKstDay(row.created_at);
      const current = dailyMap.get(day) ?? { amount: 0, count: 0 };
      current.amount += amount;
      current.count += 1;
      dailyMap.set(day, current);
    }
  }

  const daily = dayRange(from, to).map((day) => ({
    day,
    amount: dailyMap.get(day)?.amount ?? 0,
    count: dailyMap.get(day)?.count ?? 0,
  }));

  return {
    totalSales,
    orderCount,
    averageOrder: orderCount > 0 ? Math.round(totalSales / orderCount) : 0,
    cancelledAmount,
    cancelledCount,
    pendingAmount,
    pendingCount,
    daily,
    byStatus,
  };
}

/* ------------------------------------------------------------------
 * 상품
 * ------------------------------------------------------------------ */

export async function getProductStats(from: string, to: string): Promise<ProductStats> {
  const empty: ProductStats = { top: [], byCategory: [], byBrand: [] };
  /*
   * ** 저장된 답을 쓰지 않는 클라이언트로 읽습니다. (2026-08-26)
   *   관리자 전용 화면입니다. 손님 화면은 이 함수를 부르지 않습니다.
   *   회원 목록에 DB 에 없는 사람이 11명 뜬 일과 같은 뿌리를 막습니다.
   *   까닭은 lib/supabase/server.ts 의 getSupabaseAdminFresh 설명에 있습니다.
   * * 세는 조건은 한 글자도 바꾸지 않았습니다. 조회를 보내는 방법만 바꿉니다.
   */
  const supabase = getSupabaseAdminFresh();
  if (!supabase) return empty;

  // 기간 안의 "살아 있는" 주문 id 만 모읍니다.
  const { data: orderRows, error: orderError } = await supabase
    .from('orders')
    .select('id, status')
    .gte('created_at', kstStart(from))
    .lte('created_at', kstEnd(to));

  if (orderError || !orderRows) return empty;

  const liveOrderIds = (orderRows as { id: string; status: string }[])
    .filter((row) => isSalesStatus(row.status))
    .map((row) => row.id);

  if (liveOrderIds.length === 0) return empty;

  // in() 에 너무 많이 넣으면 요청이 커집니다. 나눠서 읽습니다.
  const CHUNK = 200;
  const items: {
    product_slug: string;
    product_name: string;
    quantity: number;
    line_total: number;
    item_status: string | null;
  }[] = [];

  for (let index = 0; index < liveOrderIds.length; index += CHUNK) {
    const slice = liveOrderIds.slice(index, index + CHUNK);
    const { data } = await supabase
      .from('order_items')
      .select('product_slug, product_name, quantity, line_total, item_status')
      .in('order_id', slice);
    if (data) items.push(...(data as typeof items));
  }

  // ★ 부분취소된 품목은 뺍니다.
  const live = items.filter((item) => item.item_status !== 'cancelled');

  const byProduct = new Map<string, { name: string; quantity: number; amount: number }>();
  for (const item of live) {
    const current = byProduct.get(item.product_slug) ?? {
      name: item.product_name,
      quantity: 0,
      amount: 0,
    };
    current.quantity += item.quantity;
    current.amount += item.line_total;
    byProduct.set(item.product_slug, current);
  }

  const top = Array.from(byProduct.entries())
    .map(([slug, value]) => ({ slug, ...value }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 20);

  /* 카테고리·브랜드별 비중 — 상품 테이블에서 분류를 찾아 붙입니다. */
  const slugs = Array.from(byProduct.keys());
  const categoryAmount = new Map<string, number>();
  const brandAmount = new Map<string, number>();

  for (let index = 0; index < slugs.length; index += CHUNK) {
    const slice = slugs.slice(index, index + CHUNK);
    const { data } = await supabase
      .from('products')
      .select('slug, category_slug, brand_slug')
      .in('slug', slice);

    for (const row of (data ?? []) as {
      slug: string;
      category_slug: string | null;
      brand_slug: string | null;
    }[]) {
      const amount = byProduct.get(row.slug)?.amount ?? 0;
      if (amount <= 0) continue;

      const categoryKey = row.category_slug ?? '(분류 없음)';
      categoryAmount.set(categoryKey, (categoryAmount.get(categoryKey) ?? 0) + amount);

      const brandKey = row.brand_slug ?? '(브랜드 없음)';
      brandAmount.set(brandKey, (brandAmount.get(brandKey) ?? 0) + amount);
    }
  }

  const [categories, brands] = await Promise.all([getCachedCategories(), getBrands()]);

  const byCategory = Array.from(categoryAmount.entries())
    .map(([key, amount]) => ({
      key,
      label: key.startsWith('(') ? key : categoryNameKo(categories, key),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const byBrand = Array.from(brandAmount.entries())
    .map(([key, amount]) => ({
      key,
      label: key.startsWith('(') ? key : brandLabel(brands, key),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { top, byCategory, byBrand };
}
