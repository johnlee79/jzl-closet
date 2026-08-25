'use server';

import { revalidatePath } from 'next/cache';
import { getActiveMember } from '@/lib/auth';
import {
  claimOrder,
  confirmReceipt,
  getOrderOfUser,
  requestCancelByCustomer,
} from '@/lib/orders';
import { canRequestCancel } from '@/lib/order-status';
import { isSocialProvider, updateProfile, withdrawProfile } from '@/lib/profiles';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { isTelegramConfigured, notifyCancelRequest } from '@/lib/telegram';

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

/** 간편가입 회원이 탈퇴할 때 직접 입력해야 하는 문구 */
const WITHDRAW_PHRASE = '탈퇴합니다';

/* ── 회원정보 수정 ────────────────────────────────────────── */

export async function updateProfileAction(patch: {
  name: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  agreeMarketing: boolean;
  birthday: string;
}): Promise<ActionResult> {
  const member = await getActiveMember();
  if (!member) return needLogin();

  /*
   * ★ 화면에서도 막지만 여기서 한 번 더 봅니다.
   *   화면 검사는 안내를 위한 것이고, 실제로 막는 것은 서버입니다.
   *
   * ★★ 연락처는 필수가 아닙니다.
   *   주문·배송에는 필요하지만, 여기서 막으면 주소만 고치려는 회원까지
   *   연락처를 넣어야 저장이 됩니다. 회원정보 화면은 언제든 저장되어야 합니다.
   *   연락처가 없는 회원에게는 헤더 배너가 계속 안내합니다. 그걸로 충분합니다.
   *   (주문서에서는 연락처를 따로 받으므로 배송 사고로 이어지지 않습니다)
   *
   * ★ 다만 값을 넣었다면 형식은 봅니다.
   *   틀린 번호는 없는 번호보다 나쁩니다. 배송 문자가 조용히 실패합니다.
   */
  if (!patch.name.trim()) return { ok: false, error: '이름을 입력해 주세요.' };
  if (patch.phone.trim() && !/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(patch.phone.trim())) {
    return { ok: false, error: '연락처를 010-1234-5678 형식으로 입력해 주세요.' };
  }

  // 생년월일에 미래 날짜가 들어오면 생일 포인트가 영원히 지급되지 않습니다.
  if (patch.birthday && patch.birthday > new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: '생년월일을 다시 확인해 주세요.' };
  }

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

  let cancelled;
  try {
    cancelled = await requestCancelByCustomer(order.id, reason);
  } catch (error) {
    const message = error instanceof Error ? error.message : '요청을 접수하지 못했습니다.';
    return { ok: false, error: message };
  }

  /*
   * ── 텔레그램 — 알림 토글과 무관하게 보냅니다 (2026-08-25) ──
   *
   * ★★ 예전에는 payment.telegramEnabled 가 켜져 있을 때만 보냈습니다.
   *   그 토글은 "새 주문마다 울릴지" 를 정하는 것입니다. 주문 알림은 많으면
   *   성가시니 끌 수 있어야 합니다.
   *
   *   취소 요청은 성격이 다릅니다. 놓치면 손님은 취소된 줄 알고 기다리고,
   *   우리는 모른 채 물건을 보냅니다. 그대로 분쟁이 됩니다.
   *   하루에 몇 건 오지도 않습니다. 끌 이유가 없는 알림입니다.
   *
   * ★ 환경변수가 아예 없으면 조용히 false 가 돌아옵니다. 그때도 알 수 있게
   *   로그를 남깁니다. 조용히 넘어가면 나중에 아무도 못 찾습니다.
   */
  try {
    await notifyCancelRequest(cancelled, reason);
  } catch (error) {
    console.warn('[mypage] 취소 요청 텔레그램 알림 실패:', order.orderNo, error);
  }
  if (!isTelegramConfigured()) {
    console.warn(
      `[mypage] 취소 요청 알림을 보내지 못했습니다 (${order.orderNo}): ` +
        '텔레그램 환경변수가 비어 있습니다. 관리자 주문 목록의 취소요청 탭을 확인하세요.'
    );
  }

  revalidatePath(`/mypage/orders/${order.id}`);
  revalidatePath('/admin/orders');
  return { ok: true, data: undefined };
}

/* ── 수령 확인 ────────────────────────────────────────────── */

/**
 * 손님이 [수령 확인] 을 눌렀습니다.
 *
 * ★★ 이 순간 구매 적립 포인트가 나갑니다.
 *   그래서 본인 주문인지 서버에서 다시 확인합니다.
 *   화면이 보낸 주문 id 를 그대로 믿으면 남의 주문을 배송완료로 만들 수 있습니다.
 *
 * ★ 포인트가 두 번 나가지 않습니다.
 *   지급은 updateOrderStatus 안에서 일어나고, 그쪽이 주문 행의 points_earned 를
 *   먼저 선점한 뒤에 지급합니다. 자동 전환(크론)과 이 버튼이 같은 순간에
 *   겹쳐도 먼저 선점한 쪽만 통과합니다. 구매 적립에 쓰던 방식 그대로입니다.
 *
 * ★ 이미 배송완료면 오류로 만들지 않고 그냥 성공으로 둡니다.
 *   두 번 눌렀거나, 누르는 사이에 크론이 먼저 처리한 경우입니다.
 *   손님 입장에서는 원하던 결과가 이미 이뤄져 있습니다.
 */
export async function confirmReceiptAction(orderId: string): Promise<ActionResult> {
  const member = await getActiveMember();
  if (!member) return needLogin();

  const order = await getOrderOfUser(member.user.id, orderId);
  if (!order) return { ok: false, error: '주문을 찾을 수 없습니다.' };

  try {
    await confirmReceipt(order.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : '처리하지 못했습니다.';
    return { ok: false, error: message };
  }

  revalidatePath('/mypage/orders');
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
  confirmText: string,
  /** 이메일 가입 회원만 씁니다. 간편가입 회원은 비워 둡니다. */
  password = ''
): Promise<ActionResult> {
  const member = await getActiveMember();
  if (!member) return needLogin();

  const social = isSocialProvider(member.profile.provider);

  // ★ 본인 확인
  //   이메일 가입 회원은 비밀번호로, 간편가입 회원은 문구 입력으로 확인합니다.
  //   (간편가입 계정에는 JZL CLOSET 에 비밀번호가 없습니다)
  if (social) {
    if (confirmText.trim() !== WITHDRAW_PHRASE) {
      return { ok: false, error: `확인란에 "${WITHDRAW_PHRASE}" 를 정확히 입력해 주세요.` };
    }
  } else {
    if (!password) return { ok: false, error: '비밀번호를 입력해 주세요.' };

    const auth = createAuthClient();
    if (!auth) return { ok: false, error: '로그인 정보를 확인하지 못했습니다.' };

    const { error } = await auth.auth.signInWithPassword({
      email: member.user.email,
      password,
    });
    if (error) return { ok: false, error: '비밀번호가 맞지 않습니다.' };
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
