'use server';

import { revalidatePath } from 'next/cache';
import { getActiveMember } from '@/lib/auth';
import { claimOrder, getOrderOfUser, requestCancel } from '@/lib/orders';
import { canRequestCancel } from '@/lib/order-status';
import { updateProfile, withdrawProfile } from '@/lib/profiles';
import { getPaymentSettings } from '@/lib/settings';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { notifyCancelRequest } from '@/lib/telegram';

/**
 * 마이페이지 서버 액션.
 * ★ 어떤 액션도 클라이언트가 보낸 회원 id 를 믿지 않습니다.
 *   항상 세션에서 지금 로그인한 사람을 직접 확인합니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function needLogin(): { ok: false; error: string } {
  return { ok: false, error: '로그인이 필요합니다. 다시 로그인해 주세요.' };
}

/* ── 회원정보 수정 ────────────────────────────────────────── */

export async function updateProfileAction(patch: {
  name: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  agreeMarketing: boolean;
}): Promise<ActionResult> {
  const member = await getActiveMember();
  if (!member) return needLogin();

  if (!patch.name.trim()) return { ok: false, error: '이름을 입력해 주세요.' };

  try {
    await updateProfile(member.user.id, patch);
    revalidatePath('/', 'layout');
    revalidatePath('/mypage/profile');
    return { ok: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : '저장하지 못했습니다.';
    return { ok: false, error: message };
  }
}

/* ── 비회원 주문 불러오기 ─────────────────────────────────── */

export async function claimOrderAction(
  orderNo: string,
  phone: string
): Promise<ActionResult<{ orderId: string }>> {
  const member = await getActiveMember();
  if (!member) return needLogin();

  if (!orderNo.trim() || !phone.trim()) {
    return { ok: false, error: '주문번호와 연락처를 모두 입력해 주세요.' };
  }

  const result = await claimOrder(member.user.id, orderNo, phone);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/mypage');
  revalidatePath('/mypage/orders');
  return { ok: true, data: { orderId: result.order.id } };
}

/* ── 주문 취소 요청 ───────────────────────────────────────── */

export async function memberCancelRequestAction(
  orderId: string,
  reason: string
): Promise<ActionResult> {
  const member = await getActiveMember();
  if (!member) return needLogin();

  // ★ 본인 주문인지 서버에서 다시 확인합니다.
  const order = await getOrderOfUser(member.user.id, orderId);
  if (!order) return { ok: false, error: '주문을 찾을 수 없습니다.' };

  if (!canRequestCancel(order.status)) {
    return {
      ok: false,
      error: '이미 상품 준비가 시작되어 여기서는 취소할 수 없습니다. 고객센터로 문의해 주세요.',
    };
  }

  try {
    await requestCancel(order.id, reason);
  } catch (error) {
    const message = error instanceof Error ? error.message : '요청을 접수하지 못했습니다.';
    return { ok: false, error: message };
  }

  const payment = await getPaymentSettings();
  if (payment.telegramEnabled) {
    try {
      await notifyCancelRequest(order, reason);
    } catch (error) {
      console.warn('[mypage] 취소 요청 알림 실패:', error);
    }
  }

  revalidatePath(`/mypage/orders/${order.id}`);
  revalidatePath('/admin/orders');
  return { ok: true, data: undefined };
}

/* ── 회원 탈퇴 ────────────────────────────────────────────── */

/**
 * ★ 주문 내역은 지우지 않습니다.
 *   전자상거래법상 거래기록은 5년 보관 의무가 있습니다.
 *   프로필의 개인정보만 마스킹하고 status 를 withdrawn 으로 바꿉니다.
 */
export async function withdrawAction(
  reason: string,
  confirmText: string
): Promise<ActionResult> {
  const member = await getActiveMember();
  if (!member) return needLogin();

  // 실수로 누르는 것을 막기 위해 한 번 더 확인합니다.
  if (confirmText.trim() !== '탈퇴') {
    return { ok: false, error: '확인란에 "탈퇴" 를 정확히 입력해 주세요.' };
  }

  try {
    await withdrawProfile(member.user.id, reason);
  } catch (error) {
    const message = error instanceof Error ? error.message : '탈퇴 처리에 실패했습니다.';
    return { ok: false, error: message };
  }

  // 바로 로그아웃시킵니다.
  const supabase = createAuthClient();
  if (supabase) await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}
