import 'server-only';

import {
  applyKsnetApproval,
  claimSweepNotice,
  failPendingCardOrder,
  findStalePendingCardOrders,
  findTodayPendingCardOrders,
  isAutoCancelExempt,
  markPaymentUnconfirmed,
  releaseOrderStock,
} from '@/lib/orders';
import { findPaymentKey, writePaymentLog } from '@/lib/payment-logs';
import { approveKsnetPayment } from '@/lib/payments/ksnet/approve';
import { getPaymentSettings } from '@/lib/settings';
import {
  notifyCardSweepDigest,
  notifyPaymentPaid,
  notifyPaymentUnconfirmed,
} from '@/lib/telegram';
import type { Order } from '@/lib/types';

/**
 * ============================================================
 * 결제대기로 남은 카드 주문 정리 (4-B)
 * ============================================================
 *
 * ★★ 이 파일이 무엇을 막는가
 *   주문을 저장하는 순간 재고를 깎습니다. 카드 결제창을 열었다가 그냥 닫으면
 *   그 재고가 영원히 묶입니다. 잘 팔리는 상품일수록 결제창만 열어 보는 손님이
 *   많아 계속 갉아먹힙니다.
 *
 * ★★ 그러나 "오래됐으니 지운다" 는 절대 안 됩니다.
 *   승인은 났는데 우리가 결과를 못 받은 주문이 섞여 있을 수 있습니다.
 *   그 주문을 결제실패로 바꾸면 돈은 빠져나갔는데 주문은 사라집니다.
 *
 * ★★ 대상은 반드시 payment_method 로 고릅니다. 상태로 고르면 안 됩니다.
 *   pending_payment 는 무통장 입금대기와 카드 결제대기가 함께 씁니다.
 *   상태만 보면 입금을 기다리는 무통장 주문을 40분 만에 정리해 버립니다.
 *
 * ★★ 판정
 *
 *   결제 Key 있음 ─ KSNET 재조회 ┬ 승인 O · 금액·주문번호 일치 → 결제완료 · 재고 유지 · 알림
 *                                ├ 승인 O · 금액/주문번호 불일치 → 검토필요 · 재고 유지 · 알림
 *                                ├ 승인 X (승인 없음 확인)       → 결제실패 · 재고 되돌림 · 알림 없음
 *                                └ 조회 실패 (1회 재시도 후)     → 승인확인실패 · 재고 유지 · 알림 1회
 *   결제 Key 없음 ─────────────────────────────────────────────→ 승인확인실패 · 재고 되돌림 · 일일 요약
 *
 * ★ 결제 Key 가 없는 건을 결제실패로 적지 않는 이유
 *   "확인했고 결제 안 됨" 과 "모름" 은 다릅니다. 조회할 열쇠 자체가 없으니
 *   우리는 모르는 것입니다. KSNET 쪽에 승인이 살아 있을 가능성을 배제할 수 없습니다.
 *   재고만 돌려놓고 주문은 남겨 사람이 확인할 수 있게 둡니다.
 */

/** 화면 진입으로 부를 때의 최소 간격 (분) */
const IDLE_MINUTES = 5;

let lastRun = 0;

export type CardSweepResult = {
  /** 살펴본 주문 수 */
  checked: number;
  /** 승인이 확인되어 결제완료로 되살린 주문 */
  recovered: Order[];
  /** 승인 없음이 확인되어 결제실패로 바꾼 주문 (재고 되돌림) */
  failed: Order[];
  /** 금액·주문번호가 어긋나 검토필요로 둔 주문 (재고 유지) */
  review: Order[];
  /** 조회를 못 해 승인확인실패로 둔 주문 (재고 유지) */
  unconfirmed: Order[];
  /** 결제 Key 가 없어 승인확인실패로 두고 재고만 되돌린 주문 */
  noKey: Order[];
  /** 자동취소 제외·송장 있음 등으로 건너뛴 수 */
  skipped: number;
  skippedByCooldown: boolean;
};

function emptyResult(): CardSweepResult {
  return {
    checked: 0,
    recovered: [],
    failed: [],
    review: [],
    unconfirmed: [],
    noKey: [],
    skipped: 0,
    skippedByCooldown: false,
  };
}

/* ------------------------------------------------------------------
 * 10분마다 도는 정리
 * ------------------------------------------------------------------ */

/**
 * @param force true 면 간격을 무시하고 바로 돕니다. (정기 실행에서 씁니다)
 */
export async function runCardSweep(force = false): Promise<CardSweepResult> {
  const payment = await getPaymentSettings();

  /*
   * ★ 자동취소 스위치를 그대로 씁니다.
   *   "자동으로 주문을 정리하지 마세요" 라고 꺼 두었는데 카드만 정리하면
   *   운영자의 뜻과 어긋납니다.
   */
  if (!payment.autoCancelEnabled) return emptyResult();

  if (!force && Date.now() - lastRun < IDLE_MINUTES * 60 * 1000) {
    return { ...emptyResult(), skippedByCooldown: true };
  }
  lastRun = Date.now();

  const stale = await findStalePendingCardOrders(payment.cardPendingMinutes);
  const result = emptyResult();
  result.checked = stale.length;

  for (const order of stale) {
    // eslint-disable-next-line no-await-in-loop
    await runOne(order, result, payment.telegramEnabled);
  }

  return result;
}

/* ------------------------------------------------------------------
 * 자정 전 마감 점검 (23:50 KST)
 * ------------------------------------------------------------------ */

export type CardDailyResult = CardSweepResult & {
  /** 자정을 넘겨 조회가 불가능해진 주문 */
  expired: Order[];
};

/**
 * ★★ 왜 자정 전에 한 번 더 도는가
 *   4-A 에서 확인한 대로 승인 재조회는 **당일에 한해** 가능합니다.
 *   23시 50분에 들어온 주문은 40분 뒤면 다음 날이라 영영 확인할 수 없게 됩니다.
 *   그래서 하루가 끝나기 전에 그날 주문을 한 번 훑습니다.
 *
 * ★ 40분이 안 지났어도 조회합니다. 조회는 조회일 뿐 상태를 바꾸지 않습니다.
 *   판정이 확실한 건만 처리하고, 아직 결제 중일 수 있는 건은 건드리지 않습니다.
 *
 * ★ 어제 이전에 들어온 결제대기 카드 주문은 이미 조회할 수 없습니다.
 *   승인확인실패로 보내고 일일 요약에 담습니다.
 */
export async function runCardDailyCheck(): Promise<CardDailyResult> {
  const payment = await getPaymentSettings();
  const base = emptyResult();
  const result: CardDailyResult = { ...base, expired: [] };

  if (!payment.autoCancelEnabled) return result;

  const { today, older } = await findTodayPendingCardOrders();
  result.checked = today.length + older.length;

  /* ── 오늘 들어온 건 — 아직 조회할 수 있습니다 ── */
  for (const order of today) {
    // eslint-disable-next-line no-await-in-loop
    await runOne(order, result, payment.telegramEnabled, { onlyCertain: true });
  }

  /* ── 어제 이전 건 — 이미 조회할 수 없습니다 ── */
  for (const order of older) {
    if (isAutoCancelExempt(order)) {
      result.skipped += 1;
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const { moved } = await markPaymentUnconfirmed(
        order.orderNo,
        '[자동정리] 자정이 지나 KSNET 승인 재조회를 할 수 없습니다. 거래내역과 직접 대조해 주세요.'
      );
      if (moved) result.expired.push(order);
    } catch (error) {
      console.warn('[card-sweep] 조회 불가 처리 실패:', order.orderNo, error);
      result.skipped += 1;
    }
  }

  /* ── 일일 요약 한 번 ── */
  const digest = [...result.noKey, ...result.expired];
  if (payment.telegramEnabled && digest.length > 0) {
    await safely(() => notifyCardSweepDigest(result.noKey, result.expired));
  }

  return result;
}

/* ------------------------------------------------------------------
 * 주문 하나 처리 — 두 cron 이 같은 규칙을 씁니다
 * ------------------------------------------------------------------ */

async function runOne(
  order: Order,
  result: CardSweepResult,
  telegramEnabled: boolean,
  options: { onlyCertain?: boolean } = {}
): Promise<void> {
  /*
   * ★ 관리자가 잠가 둔 주문이나 송장이 나간 주문은 건드리지 않습니다.
   *   무통장입금 자동취소와 같은 기준입니다.
   */
  if (isAutoCancelExempt(order)) {
    result.skipped += 1;
    return;
  }

  try {
    await handleOne(order, result, telegramEnabled, options);
  } catch (error) {
    /*
     * ★ 한 건이 실패해도 나머지는 계속 처리합니다.
     *   실패한 건은 건드리지 않은 채로 남습니다. 그게 안전한 쪽입니다.
     */
    console.warn('[card-sweep] 처리 실패:', order.orderNo, error);
    result.skipped += 1;
  }
}

async function handleOne(
  order: Order,
  result: CardSweepResult,
  telegramEnabled: boolean,
  options: { onlyCertain?: boolean }
): Promise<void> {
  const createdAt = order.createdAt ? new Date(order.createdAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((Date.now() - createdAt) / 60_000));

  /* ── ① 결제 Key 찾기 ────────────────────────────────── */
  /*
   * ★ 주문 행에 적힌 값을 먼저 봅니다. (4-B 부터 결제창 복귀 시점에 저장합니다)
   * ★ 그 칸이 생기기 전의 주문은 payment_logs 의 원문에서 꺼내 봅니다.
   */
  const key = order.pgCommConId || (await findPaymentKey(order.orderNo));

  if (!key) {
    /*
     * 결제창이 우리 서버로 한 번도 돌아오지 않았습니다. 조회할 열쇠가 없습니다.
     *
     * ★ 자정 점검에서는 건드리지 않습니다.
     *   아직 결제창에서 카드 정보를 넣고 있는 중일 수 있습니다.
     *   시간이 지난 뒤 10분 정리가 처리합니다.
     */
    if (options.onlyCertain) return;

    /*
     * ★ 승인 흔적(거래번호·승인번호)이 남아 있다면 승인이 났던 것입니다.
     *   그런 주문은 재고도 건드리지 않고 사람에게 넘깁니다.
     */
    if (order.pgTid || order.pgAuthNo) {
      await handOff(
        order,
        result,
        telegramEnabled,
        `결제 Key 는 없는데 승인 흔적(거래번호 ${order.pgTid || '없음'} · 승인번호 ${order.pgAuthNo || '없음'})이 남아 있습니다.`
      );
      return;
    }

    /*
     * ★★ 결제실패가 아니라 승인확인실패입니다.
     *   "확인했고 결제 안 됨" 이 아니라 "모름" 이기 때문입니다.
     *   재고만 돌려놓고 주문은 남겨 사람이 확인할 수 있게 둡니다.
     * ★ 알림은 건별로 보내지 않습니다. 가장 흔한 경우라 매번 울리면
     *   정작 중요한 알림을 놓칩니다. 하루 한 번 요약에만 담습니다.
     */
    const memo = `${minutes}분 동안 결제 신호가 없었습니다. 결제 Key 가 없어 승인 여부를 확인할 수 없습니다. 재고만 되돌렸습니다.`;
    const { moved } = await markPaymentUnconfirmed(order.orderNo, `[자동정리] ${memo}`);
    if (moved) {
      await releaseOrderStock(order, '결제 신호 없음 — 자동정리');
      result.noKey.push(order);
    }
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

  /* ── ③ 조회 자체가 실패 ─────────────────────────────── */
  if (!approve.ok) {
    // 자정 점검에서는 판정이 안 서는 건을 건드리지 않습니다.
    if (options.onlyCertain) return;
    await handOff(
      order,
      result,
      telegramEnabled,
      `승인 재조회에 실패했습니다(${attempts}회 시도): ${approve.error ?? '알 수 없는 이유'}`
    );
    return;
  }

  /* ── ④ 승인이 났습니다 ──────────────────────────────── */
  if (approve.authyn === 'O') {
    /*
     * ★ 금액·주문번호 대조는 applyKsnetApproval 이 합니다.
     *   어긋나면 자동으로 완료 처리하지 않고 검토필요로 둡니다.
     *   4-A 에서 가장 위험하다고 정한 경우입니다.
     */
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
      /*
       * ★★ 이 알림이 이 작업에서 가장 중요합니다.
       *   우리가 놓치고 있던 결제입니다. 반드시 알립니다.
       *   (한 번만 — 이미 결제완료가 되어 다음 정리에 다시 잡히지 않습니다)
       */
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

    if (applied.outcome === 'review') {
      result.review.push(order);
      if (telegramEnabled && (await claimSweepNotice(order.id))) {
        await safely(() =>
          notifyPaymentUnconfirmed(order, order.orderNo, `[자동정리] ${applied.reason}`)
        );
      }
    }
    // 'already' 는 그 사이 다른 요청이 먼저 처리한 것입니다. 아무것도 하지 않습니다.
    return;
  }

  /* ── ⑤ 카드사가 승인하지 않았습니다 — 확인된 실패입니다 ─ */
  const memo = `${minutes}분 경과 · KSNET 조회 결과 미승인 (${approve.authno || approve.resultCode || '코드없음'}) ${approve.message}`.trim();
  const changed = await failPendingCardOrder(order, memo);
  if (changed) result.failed.push(order);
}

/**
 * 판단을 사람에게 넘깁니다.
 *
 * ★ 승인확인실패로 바꾸고 재고는 건드리지 않습니다.
 *   돈이 빠져나갔을 수 있는 주문이라, 재고를 돌려놓았다가 그 물건이 팔리면
 *   승인이 확인됐을 때 보낼 물건이 없습니다.
 *
 * ★★ 상태를 반드시 바꿉니다.
 *   결제대기로 두면 다음 정리가 같은 주문을 또 집어 10분마다 같은 알림이 갑니다.
 * ★ 알림은 주문당 한 번입니다. (orders.sweep_notified_at 으로 잠급니다)
 */
async function handOff(
  order: Order,
  result: CardSweepResult,
  telegramEnabled: boolean,
  reason: string
): Promise<void> {
  const { moved } = await markPaymentUnconfirmed(order.orderNo, `[자동정리] ${reason}`);
  if (moved) result.unconfirmed.push(order);

  if (telegramEnabled && (await claimSweepNotice(order.id))) {
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
