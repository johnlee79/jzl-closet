import 'server-only';

import { createHash } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import { assertWritten } from '@/lib/db-write';
import { maskName } from '@/lib/mask-name';
import { kstToday } from '@/lib/orders';
import { changePoints } from '@/lib/points';
import { getReferralSettings } from '@/lib/settings';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';
import { isReferralCode, normalizeReferralCode } from '@/lib/referral-code';

/**
 * 추천 코드 — 서버 전용. service_role 로만 접근합니다.
 *
 * ★ 이 파일의 큰 원칙
 *   1) 방문·가입 자체로는 포인트를 주지 않습니다. 숫자만 셉니다.
 *      보상은 관리자가 만든 목표를 채웠을 때만 나갑니다. (evaluateGoals)
 *   2) 실적 숫자는 profiles 행에 미리 적어 두고 화면은 그것만 읽습니다.
 *      초대 화면에서 매번 세면 회원이 늘수록 느려집니다. (3-B 포인트 잔액과 같은 방식)
 *   3) 테이블이 아직 없어도 사이트는 그대로 돕니다.
 *      schema-3f.sql 을 실행하기 전에도 상점이 멈추면 안 됩니다.
 */

const PROFILES = 'profiles';
const VISITS = 'referral_visits';
const LINKS = 'referral_links';
const GIFTS = 'referral_gifts';
const GOALS = 'referral_goals';
const ACHIEVEMENTS = 'referral_achievements';

/**
 * 목표를 고치면 이 태그를 비웁니다. (hasRunningGoal 캐시)
 * ★ 관리자 액션에서 revalidateTag 로 부르세요. 안 부르면 최대 5분 늦게 반영됩니다.
 */
export const REFERRAL_GOALS_TAG = 'referral-goals';

/** 테이블·컬럼이 아직 없을 때 오는 코드들 */
const NOT_READY = new Set(['42P01', 'PGRST205', 'PGRST202', '42703']);

function notReady(code: string | undefined): boolean {
  return Boolean(code && NOT_READY.has(code));
}

export function referralTableMissingError(): Error {
  return new Error(
    '추천 코드 테이블이 없습니다. supabase/schema-3f.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
  );
}

/* ------------------------------------------------------------------
 * 기기·회선 식별값
 * ------------------------------------------------------------------ */

/**
 * ★ IP 주소와 브라우저 정보를 원본 그대로 저장하지 않습니다.
 *   어뷰징을 가리려면 "같은가"만 알면 되지, 값 자체는 필요 없습니다.
 *   해시로 바꿔 두면 DB 가 새어 나가도 누가 어디서 접속했는지 알 수 없습니다.
 *
 * ★ 소금(salt)이 없으면 해시를 거꾸로 맞춰 볼 수 있습니다.
 *   따로 정해 두지 않았으면 서버 키를 소금으로 씁니다. 서버 밖으로 나가지 않는 값입니다.
 */
function salt(): string {
  return (
    process.env.REFERRAL_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'jzl-closet-referral'
  );
}

function hash(...parts: (string | undefined | null)[]): string {
  const body = parts.map((part) => (part ?? '').trim()).join('|');
  if (!body.replace(/\|/g, '')) return '';
  return createHash('sha256').update(`${salt()}|${body}`).digest('hex').slice(0, 32);
}

/** 요청 헤더에서 접속 회선을 알아냅니다. Vercel 은 x-forwarded-for 를 채워 줍니다. */
export function ipHashOf(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for') ?? '';
  // 여러 개가 콤마로 붙어 옵니다. 맨 앞이 실제 접속자입니다.
  const ip = forwarded.split(',')[0]?.trim() || headers.get('x-real-ip') || '';
  return ip ? hash('ip', ip) : '';
}

/**
 * 기기 식별값.
 * ★ 완벽하지 않습니다. 브라우저가 알려 주는 값만으로 만들기 때문에
 *   같은 기종·같은 브라우저면 남남끼리도 같은 값이 나올 수 있습니다.
 *   그래서 이 값 하나로 실적을 잘라 내지 않고 "보류"로만 둡니다. 판단은 사람이 합니다.
 */
export function deviceKeyOf(headers: Headers): string {
  return hash(
    'ua',
    headers.get('user-agent'),
    headers.get('accept-language'),
    headers.get('sec-ch-ua-platform')
  );
}

/* ------------------------------------------------------------------
 * 코드
 * ------------------------------------------------------------------ */

type CodeRow = { id: string; referral_code: string | null };

/**
 * 회원의 추천 코드를 돌려줍니다.
 * 아직 없으면(트리거 이전에 가입한 회원) 그 자리에서 만들어 붙입니다.
 */
export async function getReferralCode(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return '';

  const { data, error } = await supabase
    .from(PROFILES)
    .select('id, referral_code')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (notReady(error.code)) return '';
    console.warn('[referrals] 코드를 읽지 못했습니다:', error.message);
    return '';
  }

  const row = data as CodeRow | null;
  if (row?.referral_code) return row.referral_code;

  // 코드가 비어 있으면 DB 함수로 하나 뽑아 붙입니다.
  const { data: made, error: makeError } = await supabase.rpc('gen_referral_code');
  if (makeError || typeof made !== 'string') return '';

  const { error: saveError } = await supabase
    .from(PROFILES)
    .update({ referral_code: made })
    .eq('id', userId);
  if (saveError) return '';

  return made;
}

/** 코드의 주인을 찾습니다. 없는 코드면 null. */
export async function findReferrerByCode(
  rawCode: string
): Promise<{ id: string; name: string } | null> {
  const code = normalizeReferralCode(rawCode);
  if (!isReferralCode(code)) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(PROFILES)
    .select('id, name, status')
    .eq('referral_code', code)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { id: string; name: string | null; status: string | null };
  // 탈퇴한 회원의 코드는 더 이상 받지 않습니다.
  if (row.status === 'withdrawn') return null;

  return { id: row.id, name: row.name ?? '' };
}

/* ------------------------------------------------------------------
 * 방문 기록
 * ------------------------------------------------------------------ */

export type VisitInput = {
  code: string;
  /** 브라우저에 심어 둔 방문자 식별값 */
  visitorKey: string;
  ipHash: string;
  deviceKey: string;
  productSlug: string;
  /** 지금 로그인해 있는 회원. 본인 코드로 들어온 경우를 걸러 냅니다. */
  viewerId: string | null;
};

export type VisitResult =
  | { ok: true; referrerId: string; counted: boolean }
  | { ok: false; reason: 'unknown_code' | 'self' | 'not_ready' };

/**
 * 추천 링크 방문을 기록합니다.
 *
 * ★ 같은 방문자가 열 번 눌러도 1명으로 셉니다.
 *   (추천인, 방문자키) 에 유일 인덱스가 걸려 있어 두 번째부터는 DB 가 막습니다.
 *   앱에서 먼저 조회해 확인하지 않는 이유는, 동시에 두 번 들어오면
 *   둘 다 "없음"으로 읽고 둘 다 넣어 버리기 때문입니다.
 */
export async function recordVisit(input: VisitInput): Promise<VisitResult> {
  const referrer = await findReferrerByCode(input.code);
  if (!referrer) return { ok: false, reason: 'unknown_code' };

  // ★ 본인이 본인 코드로 들어온 경우는 집계하지 않습니다.
  if (input.viewerId && input.viewerId === referrer.id) {
    return { ok: false, reason: 'self' };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: 'not_ready' };

  const { error } = await supabase.from(VISITS).insert({
    referrer_id: referrer.id,
    visitor_key: input.visitorKey,
    ip_hash: input.ipHash || null,
    user_agent: input.deviceKey || null,
    product_slug: input.productSlug || null,
  });

  if (error) {
    if (notReady(error.code)) return { ok: false, reason: 'not_ready' };
    // 23505 = 이미 센 방문자입니다. 오류가 아니라 정상입니다.
    if (error.code === '23505') return { ok: true, referrerId: referrer.id, counted: false };
    console.warn('[referrals] 방문 기록 실패:', error.message);
    return { ok: true, referrerId: referrer.id, counted: false };
  }

  await refreshCounts(referrer.id);
  return { ok: true, referrerId: referrer.id, counted: true };
}

/** 집계값 다시 계산 — 실패해도 원래 작업을 막지 않습니다. */
export async function refreshCounts(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return;
  const { error } = await supabase.rpc('refresh_referral_counts', { p_user_id: userId });
  if (error && !notReady(error.code)) {
    console.warn('[referrals] 집계 갱신 실패:', userId, error.message);
  }
}

/**
 * 초대 화면을 연 회원의 기기·회선을 적어 둡니다.
 * ★ 이 값이 있어야 "초대한 사람과 가입한 사람이 같은 기기인지"를 볼 수 있습니다.
 *   초대 화면은 링크를 복사하러 들어오는 자리라, 가장 자연스러운 기록 시점입니다.
 */
export async function rememberInviterDevice(
  userId: string,
  ipHash: string,
  deviceKey: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from(PROFILES)
    .update({ referral_ip_hash: ipHash || null, referral_device_key: deviceKey || null })
    .eq('id', userId);
  if (error && !notReady(error.code)) {
    console.warn('[referrals] 기기 기록 실패:', error.message);
  }
}

/* ------------------------------------------------------------------
 * 가입 — 추천 관계 맺기
 * ------------------------------------------------------------------ */

export type AttachInput = {
  inviteeId: string;
  code: string;
  ipHash: string;
  deviceKey: string;
};

export type AttachResult =
  | { ok: true; held: boolean; reason: string }
  | { ok: false; reason: 'unknown_code' | 'self' | 'already' | 'not_ready' };

/**
 * 가입한 회원에게 추천인을 붙입니다.
 *
 * ★ 가입 자체를 막지 않습니다.
 *   코드가 틀렸다고 가입이 실패하면 손님만 손해입니다.
 *   실적으로 인정할지 말지만 여기서 정하고, 가입은 그대로 끝냅니다.
 */
export async function attachReferrer(input: AttachInput): Promise<AttachResult> {
  const referrer = await findReferrerByCode(input.code);
  if (!referrer) return { ok: false, reason: 'unknown_code' };

  // ★ 본인 추천 차단. 자기 코드로 자기가 가입할 수는 없습니다.
  if (referrer.id === input.inviteeId) return { ok: false, reason: 'self' };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: 'not_ready' };

  const hold = await judgeHold(referrer.id, input);

  const { error } = await supabase.from(LINKS).insert({
    referrer_id: referrer.id,
    invitee_id: input.inviteeId,
    status: 'signed_up',
    review_state: hold ? 'held' : 'approved',
    hold_reason: hold,
    ip_hash: input.ipHash || null,
    device_key: input.deviceKey || null,
  });

  if (error) {
    if (notReady(error.code)) return { ok: false, reason: 'not_ready' };
    // 이미 추천인이 있는 회원입니다. 나중 것으로 덮어쓰지 않습니다.
    if (error.code === '23505') return { ok: false, reason: 'already' };
    console.warn('[referrals] 추천 관계 저장 실패:', error.message);
    return { ok: false, reason: 'not_ready' };
  }

  // profiles 에도 남겨 두면 회원 화면에서 조인 없이 바로 읽을 수 있습니다.
  await supabase
    .from(PROFILES)
    .update({ referred_by: referrer.id, referred_at: new Date().toISOString() })
    .eq('id', input.inviteeId);

  await refreshCounts(referrer.id);
  // 가입 기준 목표가 있으면 여기서 바로 채워집니다.
  if (!hold) await evaluateGoals(referrer.id);

  return { ok: true, held: Boolean(hold), reason: hold };
}

/**
 * 같은 기기·회선인지 봅니다. 걸리면 보류 사유를 돌려주고, 아니면 빈 문자열.
 *
 * ★ 두 가지를 봅니다.
 *   1) 초대한 사람이 마지막으로 초대 화면을 연 기기·회선과 같은가
 *      → 혼자서 계정을 하나 더 만든 경우입니다.
 *   2) 이 추천인이 이미 데려온 다른 회원과 같은 기기·회선인가
 *      → 한 사람이 계정을 여러 개 만들어 실적을 부풀리는 경우입니다.
 *
 * ★ 자동으로 거절하지 않고 보류만 하는 이유
 *   가족이 같은 공유기를 쓰거나, 매장에서 옆에 두고 가입시키는 경우가 실제로 흔합니다.
 *   기계가 잘라 내면 정상 손님이 억울해집니다. 관리자가 보고 정합니다.
 */
async function judgeHold(referrerId: string, input: AttachInput): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return '';
  if (!input.ipHash && !input.deviceKey) return '';

  // 1) 추천인 본인의 기기·회선
  const { data: inviter } = await supabase
    .from(PROFILES)
    .select('referral_ip_hash, referral_device_key')
    .eq('id', referrerId)
    .maybeSingle();

  const me = (inviter ?? {}) as {
    referral_ip_hash?: string | null;
    referral_device_key?: string | null;
  };

  if (input.deviceKey && me.referral_device_key === input.deviceKey) {
    if (input.ipHash && me.referral_ip_hash === input.ipHash) {
      return '초대한 회원과 같은 기기·같은 회선에서 가입했습니다';
    }
    return '초대한 회원과 같은 기기에서 가입했습니다';
  }
  if (input.ipHash && me.referral_ip_hash === input.ipHash) {
    return '초대한 회원과 같은 회선(IP)에서 가입했습니다';
  }

  // 2) 같은 추천인이 데려온 다른 회원과 겹치는지
  const or: string[] = [];
  if (input.ipHash) or.push(`ip_hash.eq.${input.ipHash}`);
  if (input.deviceKey) or.push(`device_key.eq.${input.deviceKey}`);

  const { data: siblings } = await supabase
    .from(LINKS)
    .select('id')
    .eq('referrer_id', referrerId)
    .or(or.join(','))
    .limit(1);

  if (Array.isArray(siblings) && siblings.length > 0) {
    return '같은 기기·회선에서 이미 다른 친구가 가입했습니다';
  }

  return '';
}

/* ------------------------------------------------------------------
 * 첫 구매
 * ------------------------------------------------------------------ */

/**
 * 추천으로 가입한 회원이 첫 주문을 마쳤을 때 부릅니다.
 * ★ 배송완료·구매확정에서만 부릅니다. 주문 즉시가 아닙니다.
 *   주문 직후에 인정하면 취소·반품 때 실적을 되돌리는 일이 훨씬 복잡해집니다.
 */
export async function markFirstPurchase(
  userId: string,
  orderId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return;

  const { data, error } = await supabase
    .from(LINKS)
    .update({
      status: 'purchased',
      first_order_id: orderId,
      purchased_at: new Date().toISOString(),
    })
    .eq('invitee_id', userId)
    // ★ 이미 첫 구매로 잡혀 있으면 건드리지 않습니다. "첫" 구매여야 합니다.
    .eq('status', 'signed_up')
    .select('referrer_id, review_state');

  if (error) {
    if (!notReady(error.code)) {
      console.warn('[referrals] 첫 구매 기록 실패:', userId, error.message);
    }
    return;
  }

  const rows = (data ?? []) as { referrer_id: string; review_state: string }[];
  for (const row of rows) {
    await refreshCounts(row.referrer_id);
    if (row.review_state === 'approved') await evaluateGoals(row.referrer_id);
  }
}

/**
 * 취소·반품으로 첫 구매 실적을 되돌립니다.
 * ★ 이미 나간 보상은 회수하지 않습니다.
 *   포인트를 도로 빼앗으면 손님과 다툼이 됩니다.
 *   대신 진행률을 되돌려, 다음 회차 지급이 그만큼 늦어지게 합니다.
 *   관리자 화면에서 되돌린 내역을 볼 수 있습니다.
 */
export async function revertFirstPurchase(
  userId: string,
  orderId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return;

  const { data, error } = await supabase
    .from(LINKS)
    .update({ status: 'signed_up', first_order_id: null, purchased_at: null })
    .eq('invitee_id', userId)
    .eq('first_order_id', orderId)
    .select('referrer_id');

  if (error) {
    if (!notReady(error.code)) {
      console.warn('[referrals] 첫 구매 회수 실패:', userId, error.message);
    }
    return;
  }

  for (const row of (data ?? []) as { referrer_id: string }[]) {
    await refreshCounts(row.referrer_id);
  }
}

/* ------------------------------------------------------------------
 * 사은품
 * ------------------------------------------------------------------ */

export type Gift = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  isVisible: boolean;
  displayOrder: number;
};

type GiftRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  is_visible: boolean | null;
  display_order: number | null;
};

function toGift(row: GiftRow): Gift {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    imageUrl: row.image_url ?? '',
    linkUrl: row.link_url ?? '',
    isVisible: row.is_visible !== false,
    displayOrder: row.display_order ?? 0,
  };
}

export async function getGifts(includeHidden = false): Promise<Gift[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase.from(GIFTS).select('*');
  if (!includeHidden) query = query.eq('is_visible', true);

  const { data, error } = await query
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return (data as GiftRow[]).map(toGift);
}

export type GiftInput = Omit<Gift, 'id'>;

export async function createGift(input: GiftInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(GIFTS).insert(giftToRow(input));
  if (error) {
    if (notReady(error.code)) throw referralTableMissingError();
    throw new Error(`사은품을 저장하지 못했습니다: ${error.message}`);
  }
}

export async function updateGift(id: string, input: GiftInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase.from(GIFTS).update(giftToRow(input)).eq('id', id).select('id'),
    '사은품을 수정하지 못했습니다'
  );
}

export async function deleteGift(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase.from(GIFTS).delete().eq('id', id).select('id'),
    '사은품을 지우지 못했습니다'
  );
}

function giftToRow(input: GiftInput) {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    image_url: input.imageUrl.trim(),
    link_url: input.linkUrl.trim(),
    is_visible: input.isVisible,
    display_order: input.displayOrder,
  };
}

/* ------------------------------------------------------------------
 * 목표
 * ------------------------------------------------------------------ */

export type GoalCriteria = 'signup' | 'purchase';
export type RewardType = 'point' | 'gift';

export type Goal = {
  id: string;
  name: string;
  criteria: GoalCriteria;
  targetCount: number;
  rewardType: RewardType;
  rewardPoints: number;
  giftId: string | null;
  startsOn: string;
  endsOn: string;
  isRepeatable: boolean;
  isActive: boolean;
  displayOrder: number;
  /** 화면에 그릴 때만 채웁니다. */
  gift?: Gift | null;
};

type GoalRow = {
  id: string;
  name: string;
  criteria: string;
  target_count: number;
  reward_type: string;
  reward_points: number | null;
  gift_id: string | null;
  starts_on: string | null;
  ends_on: string | null;
  is_repeatable: boolean | null;
  is_active: boolean | null;
  display_order: number | null;
  gift?: GiftRow | null;
};

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    criteria: row.criteria === 'signup' ? 'signup' : 'purchase',
    targetCount: Math.max(1, row.target_count ?? 1),
    rewardType: row.reward_type === 'gift' ? 'gift' : 'point',
    rewardPoints: row.reward_points ?? 0,
    giftId: row.gift_id,
    startsOn: row.starts_on ?? '',
    endsOn: row.ends_on ?? '',
    isRepeatable: row.is_repeatable === true,
    isActive: row.is_active !== false,
    displayOrder: row.display_order ?? 0,
    gift: row.gift ? toGift(row.gift) : null,
  };
}

/**
 * 오늘 진행 중인 목표인지.
 * ★ 날짜만 비교합니다. 시각을 섞으면 한국시간 자정 근처가 어긋납니다.
 *   (3-C 팝업에서 실제로 9시간 밀렸던 그 문제입니다)
 */
export function isGoalRunning(goal: Goal, today = kstToday()): boolean {
  if (!goal.isActive) return false;
  if (goal.startsOn && today < goal.startsOn) return false;
  if (goal.endsOn && today > goal.endsOn) return false;
  return true;
}

export async function getGoals(includeInactive = false): Promise<Goal[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // ★ 사은품까지 한 번에 읽습니다. 목표마다 따로 읽으면 조회가 배로 늡니다.
  let query = supabase.from(GOALS).select('*, gift:referral_gifts(*)');
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return (data as GoalRow[]).map(toGoal);
}

/**
 * 지금 진행 중인 목표 이벤트가 하나라도 있는지.
 *
 * ★ 상품 상세의 공유 안내(3-G)가 이 값 하나로 갈립니다.
 *   상품 페이지마다 목표 표를 새로 읽으면 상세 조회가 통째로 한 번 더 늘어납니다.
 *   그래서 결과(true/false)만 캐시에 담아 둡니다. 담기는 건 불리언 하나입니다.
 *
 * ★ 5분마다 다시 봅니다.
 *   판단 기준이 "오늘 날짜" 라 무한정 들고 있으면 이벤트 시작·종료일이 지나도
 *   한동안 예전 답이 나갑니다. 목표를 고치면 관리자 액션이 태그로 즉시 비웁니다.
 */
export const hasRunningGoal = unstable_cache(
  async (): Promise<boolean> => {
    // is_active = true 인 것만 가져오고, 기간은 여기서 한 번 더 봅니다.
    const goals = await getGoals();
    const today = kstToday();
    return goals.some((goal) => isGoalRunning(goal, today));
  },
  ['referral-running-goal'],
  { tags: [REFERRAL_GOALS_TAG], revalidate: 300 }
);

export type GoalInput = Omit<Goal, 'id' | 'gift'>;

function goalToRow(input: GoalInput) {
  return {
    name: input.name.trim(),
    criteria: input.criteria,
    target_count: Math.max(1, Math.trunc(input.targetCount)),
    reward_type: input.rewardType,
    reward_points: input.rewardType === 'point' ? Math.max(0, Math.trunc(input.rewardPoints)) : 0,
    gift_id: input.rewardType === 'gift' ? input.giftId : null,
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
    is_repeatable: input.isRepeatable,
    is_active: input.isActive,
    display_order: input.displayOrder,
  };
}

export async function createGoal(input: GoalInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(GOALS).insert(goalToRow(input));
  if (error) {
    if (notReady(error.code)) throw referralTableMissingError();
    throw new Error(`목표를 저장하지 못했습니다: ${error.message}`);
  }
}

export async function updateGoal(id: string, input: GoalInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase.from(GOALS).update(goalToRow(input)).eq('id', id).select('id'),
    '목표를 수정하지 못했습니다'
  );
}

export async function deleteGoal(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase.from(GOALS).delete().eq('id', id).select('id'),
    '목표를 지우지 못했습니다'
  );
}

/* ------------------------------------------------------------------
 * 달성 · 지급
 * ------------------------------------------------------------------ */

export type AchievementStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'held'
  | 'rejected';

export type Achievement = {
  id: string;
  goalId: string;
  userId: string;
  round: number;
  achievedCount: number;
  rewardType: RewardType;
  rewardPoints: number;
  giftId: string | null;
  status: AchievementStatus;
  holdReason: string;
  shipName: string;
  shipPhone: string;
  shipPostcode: string;
  shipAddress1: string;
  shipAddress2: string;
  courier: string;
  trackingNo: string;
  shippedAt: string | null;
  memo: string;
  createdAt: string;
  /** 화면용 */
  goalName?: string;
  giftName?: string;
  userName?: string;
};

type AchievementRow = {
  id: string;
  goal_id: string;
  user_id: string;
  round: number;
  achieved_count: number | null;
  reward_type: string;
  reward_points: number | null;
  gift_id: string | null;
  status: string;
  hold_reason: string | null;
  ship_name: string | null;
  ship_phone: string | null;
  ship_postcode: string | null;
  ship_address1: string | null;
  ship_address2: string | null;
  courier: string | null;
  tracking_no: string | null;
  shipped_at: string | null;
  memo: string | null;
  created_at: string;
  goal?: { name?: string | null } | null;
  gift?: { name?: string | null } | null;
  member?: { name?: string | null } | null;
};

function toAchievement(row: AchievementRow): Achievement {
  return {
    id: row.id,
    goalId: row.goal_id,
    userId: row.user_id,
    round: row.round ?? 1,
    achievedCount: row.achieved_count ?? 0,
    rewardType: row.reward_type === 'gift' ? 'gift' : 'point',
    rewardPoints: row.reward_points ?? 0,
    giftId: row.gift_id,
    status: (row.status as AchievementStatus) ?? 'pending',
    holdReason: row.hold_reason ?? '',
    shipName: row.ship_name ?? '',
    shipPhone: row.ship_phone ?? '',
    shipPostcode: row.ship_postcode ?? '',
    shipAddress1: row.ship_address1 ?? '',
    shipAddress2: row.ship_address2 ?? '',
    courier: row.courier ?? '',
    trackingNo: row.tracking_no ?? '',
    shippedAt: row.shipped_at,
    memo: row.memo ?? '',
    createdAt: row.created_at,
    goalName: row.goal?.name ?? '',
    giftName: row.gift?.name ?? '',
    userName: row.member?.name ?? '',
  };
}

const ACHIEVEMENT_SELECT =
  '*, goal:referral_goals(name), gift:referral_gifts(name), member:profiles(name)';

export async function getAchievementsOf(userId: string): Promise<Achievement[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from(ACHIEVEMENTS)
    .select(ACHIEVEMENT_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as AchievementRow[]).map(toAchievement);
}

/**
 * 이번 달에 추천 보상으로 이미 나간 포인트.
 * ★ 한 달 경계는 한국시간입니다. UTC 로 세면 매달 1일 오전 9시까지가 지난달로 잡힙니다.
 */
async function paidThisMonth(): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const monthStart = `${kstToday().slice(0, 7)}-01`;
  const from = new Date(`${monthStart}T00:00:00+09:00`).toISOString();

  const { data, error } = await supabase
    .from(ACHIEVEMENTS)
    .select('reward_points')
    .eq('reward_type', 'point')
    .eq('status', 'paid')
    .gte('created_at', from);

  if (error || !data) return 0;
  return (data as { reward_points: number | null }[]).reduce(
    (sum, row) => sum + (row.reward_points ?? 0),
    0
  );
}

/**
 * 목표를 다 채웠는지 보고, 채웠으면 달성 기록을 만들고 보상을 처리합니다.
 *
 * ★ 이 함수만이 보상을 만듭니다.
 *   방문·가입·구매를 기록하는 곳에서는 절대 포인트를 건드리지 않습니다.
 *   지급 조건을 한 곳에 모아 두어야 "왜 줬는지"를 나중에 따라갈 수 있습니다.
 *
 * @returns 이번에 새로 만든 달성 기록
 */
export async function evaluateGoals(userId: string): Promise<Achievement[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return [];

  const { data: profile, error: profileError } = await supabase
    .from(PROFILES)
    .select('referral_signup_count, referral_purchase_count')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) return [];

  const counts = profile as {
    referral_signup_count: number | null;
    referral_purchase_count: number | null;
  };

  const [goals, settings] = await Promise.all([getGoals(false), getReferralSettings()]);
  if (!settings.enabled) return [];

  const today = kstToday();
  const running = goals.filter((goal) => isGoalRunning(goal, today));
  if (running.length === 0) return [];

  // 이미 준 회차를 알아야 다음 회차를 정할 수 있습니다.
  const { data: doneRows } = await supabase
    .from(ACHIEVEMENTS)
    .select('goal_id, round')
    .eq('user_id', userId);

  const maxRound = new Map<string, number>();
  for (const row of (doneRows ?? []) as { goal_id: string; round: number }[]) {
    maxRound.set(row.goal_id, Math.max(maxRound.get(row.goal_id) ?? 0, row.round));
  }

  const made: Achievement[] = [];
  let spent = await paidThisMonth();

  for (const goal of running) {
    const achieved =
      goal.criteria === 'signup'
        ? (counts.referral_signup_count ?? 0)
        : (counts.referral_purchase_count ?? 0);

    // 목표를 몇 번 채울 만큼 모았는지. 반복이 아니면 1회가 끝입니다.
    const earned = Math.floor(achieved / goal.targetCount);
    const rounds = goal.isRepeatable ? earned : Math.min(1, earned);
    const already = maxRound.get(goal.id) ?? 0;

    for (let round = already + 1; round <= rounds; round += 1) {
      /*
       * ★ 월 한도를 넘으면 지급하지 않고 보류로 둡니다.
       *   기록은 남깁니다. 지우면 나중에 무슨 일이 있었는지 알 수 없습니다.
       */
      const overCap =
        goal.rewardType === 'point' &&
        settings.monthlyPointCap > 0 &&
        spent + goal.rewardPoints > settings.monthlyPointCap;

      /*
       * 처음에는 무조건 pending 으로 넣습니다.
       * 포인트는 바로 아래에서 지급하고 paid 로 바꿉니다.
       * 사은품은 관리자가 발송해야 하므로 pending 인 채로 남습니다.
       * 한도를 넘었으면 지급하지 않고 held 로 두어 관리자가 보게 합니다.
       */
      const status: AchievementStatus = overCap ? 'held' : 'pending';

      const { data: created, error } = await supabase
        .from(ACHIEVEMENTS)
        .insert({
          goal_id: goal.id,
          user_id: userId,
          round,
          achieved_count: achieved,
          reward_type: goal.rewardType,
          reward_points: goal.rewardType === 'point' ? goal.rewardPoints : 0,
          gift_id: goal.rewardType === 'gift' ? goal.giftId : null,
          status,
          hold_reason: overCap
            ? `이번 달 추천 보상 한도(${settings.monthlyPointCap.toLocaleString('ko-KR')}P)를 넘어 보류했습니다`
            : null,
        })
        .select(ACHIEVEMENT_SELECT)
        .single();

      if (error) {
        // 23505 = 이미 만들어진 회차입니다. 동시에 두 번 불린 경우라 그냥 넘어갑니다.
        if (error.code !== '23505' && !notReady(error.code)) {
          console.warn('[referrals] 달성 기록 실패:', goal.id, error.message);
        }
        continue;
      }

      const achievement = toAchievement(created as AchievementRow);

      // 포인트는 바로 지급합니다. 사은품은 관리자가 확인 후 발송합니다.
      if (achievement.rewardType === 'point' && !overCap && achievement.rewardPoints > 0) {
        try {
          await changePoints(
            userId,
            achievement.rewardPoints,
            'referral',
            `${goal.name} 달성`,
            achievement.id
          );
          await supabase
            .from(ACHIEVEMENTS)
            .update({ status: 'paid' })
            .eq('id', achievement.id);
          achievement.status = 'paid';
          spent += achievement.rewardPoints;
        } catch (payError) {
          console.warn('[referrals] 포인트 지급 실패:', achievement.id, payError);
        }
      }

      made.push(achievement);
    }
  }

  return made;
}

/* ------------------------------------------------------------------
 * 관리자 — 처리
 * ------------------------------------------------------------------ */

/**
 * 보류된 추천을 인정하거나 거절합니다.
 * @returns 추천인의 id (집계를 다시 세야 하므로)
 */
export async function judgeLink(id: string, approve: boolean): Promise<string> {
  const supabase = requireSupabaseAdmin();
  const rows = assertWritten(
    await supabase
      .from(LINKS)
      .update({
        review_state: approve ? 'approved' : 'rejected',
        hold_reason: approve ? null : '관리자가 인정하지 않았습니다',
      })
      .eq('id', id)
      .select('referrer_id'),
    '처리하지 못했습니다'
  );
  const first = (rows as unknown as { referrer_id: string }[])[0];
  return first?.referrer_id ?? '';
}

export async function setAchievementStatus(
  id: string,
  status: AchievementStatus,
  reason = ''
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase
      .from(ACHIEVEMENTS)
      .update({ status, hold_reason: reason || null })
      .eq('id', id)
      .select('id'),
    '처리하지 못했습니다'
  );
}

export type ShippingInput = {
  shipName: string;
  shipPhone: string;
  shipPostcode: string;
  shipAddress1: string;
  shipAddress2: string;
  memo: string;
};

export async function updateShipping(id: string, input: ShippingInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase
      .from(ACHIEVEMENTS)
      .update({
        ship_name: input.shipName.trim(),
        ship_phone: input.shipPhone.trim(),
        ship_postcode: input.shipPostcode.trim(),
        ship_address1: input.shipAddress1.trim(),
        ship_address2: input.shipAddress2.trim(),
        memo: input.memo.trim(),
        // 받는 분 정보를 채웠다는 것은 보낼 준비를 시작했다는 뜻입니다.
        status: 'preparing',
      })
      .eq('id', id)
      .select('id'),
    '받는 분 정보를 저장하지 못했습니다'
  );
}

export async function markShipped(
  id: string,
  courier: string,
  trackingNo: string
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase
      .from(ACHIEVEMENTS)
      .update({
        courier: courier.trim(),
        tracking_no: trackingNo.trim(),
        status: 'shipped',
        shipped_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id'),
    '발송 처리를 하지 못했습니다'
  );
}

/* ------------------------------------------------------------------
 * 관리자 — 조회
 * ------------------------------------------------------------------ */

export type ReferrerSummary = {
  id: string;
  name: string;
  email: string;
  code: string;
  visitCount: number;
  signupCount: number;
  purchaseCount: number;
};

/**
 * 추천인별 현황.
 * ★ profiles 에 미리 세어 둔 숫자를 그대로 읽습니다.
 *   기록을 매번 집계하면 회원이 늘수록 관리자 화면이 느려집니다.
 */
export async function getReferrerSummaries(
  search = '',
  sort: 'purchase' | 'signup' | 'visit' = 'purchase',
  limit = 100
): Promise<ReferrerSummary[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const column =
    sort === 'signup'
      ? 'referral_signup_count'
      : sort === 'visit'
        ? 'referral_visit_count'
        : 'referral_purchase_count';

  let query = supabase
    .from(PROFILES)
    .select(
      'id, name, email, referral_code, referral_visit_count, referral_signup_count, referral_purchase_count'
    );

  const term = search.trim().replace(/[%,().]/g, '');
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,email.ilike.%${term}%,referral_code.ilike.%${term}%`
    );
  } else {
    // 검색이 없으면 실적이 하나라도 있는 사람만 보여 줍니다.
    // 전 회원을 늘어놓으면 정작 볼 사람이 묻힙니다.
    query = query.gt(column, 0);
  }

  const { data, error } = await query.order(column, { ascending: false }).limit(limit);
  if (error || !data) return [];

  return (
    data as {
      id: string;
      name: string | null;
      email: string | null;
      referral_code: string | null;
      referral_visit_count: number | null;
      referral_signup_count: number | null;
      referral_purchase_count: number | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name ?? '',
    email: row.email ?? '',
    code: row.referral_code ?? '',
    visitCount: row.referral_visit_count ?? 0,
    signupCount: row.referral_signup_count ?? 0,
    purchaseCount: row.referral_purchase_count ?? 0,
  }));
}

export async function getAchievements(
  status?: AchievementStatus | 'all',
  rewardType?: RewardType
): Promise<Achievement[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase.from(ACHIEVEMENTS).select(ACHIEVEMENT_SELECT);
  if (status && status !== 'all') query = query.eq('status', status);
  if (rewardType) query = query.eq('reward_type', rewardType);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error || !data) return [];
  return (data as AchievementRow[]).map(toAchievement);
}

export type HeldLink = {
  id: string;
  referrerName: string;
  referrerCode: string;
  inviteeName: string;
  inviteeEmail: string;
  reason: string;
  createdAt: string;
  /** 같은 기기인지 · 같은 회선인지 (해시가 같은지만 알려 줍니다) */
  sameDevice: boolean;
  sameIp: boolean;
};

/**
 * 보류된 추천 목록.
 * ★ 화면에는 해시값 자체를 보여 주지 않습니다. 관리자에게도 필요 없는 값입니다.
 *   "같은 기기인가 / 같은 회선인가" 라는 판단 재료만 내려보냅니다.
 */
export async function getHeldLinks(): Promise<HeldLink[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(LINKS)
    .select(
      'id, hold_reason, created_at, ip_hash, device_key, ' +
        'referrer:profiles!referral_links_referrer_id_fkey(name, referral_code, referral_ip_hash, referral_device_key), ' +
        'invitee:profiles!referral_links_invitee_id_fkey(name, email)'
    )
    .eq('review_state', 'held')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];

  type Row = {
    id: string;
    hold_reason: string | null;
    created_at: string;
    ip_hash: string | null;
    device_key: string | null;
    referrer:
      | {
          name?: string | null;
          referral_code?: string | null;
          referral_ip_hash?: string | null;
          referral_device_key?: string | null;
        }
      | null
      | Array<Record<string, unknown>>;
    invitee: { name?: string | null; email?: string | null } | null | Array<Record<string, unknown>>;
  };

  return (data as unknown as Row[]).map((row) => {
    const referrer = (Array.isArray(row.referrer) ? row.referrer[0] : row.referrer) as
      | {
          name?: string | null;
          referral_code?: string | null;
          referral_ip_hash?: string | null;
          referral_device_key?: string | null;
        }
      | undefined;
    const invitee = (Array.isArray(row.invitee) ? row.invitee[0] : row.invitee) as
      | { name?: string | null; email?: string | null }
      | undefined;

    return {
      id: row.id,
      referrerName: referrer?.name ?? '',
      referrerCode: referrer?.referral_code ?? '',
      inviteeName: invitee?.name ?? '',
      inviteeEmail: invitee?.email ?? '',
      reason: row.hold_reason ?? '',
      createdAt: row.created_at,
      sameDevice: Boolean(
        row.device_key && referrer?.referral_device_key === row.device_key
      ),
      sameIp: Boolean(row.ip_hash && referrer?.referral_ip_hash === row.ip_hash),
    };
  });
}

export type ReferralStats = {
  visits: number;
  signups: number;
  purchases: number;
  /** 방문 → 가입 (%) */
  signupRate: number;
  /** 가입 → 구매 (%) */
  purchaseRate: number;
  heldCount: number;
  paidPoints: number;
};

/**
 * 기간별 통계.
 * ★ 기간 경계는 한국시간 날짜입니다. UTC 로 자르면 하루가 9시간씩 밀립니다.
 */
export async function getReferralStats(from: string, to: string): Promise<ReferralStats> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      visits: 0,
      signups: 0,
      purchases: 0,
      signupRate: 0,
      purchaseRate: 0,
      heldCount: 0,
      paidPoints: 0,
    };
  }

  const start = new Date(`${from}T00:00:00+09:00`).toISOString();
  const end = new Date(`${to}T23:59:59.999+09:00`).toISOString();

  const head = { count: 'exact' as const, head: true };

  const [visits, signups, purchases, held, paid] = await Promise.all([
    supabase
      .from(VISITS)
      .select('id', head)
      .gte('created_at', start)
      .lte('created_at', end),
    supabase
      .from(LINKS)
      .select('id', head)
      .eq('review_state', 'approved')
      .gte('created_at', start)
      .lte('created_at', end),
    supabase
      .from(LINKS)
      .select('id', head)
      .eq('review_state', 'approved')
      .eq('status', 'purchased')
      .gte('purchased_at', start)
      .lte('purchased_at', end),
    supabase.from(LINKS).select('id', head).eq('review_state', 'held'),
    supabase
      .from(ACHIEVEMENTS)
      .select('reward_points')
      .eq('reward_type', 'point')
      .eq('status', 'paid')
      .gte('created_at', start)
      .lte('created_at', end),
  ]);

  const visitCount = visits.count ?? 0;
  const signupCount = signups.count ?? 0;
  const purchaseCount = purchases.count ?? 0;

  return {
    visits: visitCount,
    signups: signupCount,
    purchases: purchaseCount,
    // 0으로 나누지 않도록 막습니다.
    signupRate: visitCount > 0 ? Math.round((signupCount / visitCount) * 1000) / 10 : 0,
    purchaseRate:
      signupCount > 0 ? Math.round((purchaseCount / signupCount) * 1000) / 10 : 0,
    heldCount: held.count ?? 0,
    paidPoints: ((paid.data ?? []) as { reward_points: number | null }[]).reduce(
      (sum, row) => sum + (row.reward_points ?? 0),
      0
    ),
  };
}

/**
 * 회원의 마지막 배송지. 사은품 받는 분 정보를 미리 채우는 데 씁니다.
 * ★ 미리 채우되 관리자가 고칠 수 있습니다.
 *   사은품을 다른 곳으로 받고 싶다는 요청이 실제로 들어옵니다.
 */
export async function getLastShippingOf(userId: string): Promise<ShippingInput | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;

  const { data } = await supabase
    .from('orders')
    .select('receiver_name, receiver_phone, postcode, address1, address2')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    const row = data as Record<string, string | null>;
    return {
      shipName: row.receiver_name ?? '',
      shipPhone: row.receiver_phone ?? '',
      shipPostcode: row.postcode ?? '',
      shipAddress1: row.address1 ?? '',
      shipAddress2: row.address2 ?? '',
      memo: '',
    };
  }

  // 주문이 없으면 회원정보의 주소를 씁니다.
  const { data: profile } = await supabase
    .from(PROFILES)
    .select('name, phone, postcode, address1, address2')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return null;
  const row = profile as Record<string, string | null>;
  return {
    shipName: row.name ?? '',
    shipPhone: row.phone ?? '',
    shipPostcode: row.postcode ?? '',
    shipAddress1: row.address1 ?? '',
    shipAddress2: row.address2 ?? '',
    memo: '',
  };
}

/* ------------------------------------------------------------------
 * 마이페이지 — 친구 초대 화면
 * ------------------------------------------------------------------ */

export type InviteEntry = {
  /** 이미 가려진 이름. 원본은 절대 화면으로 내려보내지 않습니다. */
  maskedName: string;
  state: 'visited' | 'signed_up' | 'purchased' | 'held';
  date: string;
};

export type GoalProgress = {
  goal: Goal;
  current: number;
  /** 이번 회차에서 채워야 할 수 */
  target: number;
  /** 지금까지 몇 번 달성했는지 */
  doneRounds: number;
  achievements: Achievement[];
};

export type InviteScreen = {
  code: string;
  visitCount: number;
  signupCount: number;
  purchaseCount: number;
  goals: GoalProgress[];
  entries: InviteEntry[];
};

/**
 * 초대 화면에 필요한 모든 것을 읽습니다.
 *
 * ★ DB 조회는 5번입니다. (설정은 캐시라 매번 두드리지 않습니다)
 *   1) 내 코드와 집계값 (profiles 한 행)
 *   2) 진행 중인 목표 + 사은품 (한 번에 조인)
 *   3) 내 달성 기록
 *   4) 내가 데려온 사람 (이름 조인)
 *   5) 내 링크 방문 기록
 *   집계값을 매번 세지 않고 profiles 에 적어 둔 숫자를 읽기 때문에
 *   친구가 몇 명이 되든 조회 수는 그대로입니다.
 */
export async function getInviteScreen(userId: string): Promise<InviteScreen | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;

  const { data: profile, error } = await supabase
    .from(PROFILES)
    .select(
      'referral_code, referral_visit_count, referral_signup_count, referral_purchase_count'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) return null;

  const me = profile as {
    referral_code: string | null;
    referral_visit_count: number | null;
    referral_signup_count: number | null;
    referral_purchase_count: number | null;
  };

  const [goals, achievements, links, visits] = await Promise.all([
    getGoals(false),
    getAchievementsOf(userId),
    supabase
      .from(LINKS)
      .select(
        'status, review_state, created_at, purchased_at, invitee:profiles!referral_links_invitee_id_fkey(name, status)'
      )
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from(VISITS)
      .select('created_at')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const today = kstToday();
  const signupCount = me.referral_signup_count ?? 0;
  const purchaseCount = me.referral_purchase_count ?? 0;

  const progress: GoalProgress[] = goals
    .filter((goal) => isGoalRunning(goal, today))
    .map((goal) => {
      const current = goal.criteria === 'signup' ? signupCount : purchaseCount;
      const mine = achievements.filter((item) => item.goalId === goal.id);
      const doneRounds = mine.length;
      return {
        goal,
        current,
        target: goal.targetCount * (goal.isRepeatable ? doneRounds + 1 : 1),
        doneRounds,
        achievements: mine,
      };
    });

  type LinkRow = {
    status: string;
    review_state: string;
    created_at: string;
    purchased_at: string | null;
    // supabase 조인 결과는 배열로 올 수도, 객체로 올 수도 있습니다.
    invitee: Joined | Joined[] | null;
  };

  type Joined = { name?: string | null; status?: string | null };

  const entries: InviteEntry[] = [];

  for (const row of ((links.data ?? []) as unknown as LinkRow[])) {
    const joined = Array.isArray(row.invitee) ? row.invitee[0] : row.invitee;

    /*
     * ★ 탈퇴한 회원은 추천 관계만 남기고 이름은 그대로 두지 않습니다.
     *   탈퇴하면 이름이 '탈퇴회원' 으로 바뀌는데, 그걸 다시 가리면
     *   '탈**원' 같은 이상한 글자가 됩니다. 그냥 탈퇴했다고 적습니다.
     */
    const withdrawn = joined?.status === 'withdrawn';

    entries.push({
      // ★ 여기서 가립니다. 원본 이름은 이 함수 밖으로 나가지 않습니다.
      maskedName: withdrawn
        ? '탈퇴한 회원'
        : maskName(joined?.name ?? '') || '이름 없음',
      state:
        row.review_state !== 'approved'
          ? 'held'
          : row.status === 'purchased'
            ? 'purchased'
            : 'signed_up',
      date: row.purchased_at ?? row.created_at,
    });
  }

  for (const row of ((visits.data ?? []) as { created_at: string }[])) {
    // ★ 방문자는 누구인지 모릅니다. 가입 전이라 이름 자체가 없습니다.
    entries.push({ maskedName: '방문한 손님', state: 'visited', date: row.created_at });
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    code: me.referral_code ?? '',
    visitCount: me.referral_visit_count ?? 0,
    signupCount,
    purchaseCount,
    goals: progress,
    entries: entries.slice(0, 30),
  };
}
