import 'server-only';

import {
  autoCancelUnpaidOrders,
  autoCompleteDeliveredOrders,
  type AutoCancelResult,
  type AutoDeliveredResult,
} from '@/lib/orders';
import { getPaymentSettings, getShippingSettings } from '@/lib/settings';
import { notifyAutoCancel, notifyAutoDelivered } from '@/lib/telegram';

/**
 * 입금대기 자동취소 실행기.
 *
 * ★ 두 곳에서 부릅니다.
 *   1) /api/cron/auto-cancel — 10분마다 도는 정기 실행 (Vercel Cron 또는 Supabase pg_cron + pg_net)
 *   2) 관리자 주문 목록·대시보드 — 크론을 아직 걸지 않았어도 관리자가 들어오면 정리됩니다
 *
 * ★ 같은 순간에 두 번 돌아도 안전합니다.
 *   updateOrderStatus 가 상태를 다시 확인하고, 이미 취소된 건은 건너뜁니다.
 *   그래도 불필요한 조회를 줄이려고 최근에 한 번 돌았으면 잠시 쉽니다.
 */

/** 화면 진입으로 부를 때의 최소 간격 (분) */
const IDLE_MINUTES = 5;

let lastRun = 0;

export type SweepResult = AutoCancelResult & { skippedByCooldown: boolean };

const EMPTY: SweepResult = { cancelled: [], skipped: 0, skippedByCooldown: false };

/**
 * @param force true 면 간격을 무시하고 바로 돕니다. (정기 실행에서 씁니다)
 */
export async function runAutoCancel(force = false): Promise<SweepResult> {
  const payment = await getPaymentSettings();
  if (!payment.autoCancelEnabled) return EMPTY;

  if (!force && Date.now() - lastRun < IDLE_MINUTES * 60 * 1000) {
    return { ...EMPTY, skippedByCooldown: true };
  }
  lastRun = Date.now();

  const result = await autoCancelUnpaidOrders(payment.depositHours);

  if (result.cancelled.length > 0 && payment.telegramEnabled) {
    try {
      await notifyAutoCancel(result.cancelled, payment.depositHours);
    } catch (error) {
      // 알림 실패가 취소 자체를 되돌리지는 않습니다. 이미 처리는 끝났습니다.
      console.warn('[auto-cancel] 텔레그램 알림 실패:', error);
    }
  }

  return { ...result, skippedByCooldown: false };
}

/**
 * 관리자 화면에서 부르는 조용한 버전.
 * ★ 화면 렌더링을 막으면 안 되므로 어떤 오류도 밖으로 내보내지 않습니다.
 */
export async function sweepAutoCancelQuietly(): Promise<void> {
  try {
    await runAutoCancel();
  } catch (error) {
    console.warn('[auto-cancel] 정리 실패:', error);
  }
}

/**
 * ============================================================
 * 배송완료 자동 전환 — 같은 크론에 얹습니다
 * ============================================================
 *
 * ★★ 크론을 새로 만들지 않습니다.
 *   이미 하루 한 번 도는 /api/cron/auto-cancel 이 부릅니다.
 *   배송완료 전환은 하루에 한 번이면 충분합니다. 몇 시간 늦게 넘어가도
 *   손해가 없고, 크론을 늘리면 관리할 것만 늘어납니다.
 *
 * ★★ 미입금 자동취소와 완전히 따로 돕니다.
 *   한쪽이 실패해도 다른 쪽은 그대로 돕니다. 설정 스위치도 따로입니다.
 *   (자동취소는 결제 설정, 이쪽은 배송 설정)
 *
 * ★ 관리자 화면에서는 부르지 않습니다.
 *   자동취소는 관리자가 들어올 때도 정리하지만, 이쪽은 그럴 이유가 없습니다.
 *   주문 목록을 열었다는 이유로 포인트가 나가면 언제 나갔는지 알기 어렵습니다.
 *   나가는 시점이 하루 한 번으로 정해져 있는 편이 추적하기 좋습니다.
 */
export type DeliveredSweepResult = AutoDeliveredResult & { enabled: boolean };

export async function runAutoDelivered(): Promise<DeliveredSweepResult> {
  const shipping = await getShippingSettings();

  // 0 이면 꺼진 것입니다. 사람이 직접 배송완료로 바꿉니다.
  if (shipping.autoDeliveredDays <= 0) {
    return { delivered: [], unknownShippedAt: 0, enabled: false };
  }

  const result = await autoCompleteDeliveredOrders(shipping.autoDeliveredDays);

  if (result.delivered.length > 0) {
    try {
      await notifyAutoDelivered(result.delivered, shipping.autoDeliveredDays);
    } catch (error) {
      // 알림 실패가 전환을 되돌리지는 않습니다. 이미 처리는 끝났습니다.
      console.warn('[auto-delivered] 텔레그램 알림 실패:', error);
    }
  }

  if (result.unknownShippedAt > 0) {
    console.warn(
      `[auto-delivered] 배송중이 된 시각을 몰라 건드리지 않은 주문 ${result.unknownShippedAt}건`
    );
  }

  return { ...result, enabled: true };
}
