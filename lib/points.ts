import 'server-only';

import { getPointSettings } from '@/lib/settings';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';

/**
 * 포인트 적립·사용. 서버 전용입니다.
 *
 * ★ 잔액(profiles.point_balance)과 내역(point_transactions)이 어긋나면
 *   나중에 어느 쪽이 맞는지 알 수 없습니다.
 *   그래서 둘을 한 트랜잭션에서 함께 바꾸는 DB 함수(apply_point_change)만 부릅니다.
 *   앱에서 잔액을 직접 update 하지 마세요.
 */

const TABLE = 'point_transactions';

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

export type PointReason =
  | 'signup'
  | 'review_text'
  | 'review_photo'
  | 'order_use'
  | 'admin'
  | 'cancel';

export type PointTransaction = {
  id: string;
  amount: number;
  balance: number;
  reason: string;
  memo: string;
  refId: string | null;
  createdAt: string | null;
};

type PointRow = {
  id: string;
  amount: number;
  balance: number;
  reason: string;
  memo: string | null;
  ref_id: string | null;
  created_at: string | null;
};

function rowToTransaction(row: PointRow): PointTransaction {
  return {
    id: row.id,
    amount: row.amount,
    balance: row.balance,
    reason: row.reason,
    memo: row.memo ?? '',
    refId: row.ref_id,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------
 * 잔액 · 내역
 * ------------------------------------------------------------------ */

export async function getPointBalance(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('profiles')
    .select('point_balance')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return 0;
  return (data as { point_balance: number | null }).point_balance ?? 0;
}

export async function getPointHistory(
  userId: string,
  limit = 100
): Promise<PointTransaction[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as PointRow[]).map(rowToTransaction);
}

/* ------------------------------------------------------------------
 * 변경 — DB 함수 하나만 부릅니다.
 * ------------------------------------------------------------------ */

/**
 * 포인트를 더하거나 뺍니다.
 * @param amount 적립이면 양수, 사용이면 음수
 * @returns 바뀐 뒤의 잔액. 실패하면 null (호출부가 판단합니다)
 */
export async function changePoints(
  userId: string,
  amount: number,
  reason: PointReason,
  memo = '',
  refId: string | null = null
): Promise<number | null> {
  if (amount === 0) return getPointBalance(userId);

  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.rpc('apply_point_change', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_memo: memo || null,
    p_ref_id: refId,
  });

  if (error) {
    if (isMissingTable(error.code)) {
      throw new Error(
        '포인트 테이블이 없습니다. supabase/schema-3a.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
      );
    }
    // 잔액 부족은 DB 함수가 예외로 알려 줍니다.
    if (/모자랍니다/.test(error.message)) {
      throw new Error('보유 포인트가 모자랍니다.');
    }
    throw new Error(`포인트 처리에 실패했습니다: ${error.message}`);
  }

  return typeof data === 'number' ? data : null;
}

/**
 * 적립은 실패해도 원래 작업(가입·리뷰 작성)을 막지 않습니다.
 * 로그만 남기고 조용히 넘어갑니다.
 */
export async function tryEarnPoints(
  userId: string,
  amount: number,
  reason: PointReason,
  memo = '',
  refId: string | null = null
): Promise<void> {
  if (amount <= 0) return;
  try {
    await changePoints(userId, amount, reason, memo, refId);
  } catch (error) {
    console.warn('[points] 적립 실패:', userId, reason, error);
  }
}

/* ------------------------------------------------------------------
 * 규칙에 따른 적립
 * ------------------------------------------------------------------ */

/** 회원가입 축하 포인트 — 가입 직후 한 번만 */
export async function earnSignupPoints(userId: string): Promise<void> {
  const settings = await getPointSettings();
  if (!settings.signup.enabled) return;
  await tryEarnPoints(userId, settings.signup.amount, 'signup', '회원가입 축하');
}

/**
 * 리뷰 작성 포인트.
 * 사진·동영상이 하나라도 있으면 포토 리뷰로 봅니다.
 * @returns 실제로 적립한 금액 (0이면 적립하지 않음)
 */
export async function earnReviewPoints(
  userId: string,
  reviewId: string,
  hasAttachment: boolean
): Promise<number> {
  const settings = await getPointSettings();
  const rule = hasAttachment ? settings.reviewPhoto : settings.reviewText;
  if (!rule.enabled || rule.amount <= 0) return 0;

  await tryEarnPoints(
    userId,
    rule.amount,
    hasAttachment ? 'review_photo' : 'review_text',
    hasAttachment ? '포토 리뷰 작성' : '리뷰 작성',
    reviewId
  );
  return rule.amount;
}

/** 이 주문에서 적립했던 리뷰 포인트를 회수합니다. (주문 취소 시) */
export async function revokeOrderPoints(
  userId: string,
  orderId: string,
  usedPoints: number
): Promise<void> {
  // 1) 사용했던 포인트를 되돌려 줍니다.
  if (usedPoints > 0) {
    await tryEarnPoints(userId, usedPoints, 'cancel', '주문 취소 반환', orderId);
  }

  // 2) 이 주문의 상품에 쓴 리뷰로 적립된 포인트를 회수합니다.
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { data } = await supabase
    .from('reviews')
    .select('id')
    .eq('order_id', orderId)
    .eq('user_id', userId);

  const reviewIds = ((data ?? []) as { id: string }[]).map((row) => row.id);
  if (reviewIds.length === 0) return;

  const { data: earned } = await supabase
    .from(TABLE)
    .select('amount, ref_id')
    .eq('user_id', userId)
    .in('reason', ['review_text', 'review_photo'])
    .in('ref_id', reviewIds);

  const total = ((earned ?? []) as { amount: number }[]).reduce(
    (sum, row) => sum + row.amount,
    0
  );

  if (total > 0) {
    try {
      // 잔액이 모자라면 DB 함수가 막습니다. 이미 써 버린 경우입니다.
      await changePoints(userId, -total, 'cancel', '주문 취소로 리뷰 적립 회수', orderId);
    } catch (error) {
      console.warn('[points] 리뷰 적립 회수 실패(잔액 부족일 수 있음):', orderId, error);
    }
  }
}
