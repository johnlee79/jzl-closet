import 'server-only';

import { inquiryCategoryLabel } from '@/lib/inquiry-status';
import { formatPrice } from '@/lib/product-utils';
import { SITE_URL } from '@/lib/store';
import { TELEGRAM_MAX_LENGTH, buildNewOrderMessage } from '@/lib/telegram-format';
import type { Inquiry } from '@/lib/inquiries';
import type { Review } from '@/lib/reviews';
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
 *
 * @param parseMode 'HTML' 이면 <b> 같은 태그를 씁니다.
 *   'none' 은 서식 없이 보낸 그대로 나갑니다. 공급처에 복사해 넘길 내용처럼
 *   이스케이프 실수로 전송이 통째로 실패하면 안 되는 메시지에 씁니다.
 */
export async function sendTelegramMessage(
  text: string,
  parseMode: 'HTML' | 'none' = 'HTML'
): Promise<boolean> {
  const auth = credentials();
  if (!auth) return false;

  try {
    const response = await fetch(`${API_BASE}/bot${auth.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: auth.chatId,
        // 만일을 대비한 마지막 안전장치입니다. (내용은 미리 줄여서 넘깁니다)
        text: text.slice(0, TELEGRAM_MAX_LENGTH),
        ...(parseMode === 'HTML' ? { parse_mode: 'HTML' } : {}),
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

/**
 * 🛍 새 주문.
 * 메시지 본문은 lib/telegram-format.ts 가 만듭니다.
 * ★ 공급처에 그대로 복사해 넘길 내용이라 서식 없이(parse_mode 없이) 보냅니다.
 */
export async function notifyNewOrder(order: Order, depositHours = 0): Promise<void> {
  await sendTelegramMessage(buildNewOrderMessage(order, depositHours), 'none');
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

/**
 * 🚫 입금 기한이 지나 자동취소된 주문.
 *
 * ★ 여러 건이 한 번에 취소될 수 있어 한 통으로 묶어 보냅니다.
 *   건마다 보내면 알림이 도배됩니다.
 * ★ 재고와 사용 포인트는 이미 되돌린 뒤에 부릅니다.
 */
export async function notifyAutoCancel(orders: Order[], hours: number): Promise<void> {
  if (orders.length === 0) return;

  const head = [
    `🚫 <b>미입금 자동취소</b> ${orders.length}건`,
    '',
    `입금 기한 ${hours}시간이 지나 자동으로 취소했습니다.`,
    '재고와 사용 포인트는 되돌렸습니다.',
    '',
  ];

  const rows = orders.map(
    (order) =>
      `· ${escapeHtml(order.orderNo)} ${escapeHtml(order.ordererName)} ` +
      `${formatPrice(order.totalAmount)}원`
  );

  const tail = ['', `관리자: ${SITE_URL}/admin/orders?status=cancelled`];

  await sendTelegramMessage([...head, ...rows, ...tail].join('\n'));
}

/** 💬 새 1:1 문의 */
export async function notifyNewInquiry(
  inquiry: Inquiry,
  /** 상품 문의면 상품명. 없으면 그 줄을 넣지 않습니다. */
  productName = ''
): Promise<void> {
  const lines = [
    `💬 <b>새 문의</b> (${escapeHtml(inquiry.inquiryNo)})`,
    '',
    ...(productName ? [`상품 ${escapeHtml(productName)}`] : []),
    `${escapeHtml(inquiryCategoryLabel(inquiry.category))} · ${escapeHtml(inquiry.title)}`,
    `작성자 ${escapeHtml(inquiry.writerName)}${
      inquiry.userId ? ' (회원)' : ' (비회원)'
    }${inquiry.isSecret ? ' · 비밀글' : ''}`,
    '',
    // 앞부분만 보여 주고 나머지는 관리자에서 봅니다.
    escapeHtml(inquiry.content.slice(0, 150)) + (inquiry.content.length > 150 ? '…' : ''),
    '',
    `관리자에서 보기: ${SITE_URL}/admin/inquiries/${inquiry.id}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/**
 * ⭐ 새 리뷰.
 * ★ 별점 3점 이하면 앞에 ⚠️ 를 붙여 눈에 띄게 합니다. 먼저 확인해야 할 후기입니다.
 * ★ 관리자가 직접 등록한 체험단 후기에는 이 함수를 부르지 않습니다.
 */
export async function notifyNewReview(
  review: Review,
  productName: string
): Promise<void> {
  const low = review.rating <= 3;
  const photos = review.attachments.length;

  const lines = [
    `${low ? '⚠️ ' : ''}⭐ <b>새 리뷰</b> (별점 ${review.rating})`,
    '',
    escapeHtml(productName),
    `${escapeHtml(review.writerName)}${photos > 0 ? ` · 사진 ${photos}장` : ''}`,
    '',
    // 앞부분만 보여 주고 나머지는 관리자에서 봅니다.
    escapeHtml(review.content.slice(0, 100)) + (review.content.length > 100 ? '…' : ''),
    '',
    `관리자: ${SITE_URL}/admin/reviews`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}
