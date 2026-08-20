import { formatPrice } from '@/lib/product-utils';
import { SITE_URL } from '@/lib/store';
import type { Order } from '@/lib/types';

/**
 * 텔레그램 메시지 본문 만들기 — 순수 함수만 둡니다.
 * (실제 전송은 lib/telegram.ts 가 합니다. 서버 전용 코드와 섞지 않으려고 나눴습니다)
 */

/** 텔레그램 메시지 한 통의 최대 길이 */
export const TELEGRAM_MAX_LENGTH = 4096;

const DIVIDER = '──────────────';

/**
 * 결제수단 이름.
 * ★ lib/site-config.ts 의 paymentMethodLabel 을 쓰지 않고 여기 따로 둡니다.
 *   이 파일은 순수 함수만 두는 자리라 다른 모듈에 의존을 늘리지 않습니다.
 *   목록이 늘면 두 곳 다 손봐야 하므로, 모르는 값은 그대로 내보냅니다.
 */
function paymentMethodText(method: string): string {
  switch (method) {
    case 'bank_transfer':
      return '무통장입금';
    case 'card':
      return '신용카드';
    case 'kakaopay':
      return '카카오페이';
    case 'naverpay':
      return '네이버페이';
    case 'pg_banktransfer':
      return '계좌이체';
    default:
      return method;
  }
}

/** 숫자만 비교해 두 연락처가 같은지 봅니다. (010-1234-5678 == 01012345678) */
function samePhone(a: string, b: string): boolean {
  return a.replace(/[^0-9]/g, '') === b.replace(/[^0-9]/g, '');
}

/**
 * 🛍 새 주문 메시지.
 *
 * ★ 이 메시지를 그대로 복사해 공급처에 넘겨 발송을 맡기는 구조입니다.
 *   그래서 받는분·연락처·주소·배송메모가 한눈에 들어와야 하고,
 *   서식(HTML 태그)을 쓰지 않아 붙여넣었을 때 보이는 그대로 남아야 합니다.
 *
 * 형식
 *   🛍 새 주문 (ORD-20260814-0001)
 *   ──────────────
 *   [주문자] 홍길동 · 010-1234-5678
 *   [받는분] 김철수 · 010-9876-5432
 *   [주소] (21315) 인천 부평구 부일로 38, 1102호
 *   [메모] 부재 시 경비실
 *   ──────────────
 *   · 상품명 [옵션] x수량
 *   ──────────────
 *   결제금액 250,000원
 *   입금자명 홍길동
 *   ──────────────
 *   관리자: {SITE_URL}/admin/orders/{id}
 */
/**
 * 입금기한을 '08/15 14:30' 형태로. 한국시간 기준입니다.
 * 기한을 넘기지 않으면 빈 문자열이라 줄 자체가 들어가지 않습니다.
 */
export function depositDeadlineLabel(
  createdAt: string | null,
  hours: number
): string {
  if (!createdAt || hours < 1) return '';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '';

  const deadline = new Date(created.getTime() + hours * 60 * 60 * 1000);

  // ★ 지역화 문자열을 잘라 쓰면 형식이 바뀔 때 깨집니다. 조각으로 받아 직접 붙입니다.
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(deadline);

  const pick = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const month = pick('month');
  const day = pick('day');
  // hour12:false 에서 자정이 '24' 로 나오는 환경이 있어 맞춰 둡니다.
  const hour = pick('hour') === '24' ? '00' : pick('hour');
  const minute = pick('minute');

  if (!month || !day || !hour || !minute) return '';
  return `${month}/${day} ${hour}:${minute}`;
}

export function buildNewOrderMessage(order: Order, depositHours = 0): string {
  /* 배송지 한 줄 — (우편번호) 기본주소, 상세주소
     상세주소가 없으면 콤마도 넣지 않습니다. */
  const base = [order.postcode ? `(${order.postcode})` : '', order.address1]
    .filter(Boolean)
    .join(' ');
  const address = order.address2.trim() ? `${base}, ${order.address2.trim()}` : base;

  // 주문자와 받는분이 같으면 줄을 짧게 줄입니다.
  const sameReceiver =
    order.ordererName.trim() === order.receiverName.trim() &&
    samePhone(order.ordererPhone, order.receiverPhone);

  const head = [
    `🛍 새 주문 (${order.orderNo})`,
    DIVIDER,
    `[주문자] ${order.ordererName} · ${order.ordererPhone}`,
    sameReceiver
      ? '[받는분] (주문자와 동일)'
      : `[받는분] ${order.receiverName} · ${order.receiverPhone}`,
    `[주소] ${address}`,
    // ★ 배송메모가 없으면 줄 자체를 넣지 않습니다.
    ...(order.deliveryMemo.trim() ? [`[메모] ${order.deliveryMemo.trim()}`] : []),
    DIVIDER,
  ];

  const deadline = depositDeadlineLabel(order.createdAt, depositHours);

  /*
   * ★ 무통장입금과 카드결제는 알려야 할 것이 다릅니다. (4-A)
   *   무통장입금 — 입금자명과 입금기한 (통장을 보고 대조해야 합니다)
   *   카드결제   — 결제수단과 승인번호 (이미 돈이 들어왔습니다)
   *   카드 주문에 "입금자명 (미입력)" 이 찍히면 입금을 기다려야 하는 건으로 오해합니다.
   */
  const isBank = order.paymentMethod === 'bank_transfer';

  const paymentLines = isBank
    ? [
        `입금자명 ${order.depositorName || '(미입력)'}`,
        // ★ 기한을 모르고 자동취소되는 일이 없도록 알림에도 남깁니다.
        ...(deadline ? [`입금기한 ${deadline}`] : []),
      ]
    : [
        `결제수단 ${paymentMethodText(order.paymentMethod)}`,
        ...(order.pgAuthNo ? [`승인번호 ${order.pgAuthNo}`] : []),
      ];

  const tail = [
    DIVIDER,
    `결제금액 ${formatPrice(order.totalAmount)}원`,
    ...paymentLines,
    DIVIDER,
    `관리자: ${SITE_URL}/admin/orders/${order.id}`,
  ];

  // 부분취소된 품목은 빼고 보냅니다. (새 주문이라 보통은 없습니다)
  const itemLines = order.items
    .filter((item) => item.itemStatus === 'normal')
    .map(
      (item) =>
        `· ${item.productName}${item.optionKey ? ` [${item.optionKey}]` : ''} x${item.quantity}`
    );

  const build = (shown: string[], hidden: number): string =>
    [
      ...head,
      ...shown,
      ...(hidden > 0 ? [`· 외 ${hidden}건 — 전체 목록은 관리자에서 확인해 주세요`] : []),
      ...tail,
    ].join('\n');

  /* 길이 맞추기 — 텔레그램은 한 통에 4096자까지만 받습니다.
     넘치면 상품 줄을 뒤에서부터 덜어 내고 "외 N건" 으로 안내합니다. */
  let message = build(itemLines, 0);
  for (let shown = itemLines.length - 1; shown >= 0; shown -= 1) {
    if (message.length <= TELEGRAM_MAX_LENGTH) break;
    message = build(itemLines.slice(0, shown), itemLines.length - shown);
  }

  return message;
}
