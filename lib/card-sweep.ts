import 'server-only';

import {
  failPendingCardOrder,
  findStalePendingCardOrders,
  isAutoCancelExempt,
  applyKsnetApproval,
  markPaymentUnconfirmed,
} from '@/lib/orders';
import { findPaymentKey, writePaymentLog } from '@/lib/payment-logs';
import { approveKsnetPayment } from '@/lib/payments/ksnet/approve';
import { getPaymentSettings } from '@/lib/settings';
import { notifyPaymentPaid, notifyPaymentUnconfirmed } from '@/lib/telegram';
import type { Order } from '@/lib/types';

/**
 * ============================================================
 * 결제대기로 남은 카드 주문 정리 (4-B)
 * ============================================================
 *
 * ★★ 이 파일이 무엇을 막는가
 *   주문을 저장하는 순간 재고를 깎습니다. 카드 결제창을 열었다가 그냥 닫으면
 *   그 재고가 영원히 묶입니다. 자동취소는 무통장입금만 처리하고,
 *   결제실패 상태로 바꾸는 코드는 어디에도 없었습니다.
 *   잘 팔리는 상품일수록 결제창만 열어 보는 손님이 많아 계속 갉아먹힙니다.
 *
 * ★★ 그러나 "오래됐으니 지운다" 는 절대 안 됩니다.
 *   승인은 났는데 우리가 결과를 못 받은 주문이 섞여 있을 수 있습니다.
 *   (손님이 카드 인증을 마친 직후 브라우저를 꺼 버린 경우)
 *   그 주문을 결제실패로 바꾸면 돈은 빠져나갔는데 주문은 사라집니다.
 *   가장 풀기 어려운 분쟁이 됩니다.
 *
 *   그래서 반드시 KSNET 에 먼저 물어봅니다.
 *
 *     ┌ 결제 Key 가 있다 ─ KSNET 조회 ─┬ 승인 O  → 결제완료 · 재고 유지 · 알림
 *     │                                ├ 승인 X  → 결제실패 · 재고 되돌림
 *     │                                └ 조회 실패 → 그대로 두고 알림 (사람 확인)
 *     └ 결제 Key 가 없다 ───────────────→ 결제실패 · 재고 되돌림
 *
 * ★ 마지막 줄이 유일하게 추측이 들어가는 자리입니다.
 *   결제 Key 가 없다는 것은 결제창이 우리 서버로 한 번도 돌아오지 않았다는 뜻입니다.
 *   승인이 났다면 결제창이 돌아왔어야 하므로, 결제가 시작되지 않았거나
 *   카드 정보를 넣기 전에 닫은 것으로 봅니다.
 *   그래도 주문을 지우지는 않습니다. 결제실패로 남겨 관리자가 볼 수 있게 합니다.
 */

/** 화면 진입으로 부를 때의 최소 간격 (분) — 자동취소와 같은 방식 */
const IDLE_MINUTES = 5;

let lastRun = 0;

export type CardSweepResult = {
  /** 살펴본 주문 수 */
  checked: number;
  /** 승인이 확인되어 결제완료로 바꾼 주문 */
  recovered: Order[];
  /** 미승인으로 확인되어 결제실패로 바꾼 주문 */
  failed: Order[];
  /** 조회에 실패해 그대로 둔 주문 — 사람이 확인해야 합니다 */
  needsReview: Order[];
  /** 자동취소 제외·송장 있음 등으로 건너뛴 수 */
  skipped: number;
  skippedByCooldown: boolean;
};

const EMPTY: CardSweepResult = {
  checked: 0,
  recovered: [],
  failed: [],
  needsReview: [],
  skipped: 0,
  skippedByCooldown: false,
};

/**
 * @param force true 면 간격을 무시하고 바로 돕니다. (정기 실행에서 씁니다)
 */
export async function runCardSweep(force = false): Promise<CardSweepResult> {
  const payment = await getPaymentSettings();

  /*
   * ★ 자동취소 스위치를 그대로 씁니다.
   *   "자동으로 주문을 정리하지 마세요" 라고 꺼 두었는데 카드만 정리하면
   *   운영자의 뜻과 어긋납니다. 스위치는 하나로 둡니다.
   */
  if (!payment.autoCancelEnabled) return EMPTY;

  if (!force && Date.now() - lastRun < IDLE_MINUTES * 60 * 1000) {
    return { ...EMPTY, skippedByCooldown: true };
  }
  lastRun = Date.now();

  const stale = await findStalePendingCardOrders(payment.cardPendingMinutes);
  if (stale.length === 0) return { ...EMPTY, checked: 0 };

  const result: CardSweepResult = {
    checked: stale.length,
    recovered: [],
    failed: [],
    needsReview: [],
    skipped: 0,
    skippedByCooldown: false,
  };

  for (const order of stale) {
    /*
     * ★ 관리자가 잠가 둔 주문이나 송장이 나간 주문은 건드리지 않습니다.
     *   무통장입금 자동취소와 같은 기준입니다.
     */
    if (isAutoCancelExempt(order)) {
      result.skipped += 1;
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await handleOne(order, result, payment.telegramEnabled);
    } catch (error) {
      /*
       * ★ 한 건이 실패해도 나머지는 계속 처리합니다.
       *   다만 실패한 건은 건드리지 않은 채로 남습니다. 그게 안전한 쪽입니다.
       */
      console.warn('[card-sweep] 처리 실패:', order.orderNo, error);
      result.skipped += 1;
    }
  }

  return result;
}

/** 주문 하나를 판단해 처리합니다. */
async function handleOne(
  order: Order,
  result: CardSweepResult,
  telegramEnabled: boolean
): Promise<void> {
  // createdAt 이 비어 있는 주문은 없지만, 없으면 0분으로 둡니다. (문구에만 쓰입니다)
  const createdAt = order.createdAt ? new Date(order.createdAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((Date.now() - createdAt) / 60_000));

  /* ── ① 결제 Key 찾기 ────────────────────────────────── */
  const key = await findPaymentKey(order.orderNo);

  if (!key) {
    /*
     * 결제창이 우리 서버로 한 번도 돌아오지 않았습니다.
     *
     * ★ 그래도 마지막으로 한 번 더 봅니다.
     *   승인 흔적(거래번호·승인번호)이 주문에 남아 있다면 승인이 났던 것입니다.
     *   그런 주문을 결제실패로 바꾸면 안 됩니다. 사람에게 넘깁니다.
     */
    if (order.pgTid || order.pgAuthNo) {
      await handOff(
        order,
        result,
        telegramEnabled,
        `결제 Key 는 못 찾았는데 승인 흔적(거래번호 ${order.pgTid || '없음'} · 승인번호 ${order.pgAuthNo || '없음'})이 남아 있습니다.`
      );
      return;
    }

    const memo = `${minutes}분 동안 결제 신호가 없어 정리했습니다. (결제창이 우리 서버로 돌아온 기록 없음)`;
    const changed = await failPendingCardOrder(order, memo);
    if (changed) result.failed.push(order);
    await writePaymentLog({
      kind: 'error',
      orderId: order.id,
      orderNo: order.orderNo,
      note: `[자동정리] ${memo}`,
    });
    return;
  }

  /* ── ② KSNET 에 승인 여부를 묻습니다 ─────────────────── */
  const { result: approve, attempts } = await approveKsnetPayment(key, order.totalAmount);

  await writePaymentLog({
    kind: attempts > 1 ? 'approve_retry' : 'approve',
    orderId: order.id,
    orderNo: order.orderNo,
    authyn: approve.authyn || null,
    amount: approve.amount,
    trno: approve.trno || null,
    raw: approve.raw,
    parsed: approve.fields,
    note: `[자동정리] ${minutes}분 경과 · 승인 재조회 (${attempts}회)`,
  });

  /* ── ③ 조회 자체가 실패 — 절대 건드리지 않습니다 ────── */
  if (!approve.ok) {
    await handOff(
      order,
      result,
      telegramEnabled,
      `승인 재조회에 실패했습니다: ${approve.error ?? '알 수 없는 이유'}`
    );
    return;
  }

  /* ── ④ 승인이 났습니다 — 우리가 모르고 있던 결제입니다 ─ */
  if (approve.authyn === 'O') {
    const applied = await applyKsnetApproval(order.orderNo, {
      authyn: approve.authyn,
      trno: approve.trno,
      authno: approve.authno,
      amount: approve.amount,
      ordno: approve.ordno,
      tradeAt: approve.tradeAt,
      issuerCode: approve.issuerCode,
      acquirerCode: approve.acquirerCode,
      installment: approve.installment,
      resultCode: approve.resultCode,
      message: approve.message,
    });

    if (applied.outcome === 'paid' && applied.order) {
      result.recovered.push(applied.order);
      if (telegramEnabled) {
        await safely(() =>
          notifyPaymentPaid(applied.order as Order, {
            trno: approve.trno,
            authno: approve.authno,
          })
        );
      }
      return;
    }

    /*
     * ★ 금액·주문번호가 어긋났거나(review) 이미 처리됐다면(already)
     *   applyKsnetApproval 이 알아서 안전하게 처리했습니다.
     *   여기서 또 손대지 않습니다. review 는 사람이 봐야 하므로 알립니다.
     */
    if (applied.outcome === 'review') {
      result.needsReview.push(order);
      if (telegramEnabled) {
        await safely(() =>
          notifyPaymentUnconfirmed(order, order.orderNo, `[자동정리] ${applied.reason}`)
        );
      }
    }
    return;
  }

  /* ── ⑤ 카드사가 승인하지 않았습니다 — 정리합니다 ────── */
  const memo = `${minutes}분 경과 · KSNET 조회 결과 미승인 (${approve.authno || approve.resultCode || '코드없음'}) ${approve.message}`.trim();
  const changed = await failPendingCardOrder(order, memo);
  if (changed) result.failed.push(order);
}

/**
 * 판단을 사람에게 넘깁니다.
 *
 * ★ 주문 상태를 '승인확인실패' 로 바꿉니다. 재고는 건드리지 않습니다.
 *   돈이 빠져나갔을 수 있는 주문이라, 재고를 돌려놓았다가 그 물건이 팔리면
 *   승인이 확인됐을 때 보낼 물건이 없습니다.
 * ★ 텔레그램으로 알립니다. 이 알림이 이 작업에서 가장 중요합니다.
 */
async function handOff(
  order: Order,
  result: CardSweepResult,
  telegramEnabled: boolean,
  reason: string
): Promise<void> {
  await markPaymentUnconfirmed(order.orderNo, `[자동정리] ${reason}`);
  result.needsReview.push(order);

  if (telegramEnabled) {
    await safely(() => notifyPaymentUnconfirmed(order, order.orderNo, reason));
  }
}

/** 알림 실패가 정리 자체를 되돌리지는 않습니다. 이미 처리는 끝났습니다. */
async function safely(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.warn('[card-sweep] 알림 실패:', error);
  }
}

/**
 * 관리자 화면에서 부르는 조용한 버전.
 * ★ 화면 렌더링을 막으면 안 되므로 어떤 오류도 밖으로 내보내지 않습니다.
 */
export async function sweepCardOrdersQuietly(): Promise<void> {
  try {
    await runCardSweep();
  } catch (error) {
    console.warn('[card-sweep] 정리 실패:', error);
  }
}
