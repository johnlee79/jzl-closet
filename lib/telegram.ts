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

/* ------------------------------------------------------------------
 * 결제 (4-A)
 * ------------------------------------------------------------------
 * ★ 아래 알림들은 관리자 설정의 "새 주문 알림" 토글과 무관하게 항상 보냅니다.
 *   돈이 어긋난 상황이라 놓치면 안 됩니다.
 *   알림을 꺼 두었다는 이유로 금액 불일치를 며칠 뒤에 알게 되면 이미 늦습니다.
 * ------------------------------------------------------------------ */

/**
 * 🚨 금액·주문번호가 어긋난 승인 — 결제완료로 넘기지 않고 검토필요로 두었습니다.
 * ★ 이 알림이 오면 즉시 KSNET 거래내역(ksta.ksnet.co.kr)과 대조해야 합니다.
 */
export async function notifyPaymentReview(
  order: Order,
  reason: string,
  facts: { trno?: string; authno?: string; amount?: number | null }
): Promise<void> {
  const lines = [
    '🚨 <b>결제 검토 필요</b> — 자동으로 처리하지 않았습니다',
    '',
    `주문번호 ${escapeHtml(order.orderNo)}`,
    `${escapeHtml(order.ordererName)} · ${escapeHtml(order.ordererPhone)}`,
    '',
    `우리 주문 금액  ${formatPrice(order.totalAmount)}원`,
    `PG 승인 금액   ${
      typeof facts.amount === 'number' ? `${formatPrice(facts.amount)}원` : '확인 불가'
    }`,
    '',
    `사유: ${escapeHtml(reason)}`,
    ...(facts.trno ? [`KSNET 거래번호 ${escapeHtml(facts.trno)}`] : []),
    ...(facts.authno ? [`승인번호 ${escapeHtml(facts.authno)}`] : []),
    '',
    '★ 주문은 결제완료로 바꾸지 않았습니다. 발송하지 마세요.',
    `확인: ${SITE_URL}/admin/orders/${order.id}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/**
 * ⏳ 승인 확인 실패 — 승인은 났을 수 있는데 우리가 확인하지 못했습니다.
 * ★ 손님에게 "실패" 라고 말하면 안 되는 상황입니다. 이중결제가 납니다.
 */
export async function notifyPaymentUnconfirmed(
  order: Order | null,
  orderNo: string,
  reason: string
): Promise<void> {
  const lines = [
    '⏳ <b>승인 확인 실패</b> — 사람이 확인해야 합니다',
    '',
    `주문번호 ${escapeHtml(orderNo)}`,
    ...(order
      ? [
          `${escapeHtml(order.ordererName)} · ${escapeHtml(order.ordererPhone)}`,
          `결제금액 ${formatPrice(order.totalAmount)}원`,
        ]
      : ['(주문을 찾지 못했습니다)']),
    '',
    `사유: ${escapeHtml(reason)}`,
    '',
    '★ 카드 승인이 이미 났을 수 있습니다. KSNET 거래내역(ksta.ksnet.co.kr)에서',
    '  이 주문번호를 확인한 뒤 처리해 주세요. 손님에게 재결제를 안내하지 마세요.',
    ...(order ? [`확인: ${SITE_URL}/admin/orders/${order.id}`] : []),
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/** 💳 카드 결제가 완료되었습니다. */
export async function notifyPaymentPaid(
  order: Order,
  facts: { trno?: string; authno?: string }
): Promise<void> {
  const lines = [
    `💳 <b>결제 완료</b> (${escapeHtml(order.orderNo)})`,
    '',
    `${escapeHtml(order.ordererName)} · ${escapeHtml(order.ordererPhone)}`,
    `${escapeHtml(order.paymentMethod)} · ${formatPrice(order.totalAmount)}원`,
    ...(facts.authno ? [`승인번호 ${escapeHtml(facts.authno)}`] : []),
    ...(facts.trno ? [`거래번호 ${escapeHtml(facts.trno)}`] : []),
    '',
    `관리자: ${SITE_URL}/admin/orders/${order.id}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/**
 * 📩 KSNET 노티(거래내역통보) 수신.
 *
 * ★ 노티에는 인증이 없습니다. 아무나 보낼 수 있습니다.
 *   그래서 노티만으로 주문을 완료 처리하지 않습니다. (관리자 설정에서 켤 수 있습니다)
 *   대신 받은 사실을 반드시 알려 사람이 확인하게 합니다.
 */
export async function notifyKsnetNotify(
  summary: string,
  detail: string
): Promise<void> {
  const lines = [
    '📩 <b>KSNET 노티 수신</b>',
    '',
    escapeHtml(summary),
    '',
    escapeHtml(detail.slice(0, 600)),
    '',
    `관리자: ${SITE_URL}/admin/orders`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/**
 * ↩️ 취소 요청 접수 (관리자가 누름).
 * ★ 실제 환불은 대행사를 통해 사람이 처리합니다. 며칠 걸립니다.
 *   대행사에 연락할 때 필요한 거래번호·승인번호를 함께 보냅니다.
 */
export async function notifyCancelAccepted(order: Order, memo: string): Promise<void> {
  const lines = [
    `↩️ <b>취소 요청 접수</b> (${escapeHtml(order.orderNo)})`,
    '',
    `${escapeHtml(order.ordererName)} · ${escapeHtml(order.ordererPhone)}`,
    `${escapeHtml(order.paymentMethod)} · ${formatPrice(order.totalAmount)}원`,
    '',
    ...(order.pgTid ? [`KSNET 거래번호 ${escapeHtml(order.pgTid)}`] : []),
    ...(order.pgAuthNo ? [`승인번호 ${escapeHtml(order.pgAuthNo)}`] : []),
    ...(memo ? ['', `메모: ${escapeHtml(memo)}`] : []),
    '',
    '★ 취소는 대행사를 통해 사람이 처리합니다. 위 번호로 접수해 주세요.',
    '  환불이 실제로 끝나면 관리자에서 [취소 완료] 를 눌러 주세요.',
    `확인: ${SITE_URL}/admin/orders/${order.id}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
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

/**
 * 🎁 친구 초대 보상 처리 알림 (3-F).
 *
 * ★ 보상이 나갈 때마다 알립니다.
 *   포인트는 자동으로 나가므로, 알림이 없으면 어뷰징이 터져도 늦게 압니다.
 *   사은품은 사람이 보내야 하니 놓치지 않도록 알립니다.
 */
export async function notifyReferralReward(
  title: string,
  detail: string
): Promise<void> {
  const lines = [
    `🎁 <b>친구 초대 보상</b>`,
    '',
    escapeHtml(title),
    escapeHtml(detail),
    '',
    `관리자: ${SITE_URL}/admin/referrals/rewards`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/**
 * 🗂 카드 자동정리 일일 요약 (4-B).
 *
 * ★★ 왜 건별로 안 보내고 모아서 보내는가
 *   결제 Key 없이 정리되는 건은 가장 흔한 경우입니다. 결제창을 열었다가
 *   그냥 닫은 손님이 매일 여럿 나옵니다. 그때마다 알리면 하루에 수십 번
 *   울리고, 정작 중요한 알림("우리가 놓친 승인")을 놓칩니다.
 *
 * ★ 그래도 반드시 알려야 합니다. 재고를 되돌린 주문이라
 *   KSNET 쪽에 승인이 살아 있다면 우리가 모르는 매출이 됩니다.
 *   하루 한 번, 거래내역과 대조할 목록을 드립니다.
 */
export async function notifyCardSweepDigest(
  noKey: Order[],
  expired: Order[]
): Promise<void> {
  if (noKey.length === 0 && expired.length === 0) return;

  const list = (orders: Order[]) =>
    orders
      .slice(0, 20)
      .map(
        (order) =>
          `· ${escapeHtml(order.orderNo)} ${escapeHtml(order.ordererName)} ${formatPrice(order.totalAmount)}원`
      );

  const lines = [
    '🗂 <b>카드 결제대기 정리 요약</b>',
    '',
    ...(noKey.length > 0
      ? [
          `<b>결제 신호가 없어 정리한 주문 ${noKey.length}건</b> (재고는 되돌렸습니다)`,
          ...list(noKey),
          ...(noKey.length > 20 ? [`… 외 ${noKey.length - 20}건`] : []),
          '',
        ]
      : []),
    ...(expired.length > 0
      ? [
          `<b>자정이 지나 조회할 수 없게 된 주문 ${expired.length}건</b>`,
          ...list(expired),
          ...(expired.length > 20 ? [`… 외 ${expired.length - 20}건`] : []),
          '',
        ]
      : []),
    '★ 모두 <b>승인확인실패</b> 상태입니다. 결제되지 않았다고 단정할 수 없습니다.',
    '  KSNET 거래내역(ksta.ksnet.co.kr)에서 이 주문번호들을 확인해 주세요.',
    '  승인이 있었다면 관리자 주문 상세에서 결제완료로 확정해 주세요.',
    '',
    `확인: ${SITE_URL}/admin/orders?status=payment_unconfirmed`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

/**
 * ⚠️ 결제완료로 확정했는데 재고가 모자랐습니다 (4-B).
 *
 * ★★ 왜 알려야 하는가
 *   승인확인실패 주문을 결제완료로 확정하면, 자동정리가 되돌려 놓았던 재고를
 *   다시 잡습니다. 그런데 되돌린 사이에 그 물건이 팔렸을 수 있습니다.
 *   재고는 0 에서 멈추지만, 그 사실을 아무도 모르면 보낼 물건이 없는 주문을
 *   준비 중으로 넘기게 됩니다. 손님은 기다리다 뒤늦게 취소 연락을 받습니다.
 *
 * ★ 막지 않고 알리기만 합니다.
 *   운영자는 이미 KSNET 에서 승인을 확인하고 누른 것이라 주문을 되돌릴 수 없습니다.
 *   재고를 어떻게 맞출지는 공급처와 사람이 풀어야 할 문제입니다.
 */
/**
 * 포인트는 못 깎았는데 할인은 남아 있는 주문 — 사람이 직접 맞춰야 합니다.
 *
 * ★★ 아주 드물게 납니다. 손님이 다른 창에서 포인트를 다 써 버린 순간에
 *   주문이 들어오면 차감이 실패합니다. 그때 할인을 없던 걸로 되돌리는데,
 *   그 되돌리기까지 실패한 경우입니다.
 * ★ 주문은 막지 않습니다. 이미 저장돼 있고 손님은 결제로 넘어갔습니다.
 *   대신 즉시 알려 사람이 금액을 맞추게 합니다. 조용히 두면 그만큼 손해입니다.
 */
export async function notifyDiscountMismatch(
  orderNo: string,
  orderId: string,
  discount: number,
  shouldBe: number
): Promise<void> {
  const lines = [
    '⚠️ <b>금액을 맞춰 주세요</b> — 포인트는 안 깎였는데 할인이 남아 있습니다',
    '',
    `주문번호 ${escapeHtml(orderNo)}`,
    '',
    `할인으로 잡힌 금액  ${formatPrice(discount)}원`,
    `실제 받아야 할 금액  ${formatPrice(shouldBe)}원`,
    '',
    '★ 손님 포인트는 차감되지 않았습니다. 그런데 주문에는 할인이 들어가 있습니다.',
    '  그대로 두면 그만큼 덜 받게 됩니다.',
    '  주문 금액을 고치거나, 손님 포인트를 수동으로 차감해 주세요.',
    '',
    `확인: ${SITE_URL}/admin/orders/${orderId}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}

export async function notifyStockShortage(
  order: Order,
  shortages: {
    productName?: string;
    productSlug: string | null;
    optionKey: string;
    wanted: number;
    available: number;
  }[]
): Promise<void> {
  if (shortages.length === 0) return;

  const lines = [
    '⚠️ <b>재고 부족</b> — 결제완료로 확정했는데 물건이 모자랍니다',
    '',
    `주문번호 ${escapeHtml(order.orderNo)}`,
    `${escapeHtml(order.ordererName)} · ${escapeHtml(order.ordererPhone)}`,
    '',
    '<b>모자란 품목</b>',
    ...shortages.map(
      (x) =>
        `· ${escapeHtml(x.productName ?? x.productSlug ?? '')} (${escapeHtml(x.optionKey)}) — ${x.wanted}개 필요, ${x.available}개만 있었습니다`
    ),
    '',
    '★ 주문은 결제완료로 처리했습니다. 손님 돈은 이미 승인된 상태라 되돌릴 수 없습니다.',
    '  자동정리가 재고를 되돌린 사이에 그 물건이 팔린 것으로 보입니다.',
    '  공급처에 확보가 되는지 먼저 확인해 주세요.',
    '',
    `확인: ${SITE_URL}/admin/orders/${order.id}`,
  ];

  await sendTelegramMessage(lines.join('\n'));
}
