import 'server-only';

import { autoCancelUnpaidOrders, type AutoCancelResult } from '@/lib/orders';
import { getPaymentSettings } from '@/lib/settings';
import { notifyAutoCancel } from '@/lib/telegram';

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
