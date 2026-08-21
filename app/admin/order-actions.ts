'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { canEditAddress, isOrderStatus } from '@/lib/order-status';
import {
  bulkUpdateStatus,
  cancelOrderItem,
  completeOrderCancel,
  getOrderById,
  getOrdersByNos,
  requestOrderCancel,
  setAdminMemo,
  setAutoCancelExcluded,
  setCashReceiptIssued,
  setTracking,
  updateOrderStatus,
  updateShippingAddress,
  confirmUncertainPayment,
} from '@/lib/orders';
import { getPaymentSettings } from '@/lib/settings';
import { notifyCancelAccepted, notifyStockShortage } from '@/lib/telegram';
import {
  parseTrackingText,
  type TrackingMatchRow,
} from '@/lib/tracking-import';

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

/* ── 송장 일괄등록 ────────────────────────────────────────── */

/**
 * 붙여넣은 글(또는 CSV)을 읽어 주문과 맞춰 봅니다. 저장은 하지 않습니다.
 * 화면에 미리보기 표로 보여 주고, 관리자가 확인한 뒤 등록을 누릅니다.
 */
export async function previewBulkTrackingAction(
  text: string
): Promise<ActionResult<TrackingMatchRow[]>> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!text.trim()) return { ok: false, error: '붙여넣을 내용이 없습니다.' };

  const parsed = parseTrackingText(text);
  if (parsed.length === 0) {
    return { ok: false, error: '읽을 수 있는 줄이 없습니다. 형식을 확인해 주세요.' };
  }
  // 한 번에 너무 많이 넣으면 화면이 버거워집니다.
  if (parsed.length > 500) {
    return { ok: false, error: '한 번에 500건까지만 등록할 수 있습니다. 나눠서 올려 주세요.' };
  }

  const orders = await getOrdersByNos(parsed.map((row) => row.orderNo));

  const rows: TrackingMatchRow[] = parsed.map((row) => {
    const base: TrackingMatchRow = {
      ...row,
      status: 'invalid',
      orderId: '',
      ordererName: '',
      orderStatus: '',
      currentCourier: '',
      currentTrackingNo: '',
      message: row.parseError,
    };

    if (row.parseError) return base;

    const order = orders.get(row.orderNo);
    if (!order) {
      return { ...base, status: 'not_found', message: '이 주문번호를 찾지 못했습니다.' };
    }

    const matched: TrackingMatchRow = {
      ...base,
      orderId: order.id,
      ordererName: order.ordererName,
      orderStatus: order.status,
      currentCourier: order.courier,
      currentTrackingNo: order.trackingNo,
      status: 'ok',
      message: '',
    };

    if (order.trackingNo) {
      return {
        ...matched,
        status: 'already',
        message:
          order.trackingNo === row.trackingNo
            ? '같은 송장이 이미 등록되어 있습니다.'
            : `이미 등록된 송장이 있습니다: ${order.trackingNo}`,
      };
    }

    return matched;
  });

  return { ok: true, data: rows };
}

/**
 * 미리보기에서 확인한 건들을 실제로 저장합니다.
 * ★ 송장을 넣으면 lib/orders.ts 의 setTracking 이 상태를 '배송중' 으로 바꿉니다.
 */
export async function applyBulkTrackingAction(
  rows: { orderId: string; courierCode: string; trackingNo: string }[]
): Promise<ActionResult<{ done: number; failed: number; errors: string[] }>> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (rows.length === 0) return { ok: false, error: '등록할 건이 없습니다.' };

  let done = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.orderId || !row.courierCode || !row.trackingNo) {
      failed += 1;
      continue;
    }
    try {
      await setTracking(row.orderId, row.courierCode, row.trackingNo);
      done += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : '저장 실패';
      // 화면에는 앞의 몇 건만 보여 줍니다.
      if (errors.length < 5) errors.push(`${row.trackingNo}: ${message}`);
      console.warn('[admin/orders] 송장 일괄등록 실패:', row.orderId, error);
    }
  }

  refresh();
  return { ok: true, data: { done, failed, errors } };
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

/**
 * 자동취소 제외 토글.
 *
 * ★ 위탁배송이라 공급처에 이미 발송 요청이 나간 건이 있습니다.
 *   그런 주문이 미입금으로 자동취소되면 물건은 가는데 주문은 사라집니다.
 *   그래서 관리자가 직접 잠가 둘 수 있게 합니다.
 *   (송장번호가 들어간 주문은 이 체크 없이도 자동으로 제외됩니다)
 */
export async function setAutoCancelExcludedAction(
  id: string,
  excluded: boolean
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await setAutoCancelExcluded(id, excluded);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '자동취소 제외 설정을 바꾸지 못했습니다.');
  }
}

/* ── 취소 (4-A) ───────────────────────────────────────────
 *
 * ★★ KSNET 은 가맹점에 취소 API 권한을 주지 않습니다.
 *   여기 버튼을 눌러도 실제 환불은 일어나지 않습니다.
 *   환불은 대행사를 통해 사람이 처리하고 며칠이 걸립니다.
 *   그래서 두 단계로 나눕니다.
 *     [취소 요청 접수] → 상태 '취소요청' · 텔레그램 알림 (아직 환불 전)
 *     [취소 완료]     → 상태 '취소완료' · 재고와 포인트 되돌림 (환불 끝남)
 *   이걸 한 버튼으로 합치면 "취소했는데 돈이 안 들어온다" 는 분쟁이 반드시 납니다.
 * ------------------------------------------------------------------ */

/** 취소 요청 접수 — 아직 환불되지 않았습니다. */
export async function acceptCancelAction(
  id: string,
  memo: string
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const order = await requestOrderCancel(id, memo);
    refresh(id);

    // ★ 알림 실패가 접수를 되돌리면 안 됩니다. 상태는 이미 바뀌었습니다.
    try {
      await notifyCancelAccepted(order, memo);
    } catch (error) {
      console.warn('[admin/orders] 취소 접수 알림 실패:', error);
    }

    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '취소 요청을 접수하지 못했습니다.');
  }
}

/**
 * 취소 완료 — 실제 환불이 끝났을 때만 누르는 버튼입니다.
 * 재고와 사용 포인트가 되돌아갑니다.
 */
export async function completeCancelAction(
  id: string,
  memo: string
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await completeOrderCancel(id, memo);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '취소 완료 처리에 실패했습니다.');
  }
}

/* ── 현금영수증 (4-A) ─────────────────────────────────────
 * ★ PG 가 현금영수증을 지원하지 않아 운영자가 홈택스에서 직접 발급합니다.
 *   이 체크는 "발급했다" 는 기록일 뿐입니다. 실제 발급과는 무관합니다.
 * ------------------------------------------------------------------ */

export async function setCashReceiptIssuedAction(
  id: string,
  issued: boolean
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await setCashReceiptIssued(id, issued);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '현금영수증 발급 표시를 바꾸지 못했습니다.');
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

/* ── 승인확인실패·검토필요 주문의 결론 확정 (4-B) ─────────
 *
 * ★★ 자동으로는 결론을 내지 않는 두 상태입니다.
 *   승인확인실패 — 승인 여부를 우리가 모릅니다
 *   검토필요     — 승인은 났는데 금액·주문번호가 우리 기록과 다릅니다
 *   운영자가 KSNET 거래내역(ksta.ksnet.co.kr)에서 확인한 뒤 눌러 확정합니다.
 *
 * ★ 이 액션은 우리 기록만 바꿉니다. 실제 승인·취소는 일어나지 않습니다.
 *   KSNET 은 가맹점에 취소 권한을 주지 않습니다.
 * ------------------------------------------------------------------ */

/** 화면에 그대로 보여 줄 재고 부족 내역 */
export type ShortageLine = {
  productName: string;
  optionKey: string;
  wanted: number;
  available: number;
};

export async function confirmPaymentAction(
  id: string,
  decision: 'paid' | 'failed'
): Promise<ActionResult<{ shortages: ShortageLine[] }>> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const { order, shortages } = await confirmUncertainPayment(id, decision);
    refresh(id);

    /*
     * ★★ 재고가 모자라도 막지 않습니다.
     *   운영자는 이미 KSNET 에서 승인을 확인하고 누른 것이라 주문을 되돌릴 수 없습니다.
     *   대신 반드시 알립니다 — 화면에도, 텔레그램에도.
     *   모르고 지나가면 보낼 물건이 없는 주문을 준비 중으로 넘기게 됩니다.
     */
    if (shortages.length > 0) {
      const payment = await getPaymentSettings();
      if (payment.telegramEnabled) {
        try {
          await notifyStockShortage(order, shortages);
        } catch (error) {
          console.warn('[admin/orders] 재고 부족 알림 실패:', error);
        }
      }
    }

    return {
      ok: true,
      data: {
        shortages: shortages.map((x) => ({
          productName: x.productName ?? x.productSlug ?? '(상품 이름 없음)',
          optionKey: x.optionKey,
          wanted: x.wanted,
          available: x.available,
        })),
      },
    };
  } catch (error) {
    return fail(error, '결제 상태를 확정하지 못했습니다.');
  }
}
