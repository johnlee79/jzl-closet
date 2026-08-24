'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import { changePoints } from '@/lib/points';
import {
  createGift,
  createGoal,
  deleteGift,
  deleteGoal,
  evaluateGoals,
  judgeLink,
  markShipped,
  refreshCounts,
  setAchievementStatus,
  REFERRAL_GOALS_TAG,
  updateGift,
  updateGoal,
  updateShipping,
  type GiftInput,
  type GoalInput,
  type ShippingInput,
} from '@/lib/referrals';
import {
  SETTINGS_TAG,
  normalizeReferral,
  writeSetting,
  REFERRAL_KEY,
} from '@/lib/settings';
import { notifyReferralReward } from '@/lib/telegram';
import type { ReferralSettings } from '@/lib/site-config';

/**
 * 관리자 — 추천 코드(목표·사은품·달성 처리·의심 건 검토).
 *
 * ★ 모든 액션이 자기 손으로 관리자 확인을 합니다.
 *   미들웨어는 /admin 화면만 막습니다. 서버 액션은 따로 확인하지 않으면
 *   주소만 알면 누구나 부를 수 있습니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin/referral]', message);
  return { ok: false, error: message };
}

function refresh(): void {
  revalidatePath('/admin/referrals');
  revalidatePath('/admin/referrals/goals');
  revalidatePath('/admin/referrals/rewards');
  revalidatePath('/admin/referrals/review');
  // 회원이 보는 초대 화면도 다시 그려야 목표가 바로 반영됩니다.
  revalidatePath('/mypage/invite');
  // ★ 상품 상세 공유 안내가 "이벤트 진행 중인지" 를 캐시로 들고 있습니다. (3-G)
  //   목표를 켜고 끄면 여기서 비워 줘야 바로 문구가 바뀝니다.
  revalidateTag(REFERRAL_GOALS_TAG);
}

/* ── 사은품 ──────────────────────────────────────────────── */

export async function saveGiftAction(
  input: GiftInput,
  id?: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!input.name.trim()) return { ok: false, error: '사은품 이름을 입력해 주세요.' };

  try {
    if (id) await updateGift(id, input);
    else await createGift(input);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '사은품을 저장하지 못했습니다.');
  }
}

export async function deleteGiftAction(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    await deleteGift(id);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '사은품을 지우지 못했습니다.');
  }
}

/* ── 목표 ────────────────────────────────────────────────── */

export async function saveGoalAction(
  input: GoalInput,
  id?: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!input.name.trim()) return { ok: false, error: '목표 이름을 입력해 주세요.' };
  if (input.targetCount < 1) return { ok: false, error: '목표 인원은 1명 이상이어야 합니다.' };
  if (input.rewardType === 'point' && input.rewardPoints <= 0) {
    return { ok: false, error: '지급할 포인트를 입력해 주세요.' };
  }
  if (input.rewardType === 'gift' && !input.giftId) {
    return { ok: false, error: '지급할 사은품을 골라 주세요.' };
  }
  if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) {
    return { ok: false, error: '시작일이 종료일보다 늦습니다.' };
  }

  try {
    if (id) await updateGoal(id, input);
    else await createGoal(input);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '목표를 저장하지 못했습니다.');
  }
}

export async function deleteGoalAction(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    await deleteGoal(id);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '목표를 지우지 못했습니다.');
  }
}

/* ── 의심 건 검토 ────────────────────────────────────────── */

/**
 * 같은 기기·IP 로 보류된 추천을 인정하거나 거절합니다.
 * ★ 인정하면 그 자리에서 목표 달성 여부를 다시 봅니다.
 *   보류 때문에 못 받은 보상이 있으면 바로 처리됩니다.
 */
export async function judgeLinkAction(
  id: string,
  approve: boolean
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const referrerId = await judgeLink(id, approve);
    if (referrerId) {
      await refreshCounts(referrerId);
      if (approve) await evaluateGoals(referrerId);
    }
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '처리하지 못했습니다.');
  }
}

/* ── 달성·지급 처리 ──────────────────────────────────────── */

/** 보류된 포인트 보상을 관리자가 확인하고 지급합니다. */
export async function payAchievementAction(
  id: string,
  userId: string,
  points: number,
  memo: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (points <= 0) return { ok: false, error: '지급할 포인트가 없습니다.' };

  try {
    // ★ 잔액을 직접 고치지 않습니다. 내역과 잔액을 함께 바꾸는 DB 함수만 씁니다.
    await changePoints(userId, points, 'referral', memo || '친구 초대 목표 달성', id);
    await setAchievementStatus(id, 'paid');
    await notifyReferralReward(memo || '친구 초대 보상', `${points}P 지급`);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '지급하지 못했습니다.');
  }
}

export async function rejectAchievementAction(
  id: string,
  reason: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    await setAchievementStatus(id, 'rejected', reason);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '처리하지 못했습니다.');
  }
}

/* ── 사은품 발송 ─────────────────────────────────────────── */

export async function saveShippingAction(
  id: string,
  input: ShippingInput
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    await updateShipping(id, input);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '받는 분 정보를 저장하지 못했습니다.');
  }
}

export async function shipGiftAction(
  id: string,
  courier: string,
  trackingNo: string,
  giftName: string,
  receiver: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!courier.trim()) return { ok: false, error: '택배사를 골라 주세요.' };
  if (!trackingNo.trim()) return { ok: false, error: '송장번호를 입력해 주세요.' };

  try {
    await markShipped(id, courier, trackingNo);
    await notifyReferralReward(
      `사은품 발송 — ${giftName}`,
      `${receiver} · ${courier} ${trackingNo}`
    );
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '발송 처리를 하지 못했습니다.');
  }
}

/* ── 설정 ────────────────────────────────────────────────── */

export async function saveReferralSettingsAction(
  input: ReferralSettings
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (input.monthlyPointCap < 0) {
    return { ok: false, error: '월 지급 한도는 0 이상이어야 합니다.' };
  }

  try {
    // ★ 정규화해서 저장합니다. 화면에서 넘어온 값을 그대로 믿지 않습니다.
    await writeSetting(REFERRAL_KEY, normalizeReferral(input));
    revalidateTag(SETTINGS_TAG);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '설정을 저장하지 못했습니다.');
  }
}
