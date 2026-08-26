import 'server-only';
import { assertWritten } from '@/lib/db-write';

import { maskName } from '@/lib/mask-name';
import {
  getSupabaseAdmin,
  getSupabaseAdminFresh,
  requireSupabaseAdmin,
} from '@/lib/supabase/server';

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
  /** 화면 표시·정렬에 쓰는 작성일. 관리자가 체험단 후기 날짜를 지정할 수 있습니다. */
  writtenAt: string | null;
  /** 실제 등록 시각. 감사 기록이라 바뀌지 않습니다. */
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
  /** 3-B 에서 추가한 컬럼. 아직 없을 수 있어 선택 항목으로 둡니다. */
  written_at?: string | null;
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
    writtenAt: row.written_at ?? row.created_at,
    createdAt: row.created_at,
  };
}

// 이름 가리기는 클라이언트에서도 필요해 lib/mask-name.ts 로 뺐습니다.
export { maskName } from '@/lib/mask-name';

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

/**
 * 상품 상세용 — 노출 중인 리뷰만.
 *
 * ★ 여기서 작성자명을 가려 내려보냅니다.
 *   원본 이름은 DB 에 그대로 두고(관리자가 확인해야 합니다),
 *   손님 화면으로 나가는 데이터에는 아예 담지 않습니다.
 * ★ 정렬은 written_at 기준입니다. 관리자가 체험단 후기의 실제 작성일을
 *   지정하면 그 날짜 자리에 끼워 넣어야 하기 때문입니다.
 */
export async function getProductReviews(productId: string): Promise<Review[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('product_id', productId)
    .eq('is_visible', true)
    .order('written_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error || !data) {
    // written_at 컬럼이 아직 없으면(schema-3b.sql 미실행) 예전 방식으로 한 번 더 시도합니다.
    const retry = await supabase
      .from(TABLE)
      .select('*')
      .eq('product_id', productId)
      .eq('is_visible', true)
      .order('created_at', { ascending: false });
    if (retry.error || !retry.data) return [];
    return (retry.data as ReviewRow[]).map(rowToReview).map(withMaskedName);
  }

  return (data as ReviewRow[]).map(rowToReview).map(withMaskedName);
}

/** 손님 화면으로 내려보내기 전에 작성자명을 가립니다. */
function withMaskedName(review: Review): Review {
  return { ...review, writerName: maskName(review.writerName) };
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
  /**
   * ** 답글을 달았는지로 거르기 (2026-08-26)
   *   'no'  답글이 아직 없는 것만  ← 사이드바 '리뷰 관리' 뱃지가 세는 것과 같은 조건
   *   'yes' 답글을 단 것만
   *
   * * 뱃지 숫자와 목록이 반드시 같아야 해서 넣었습니다.
   *   숫자를 누르면 그 숫자만큼 나와야 합니다.
   */
  replied?: string;
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

    /*
     * ** 답글 여부. 뱃지가 세는 조건과 글자 하나까지 같아야 합니다.
     *   답글을 지우면 admin_reply 가 다시 null 이 됩니다.
     *   (replyToReview 가 `trimmed || null` 로 저장합니다)
     */
    if (filter.replied === 'no') {
      countQuery = countQuery.is('admin_reply', null);
      listQuery = listQuery.is('admin_reply', null);
    } else if (filter.replied === 'yes') {
      countQuery = countQuery.not('admin_reply', 'is', null);
      listQuery = listQuery.not('admin_reply', 'is', null);
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

/**
 * ============================================================
 * ** 아직 답글을 안 단 리뷰 건수 — 사이드바 뱃지 (2026-08-26)
 * ============================================================
 *
 * ** '미답변 문의' 와 같은 방식입니다. 새 방식을 만들지 않았습니다.
 *   관리자가 답글을 달면 이 숫자가 줄어듭니다.
 *   눌러서 처리하면 사라지는, 뱃지다운 숫자입니다.
 *
 * ** 왜 이것으로 셌는가 — 리뷰에는 '봤다' 를 적는 칸이 없습니다.
 *   문의처럼 status 값도 없습니다. 리뷰는 승인 절차 없이 바로 노출됩니다.
 *   reviews 테이블에 있는 것 중 "관리자가 처리했는지" 를 나타내는 것은
 *   admin_reply 하나뿐입니다.
 *
 *   '오늘 등록된 리뷰' 로 세는 방법도 있었지만 뱃지로는 맞지 않습니다.
 *   자정이 지나면 저절로 0 이 되어 어제 리뷰를 놓치고, 메뉴를 눌러도
 *   숫자가 줄지 않습니다.
 *
 * ** ★ 한계 — 나중에 이 주석을 보고 판단해 주세요. (사장님 지시, 2026-08-26)
 *   모든 리뷰에 답글을 달지 않으면 이 숫자는 계속 쌓이기만 합니다.
 *   그러면 뱃지가 "처리할 일" 이 아니라 "그냥 리뷰 총수" 가 되어 뜻을 잃습니다.
 *   그때는 둘 중 하나로 바꿔야 합니다.
 *     · 낮은 별점(3점 이하) 중 답글 없는 것만 세기 — 꼭 봐야 하는 것만 남습니다
 *     · 뱃지를 아예 빼기
 *   정확히 하려면 reviews 에 '관리자가 봤음' 칸이 필요한데, 그건 DB 구조를
 *   바꾸는 일이라 하지 않았습니다.
 *
 * * 목록 링크에도 같은 조건이 걸려 있습니다. (?replied=no)
 *   숫자와 목록이 다르면 그게 다음 버그가 됩니다.
 */
export async function countUnrepliedReviews(): Promise<number> {
  /*
   * * 저장된 답을 쓰지 않는 클라이언트로 읽습니다.
   *   사이드바 뱃지는 지금 값이어야 합니다.
   *   까닭은 lib/supabase/server.ts 의 getSupabaseAdminFresh 설명에 있습니다.
   */
  const supabase = getSupabaseAdminFresh();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .is('admin_reply', null);
  if (error) return 0;
  return count ?? 0;
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
  /** ISO 문자열. 비워 두면 지금 시각. 관리자 등록 화면에서만 지정합니다. */
  writtenAt?: string;
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
      // 지정하지 않으면 지금 시각으로 둡니다.
      written_at: input.writtenAt || new Date().toISOString(),
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
  const result = await supabase
    .from(TABLE)
    .update({ is_visible: visible })
    .eq('id', id)
    .select('id');
  assertWritten(result, '노출 설정을 바꾸지 못했습니다');
}

export async function replyToReview(id: string, reply: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const trimmed = reply.trim();
  const result = await supabase
    .from(TABLE)
    .update({
      admin_reply: trimmed || null,
      replied_at: trimmed ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('id');
  assertWritten(result, '답변을 저장하지 못했습니다');
}

export async function deleteReview(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const result = await supabase.from(TABLE).delete().eq('id', id).select('id');
  assertWritten(result, '리뷰를 삭제하지 못했습니다');
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
