'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { canEditAddress, isOrderStatus } from '@/lib/order-status';
import {
  bulkUpdateStatus,
  cancelOrderItem,
  getOrderById,
  setAdminMemo,
  setTracking,
  updateOrderStatus,
  updateShippingAddress,
} from '@/lib/orders';

/**
 * 관리자 주문 처리 서버 액션.
 * 미들웨어가 /admin/* 를 막고 있지만 서버 액션은 직접 호출될 수 있어
 * 여기서 한 번 더 확인합니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function assertAdmin(): Promise<boolean> {
  return verifySessionToken(cookies().get(ADMIN_COOKIE)?.value);
}

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin/orders]', message);
  return { ok: false, error: message };
}

/** 주문이 바뀌면 목록·상세·대시보드를 다시 굽습니다. */
function refresh(id?: string): void {
  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  if (id) revalidatePath(`/admin/orders/${id}`);
}

/* ── 상태 변경 ────────────────────────────────────────────── */

export async function updateStatusAction(
  id: string,
  status: string,
  memo = ''
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!isOrderStatus(status)) return { ok: false, error: '알 수 없는 상태입니다.' };

  try {
    await updateOrderStatus(id, status, memo);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '상태를 바꾸지 못했습니다.');
  }
}

/** 목록에서 체크한 주문들의 상태를 한 번에 바꿉니다. */
export async function bulkStatusAction(
  ids: string[],
  status: string,
  memo = ''
): Promise<ActionResult<{ done: number; failed: number }>> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!isOrderStatus(status)) return { ok: false, error: '알 수 없는 상태입니다.' };
  if (ids.length === 0) return { ok: false, error: '선택한 주문이 없습니다.' };

  try {
    const result = await bulkUpdateStatus(ids, status, memo);
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return fail(error, '일괄 변경에 실패했습니다.');
  }
}

/* ── 송장 ─────────────────────────────────────────────────── */

export async function setTrackingAction(
  id: string,
  courier: string,
  trackingNo: string
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (trackingNo.trim() && !courier) {
    return { ok: false, error: '택배사를 선택해 주세요.' };
  }

  try {
    // ★ 송장을 넣으면 상태가 자동으로 '배송중'으로 바뀝니다. (lib/orders.ts)
    await setTracking(id, courier, trackingNo);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '송장을 저장하지 못했습니다.');
  }
}

/* ── 배송지 · 메모 ────────────────────────────────────────── */

export async function updateAddressAction(
  id: string,
  patch: {
    receiverName: string;
    receiverPhone: string;
    postcode: string;
    address1: string;
    address2: string;
    deliveryMemo: string;
  }
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (!patch.receiverName.trim() || !patch.receiverPhone.trim() || !patch.address1.trim()) {
    return { ok: false, error: '받는 분·연락처·주소는 비울 수 없습니다.' };
  }

  try {
    const order = await getOrderById(id);
    if (!order) return { ok: false, error: '주문을 찾을 수 없습니다.' };
    // ★ 출고 후에는 배송지를 고칠 수 없습니다.
    if (!canEditAddress(order.status)) {
      return { ok: false, error: '이미 출고된 주문의 배송지는 수정할 수 없습니다.' };
    }

    await updateShippingAddress(id, patch);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '배송지를 수정하지 못했습니다.');
  }
}

export async function setMemoAction(id: string, memo: string): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await setAdminMemo(id, memo);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '메모를 저장하지 못했습니다.');
  }
}

/* ── 부분 취소 ────────────────────────────────────────────── */

/**
 * 상품 하나를 취소 처리합니다.
 * 총액을 다시 계산하고 재고를 되돌립니다. 실제 환불은 사람이 직접 합니다.
 */
export async function cancelItemAction(
  orderId: string,
  itemId: string
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await cancelOrderItem(orderId, itemId);
    refresh(orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '부분 취소에 실패했습니다.');
  }
}
