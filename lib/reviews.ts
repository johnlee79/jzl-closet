import 'server-only';

import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';

/**
 * 상품 리뷰. 서버 전용이며 service_role 로만 접근합니다.
 *
 * ★ is_sponsored(체험단·무상제공)는 프론트에 반드시 표시해야 합니다.
 *   표시광고법상 요구되는 표시라 값을 숨기거나 지우지 마세요.
 */

const TABLE = 'reviews';

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);
const UNIQUE_VIOLATION = '23505';

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function missingTableError(): Error {
  return new Error(
    'reviews 테이블이 없습니다. supabase/schema-3a.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
  );
}

/* ------------------------------------------------------------------
 * 타입
 * ------------------------------------------------------------------ */

export type Review = {
  id: string;
  productId: string;
  productSlug: string;
  userId: string | null;
  orderId: string | null;
  writerName: string;
  rating: number;
  tags: string[];
  content: string;
  attachments: string[];
  isSponsored: boolean;
  isVisible: boolean;
  adminReply: string;
  repliedAt: string | null;
  helpfulCount: number;
  createdAt: string | null;
};

type ReviewRow = {
  id: string;
  product_id: string;
  product_slug: string;
  user_id: string | null;
  order_id: string | null;
  writer_name: string;
  rating: number;
  tags: unknown;
  content: string;
  attachments: unknown;
  is_sponsored: boolean | null;
  is_visible: boolean | null;
  admin_reply: string | null;
  replied_at: string | null;
  helpful_count: number | null;
  created_at: string | null;
};

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToReview(row: ReviewRow): Review {
  return {
    id: row.id,
    productId: row.product_id,
    productSlug: row.product_slug,
    userId: row.user_id,
    orderId: row.order_id,
    writerName: row.writer_name,
    rating: row.rating,
    tags: toStringArray(row.tags),
    content: row.content,
    attachments: toStringArray(row.attachments),
    isSponsored: Boolean(row.is_sponsored),
    isVisible: row.is_visible !== false,
    adminReply: row.admin_reply ?? '',
    repliedAt: row.replied_at,
    helpfulCount: row.helpful_count ?? 0,
    createdAt: row.created_at,
  };
}

/** 이름 가운데를 가립니다. 홍길동 → 홍*동 */
export function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}

/* ------------------------------------------------------------------
 * 요약 — 상품 상세의 평균 별점·분포·태그 통계
 * ------------------------------------------------------------------ */

export type ReviewSummary = {
  count: number;
  average: number;
  /** 5점부터 1점까지의 개수 */
  distribution: Record<number, number>;
  /** 많이 선택된 순서의 태그 (상위 3개) */
  topTags: { tag: string; count: number }[];
  /** 사진이 있는 리뷰 개수 */
  photoCount: number;
};

export function emptySummary(): ReviewSummary {
  return {
    count: 0,
    average: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    topTags: [],
    photoCount: 0,
  };
}

export function summarize(reviews: Review[]): ReviewSummary {
  if (reviews.length === 0) return emptySummary();

  const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const tagCounts = new Map<string, number>();
  let total = 0;
  let photoCount = 0;

  for (const review of reviews) {
    const rating = Math.min(5, Math.max(1, review.rating));
    distribution[rating] += 1;
    total += rating;
    if (review.attachments.length > 0) photoCount += 1;
    for (const tag of review.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    count: reviews.length,
    // 소수 첫째 자리까지
    average: Math.round((total / reviews.length) * 10) / 10,
    distribution,
    topTags,
    photoCount,
  };
}

/* ------------------------------------------------------------------
 * 조회
 * ------------------------------------------------------------------ */

/** 상품 상세용 — 노출 중인 리뷰만 */
export async function getProductReviews(productId: string): Promise<Review[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('product_id', productId)
    .eq('is_visible', true)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as ReviewRow[]).map(rowToReview);
}

/** 여러 상품의 평균 별점을 한 번에 (상품 목록·통계용) */
export async function getRatingsByProduct(): Promise<
  Map<string, { count: number; average: number }>
> {
  const result = new Map<string, { count: number; average: number }>();
  const supabase = getSupabaseAdmin();
  if (!supabase) return result;

  const { data, error } = await supabase
    .from(TABLE)
    .select('product_id, rating')
    .eq('is_visible', true);

  if (error || !data) return result;

  const sums = new Map<string, { total: number; count: number }>();
  for (const row of data as { product_id: string; rating: number }[]) {
    const current = sums.get(row.product_id) ?? { total: 0, count: 0 };
    current.total += row.rating;
    current.count += 1;
    sums.set(row.product_id, current);
  }

  sums.forEach((value, key) => {
    result.set(key, {
      count: value.count,
      average: Math.round((value.total / value.count) * 10) / 10,
    });
  });
  return result;
}

export async function getReviewById(id: string): Promise<Review | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return rowToReview(data as ReviewRow);
}

/** 회원이 이미 이 주문의 이 상품에 리뷰를 썼는지 */
export async function hasReviewed(
  orderId: string,
  productId: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .limit(1);

  if (error) return false;
  return (data ?? []).length > 0;
}

/** 주문 여러 건에 대해 이미 리뷰를 쓴 (주문, 상품) 조합을 한 번에 */
export async function getReviewedKeys(orderIds: string[]): Promise<Set<string>> {
  const keys = new Set<string>();
  if (orderIds.length === 0) return keys;

  const supabase = getSupabaseAdmin();
  if (!supabase) return keys;

  const { data, error } = await supabase
    .from(TABLE)
    .select('order_id, product_id')
    .in('order_id', orderIds);

  if (error || !data) return keys;
  for (const row of data as { order_id: string | null; product_id: string }[]) {
    if (row.order_id) keys.add(`${row.order_id}:${row.product_id}`);
  }
  return keys;
}

export async function getReviewsOfUser(userId: string): Promise<Review[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as ReviewRow[]).map(rowToReview);
}

/* ------------------------------------------------------------------
 * 관리자 목록
 * ------------------------------------------------------------------ */

export type ReviewFilter = {
  productSlug?: string;
  rating?: number;
  /** 'yes' | 'no' */
  photo?: string;
  visible?: string;
  sponsored?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function getReviews(
  filter: ReviewFilter = {}
): Promise<{ reviews: Review[]; total: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { reviews: [], total: 0 };

  const term = (filter.search ?? '').replace(/[%,().]/g, '').trim();
  const searchExpression = term
    ? `content.ilike.%${term}%,writer_name.ilike.%${term}%,product_slug.ilike.%${term}%`
    : '';

  try {
    let countQuery = supabase.from(TABLE).select('id', { count: 'exact', head: true });
    let listQuery = supabase.from(TABLE).select('*');

    if (filter.productSlug) {
      countQuery = countQuery.eq('product_slug', filter.productSlug);
      listQuery = listQuery.eq('product_slug', filter.productSlug);
    }
    if (filter.rating) {
      countQuery = countQuery.eq('rating', filter.rating);
      listQuery = listQuery.eq('rating', filter.rating);
    }
    if (filter.visible === 'true' || filter.visible === 'false') {
      const value = filter.visible === 'true';
      countQuery = countQuery.eq('is_visible', value);
      listQuery = listQuery.eq('is_visible', value);
    }
    if (filter.sponsored === 'true' || filter.sponsored === 'false') {
      const value = filter.sponsored === 'true';
      countQuery = countQuery.eq('is_sponsored', value);
      listQuery = listQuery.eq('is_sponsored', value);
    }
    if (searchExpression) {
      countQuery = countQuery.or(searchExpression);
      listQuery = listQuery.or(searchExpression);
    }

    listQuery = listQuery.order('created_at', { ascending: false });
    if (filter.limit !== undefined) {
      const from = filter.offset ?? 0;
      listQuery = listQuery.range(from, from + filter.limit - 1);
    }

    const [countResult, listResult] = await Promise.all([countQuery, listQuery]);

    if (listResult.error) {
      if (!isMissingTable(listResult.error.code)) {
        console.error('[reviews] 목록 조회 실패:', listResult.error.message);
      }
      return { reviews: [], total: 0 };
    }

    let reviews = (listResult.data ?? []).map((row) => rowToReview(row as ReviewRow));

    // 사진 유무는 jsonb 배열 길이라 SQL 로 거르기 번거로워 여기서 거릅니다.
    if (filter.photo === 'yes') {
      reviews = reviews.filter((review) => review.attachments.length > 0);
    } else if (filter.photo === 'no') {
      reviews = reviews.filter((review) => review.attachments.length === 0);
    }

    return { reviews, total: countResult.count ?? reviews.length };
  } catch (error) {
    console.error('[reviews] 목록 조회 실패:', error);
    return { reviews: [], total: 0 };
  }
}

export async function countReviewsToday(): Promise<{ today: number; lowRating: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { today: 0, lowRating: 0 };

  // 한국 시간 기준 오늘
  const now = new Date();
  const kstToday = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${kstToday}T00:00:00+09:00`).toISOString();

  const [todayResult, lowResult] = await Promise.all([
    supabase.from(TABLE).select('id', { count: 'exact', head: true }).gte('created_at', start),
    supabase.from(TABLE).select('id', { count: 'exact', head: true }).lte('rating', 3),
  ]);

  return {
    today: todayResult.count ?? 0,
    lowRating: lowResult.count ?? 0,
  };
}

/* ------------------------------------------------------------------
 * 저장
 * ------------------------------------------------------------------ */

export type ReviewInput = {
  productId: string;
  productSlug: string;
  userId: string | null;
  orderId: string | null;
  writerName: string;
  rating: number;
  tags: string[];
  content: string;
  attachments: string[];
  isSponsored: boolean;
};

export class DuplicateReviewError extends Error {
  constructor() {
    super('이미 이 주문의 상품에 리뷰를 작성하셨습니다.');
    this.name = 'DuplicateReviewError';
  }
}

export async function createReview(input: ReviewInput): Promise<Review> {
  const supabase = requireSupabaseAdmin();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      product_id: input.productId,
      product_slug: input.productSlug,
      user_id: input.userId,
      order_id: input.orderId,
      writer_name: input.writerName.trim(),
      rating: Math.min(5, Math.max(1, Math.trunc(input.rating))),
      tags: input.tags,
      content: input.content.trim(),
      attachments: input.attachments,
      is_sponsored: input.isSponsored,
      is_visible: true,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingTable(error.code)) throw missingTableError();
    // 같은 주문의 같은 상품에는 한 번만 (DB 유니크 인덱스)
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateReviewError();
    throw new Error(`리뷰를 저장하지 못했습니다: ${error.message}`);
  }

  return rowToReview(data as ReviewRow);
}

export async function setReviewVisible(id: string, visible: boolean): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(TABLE).update({ is_visible: visible }).eq('id', id);
  if (error) throw new Error(`노출 설정을 바꾸지 못했습니다: ${error.message}`);
}

export async function replyToReview(id: string, reply: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const trimmed = reply.trim();
  const { error } = await supabase
    .from(TABLE)
    .update({
      admin_reply: trimmed || null,
      replied_at: trimmed ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw new Error(`답변을 저장하지 못했습니다: ${error.message}`);
}

export async function deleteReview(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`리뷰를 삭제하지 못했습니다: ${error.message}`);
}

/* ------------------------------------------------------------------
 * 통계용
 * ------------------------------------------------------------------ */

/** 리뷰가 많은 상품 / 별점이 낮은 상품 (개선 대상 파악용) */
export async function getReviewStats(): Promise<
  { productSlug: string; count: number; average: number }[]
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('product_slug, rating')
    .eq('is_visible', true);

  if (error || !data) return [];

  const sums = new Map<string, { total: number; count: number }>();
  for (const row of data as { product_slug: string; rating: number }[]) {
    const current = sums.get(row.product_slug) ?? { total: 0, count: 0 };
    current.total += row.rating;
    current.count += 1;
    sums.set(row.product_slug, current);
  }

  return Array.from(sums.entries()).map(([productSlug, value]) => ({
    productSlug,
    count: value.count,
    average: Math.round((value.total / value.count) * 10) / 10,
  }));
}
