import 'server-only';

import { inquiryCategoryLabel } from '@/lib/inquiry-status';
import { formatPrice } from '@/lib/product-utils';
import { SITE_URL } from '@/lib/store';
import type { Inquiry } from '@/lib/inquiries';
import type { Order } from '@/lib/types';

/**
 * 텔레그램 알림. 서버 전용.
 *
 * ★ 세 가지 원칙
 *   1) 환경변수(TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)가 비어 있으면
 *      아무 일도 하지 않고 조용히 넘어갑니다. 오류를 내지 않습니다.
 *   2) 알림 전송 실패가 주문 저장을 막으면 안 됩니다.
 *      호출부에서 await 하더라도 이 함수는 절대 throw 하지 않습니다.
 *   3) 관리자 설정에서 알림을 껐으면 보내지 않습니다.
 *
 * 봇 만들기
 *   텔레그램에서 @BotFather 에게 /newbot → 토큰을 받습니다.
 *   그 봇과 대화를 한 번 시작한 뒤
 *   https://api.telegram.org/bot<토큰>/getUpdates 에서 chat id 를 확인합니다.
 */

const API_BASE = 'https://api.telegram.org';

function credentials(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

/** 환경변수가 채워져 있는지 — 관리자 설정 화면의 안내에 씁니다. */
export function isTelegramConfigured(): boolean {
  return credentials() !== null;
}

/** HTML 파싱 모드에서 깨지지 않도록 최소한만 이스케이프합니다. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 메시지 한 통을 보냅니다.
 * 실패하면 콘솔에만 남기고 false 를 돌려줍니다. 예외를 던지지 않습니다.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const auth = credentials();
  if (!auth) return false;

  try {
    const response = await fetch(`${API_BASE}/bot${auth.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: auth.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      // 알림 때문에 주문 저장이 오래 걸리면 안 됩니다.
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn('[telegram] 전송 실패:', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[telegram] 전송 중 오류:', error);
    return false;
  }
}

/* ------------------------------------------------------------------
 * 이벤트별 메시지
 * ------------------------------------------------------------------ */

/** 🛍 새 주문 */
export async function notifyNewOrder(order: Order): Promise<void> {
  const lines = [
    `🛍 <b>새 주문</b> (${escapeHtml(order.orderNo)})`,
    '',
    `${escapeHtml(order.ordererName)} · ${escapeHtml(order.ordererPhone)}`,
    '',
    ...order.items.map(
      (item) =>
        `· ${escapeHtml(item.productName)}${
          item.optionKey ? ` [${escapeHtml(item.optionKey)}]` : ''
        } x${item.quantity}`
    ),
    '',
    `결제금액 <b>${formatPrice(order.totalAmount)}원</b>`,
    `입금자명 ${escapeHtml(order.depositorName || '(미입력)')}`,
    '',
    `관리자에서 보기: ${SITE_URL}/admin/orders/${order.id}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/** ⚠️ 손님의 주문 취소 요청 */
export async function notifyCancelRequest(order: Order, reason: string): Promise<void> {
  const lines = [
    `⚠️ <b>주문 취소 요청</b> (${escapeHtml(order.orderNo)})`,
    '',
    `${escapeHtml(order.ordererName)} · ${escapeHtml(order.ordererPhone)}`,
    `현재 상태: ${escapeHtml(order.status)}`,
    `결제금액 ${formatPrice(order.totalAmount)}원`,
    '',
    `사유: ${escapeHtml(reason || '(미입력)')}`,
    '',
    `확인 후 처리해 주세요: ${SITE_URL}/admin/orders/${order.id}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/** 💬 새 1:1 문의 */
export async function notifyNewInquiry(inquiry: Inquiry): Promise<void> {
  const lines = [
    `💬 <b>새 문의</b> (${escapeHtml(inquiry.inquiryNo)})`,
    '',
    `${escapeHtml(inquiryCategoryLabel(inquiry.category))} · ${escapeHtml(inquiry.title)}`,
    `작성자 ${escapeHtml(inquiry.writerName)}${
      inquiry.userId ? ' (회원)' : ' (비회원)'
    }`,
    '',
    `관리자에서 보기: ${SITE_URL}/admin/inquiries/${inquiry.id}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/* ------------------------------------------------------------------
 * 다음 단계에서 채울 자리
 * ------------------------------------------------------------------ */

/** ⭐ 새 리뷰 — 다음 단계에서 사용 예정 */
export async function notifyNewReview(_payload: {
  id: string;
  productName: string;
  rating: number;
}): Promise<void> {
  void _payload;
  // 리뷰 기능을 만들 때 sendTelegramMessage 로 채웁니다.
}
