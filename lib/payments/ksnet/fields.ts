import 'server-only';

import {
  CARD_MIN_AMOUNT,
  KSNET_CURRENCY,
  KSNET_INSTALLMENT,
  KSNET_INTEREST,
  KSNET_SHOWCARD,
  KSNET_STORE_CEO_FALLBACK,
  KSPAY_MOBILE_ACTION,
  KSPAY_PC_ACTION,
  ksnetConfigProblem,
  ksnetMid,
  ksnetPaymethodCode,
} from '@/lib/payments/ksnet/config';
import {
  KSNET_MAX_BYTES,
  assertKsnetLimits,
  buildGoodName,
  clampEuckr,
  ksnetAmount,
  ksnetPhone,
  sanitizeKsnetValue,
} from '@/lib/payments/ksnet/encode';
import { SITE_URL } from '@/lib/store';
import type { StoreSettings } from '@/lib/site-config';
import type { Order } from '@/lib/types';

/**
 * 결제창에 넘길 값 만들기.
 *
 * ★ 금액·주문번호·상품명은 전부 우리 DB 의 주문(Order)에서 나옵니다.
 *   클라이언트가 보낸 값은 하나도 쓰지 않습니다.
 * ★ 손님이 결제창에서 금액을 바꿔 보내도 소용없습니다.
 *   승인 확인(recv_post)에도 DB 금액을 넣고, 돌아온 금액과 DB 금액을 다시 대조합니다.
 */

export type KsnetFormFields = Record<string, string>;

export type KsnetFormResult = {
  fields: KsnetFormFields;
  /**
   * 폼을 보낼 주소.
   * ★ PC 와 모바일이 다릅니다. 경로 자체가 다릅니다.
   *   PC     /store/KSPayWebV1.4/KSPayPWeb.jsp     (아이프레임 안에서 엶)
   *   모바일  /store/KSPayMobileV1.4/KSPayPWeb.jsp  (페이지째 이동)
   *   섞어 쓰면 결제창이 열리지 않거나 화면이 깨집니다.
   */
  action: string;
  /** 결제창을 열 수 없는 이유. 있으면 절대 열지 마세요. */
  problem: string | null;
};

/**
 * 결제 결과를 받을 주소.
 *
 * ★★ 주문번호를 반드시 이 주소에 심어야 합니다.
 *   KSNET 은 결제 결과를 보낼 때 주문번호를 돌려주지 않습니다.
 *   실제로 들어온 값은 다섯 개뿐이었습니다.
 *     reCommConId · reCommType · reHash · reEncData · reCnclType
 *   그래서 주소에 심어 두지 않으면 "어느 주문의 결제인지" 를 알 방법이 없습니다.
 *   (첫 실제 결제가 이것 때문에 "주문 정보를 찾을 수 없습니다" 로 끝났습니다)
 *
 * ★ 경로와 쿼리 두 군데에 넣습니다. 한쪽이 잘리거나 다듬어져도 다른 쪽으로 찾습니다.
 * ★ 주문번호는 비밀이 아닙니다. 이 값으로 하는 일은 "어느 주문인지" 찾는 것뿐이고,
 *   금액은 그 주문을 DB 에서 다시 읽어 씁니다. 승인 응답의 ordno 와도 대조합니다.
 */
export function ksnetReplyUrl(orderNo: string): string {
  const encoded = encodeURIComponent(orderNo);
  return `${SITE_URL}/api/payment/ksnet/return/${encoded}?no=${encoded}`;
}

export function buildKsnetForm(
  order: Order,
  store: StoreSettings,
  /** ★ User-Agent 로 판단한 값입니다. 화면 폭으로 정하지 마세요. */
  isMobile: boolean,
  /** 결제 결과를 받을 절대경로 */
  replyUrl = ksnetReplyUrl(order.orderNo)
): KsnetFormResult {
  const action = isMobile ? KSPAY_MOBILE_ACTION : KSPAY_PC_ACTION;

  const configProblem = ksnetConfigProblem();
  if (configProblem) return empty(configProblem);

  const paymethod = ksnetPaymethodCode(order.paymentMethod);
  if (!paymethod) {
    return empty(`카드결제로 열 수 없는 결제수단입니다: ${order.paymentMethod}`);
  }

  /*
   * ★ 0원 이하로는 결제창을 열지 않습니다.
   *   포인트를 전액 써서 낼 돈이 없는 주문이 여기까지 오면
   *   ksnetAmount 가 예외를 던져 화면이 깨집니다.
   *   그런 주문은 애초에 PG 를 태울 이유가 없으므로 여기서 멈추고 이유를 남깁니다.
   */
  if (!Number.isInteger(order.totalAmount) || order.totalAmount <= 0) {
    return empty(`결제 금액이 올바르지 않습니다: ${order.totalAmount}`);
  }

  // 신용카드는 1,000원 미만을 카드사가 거절합니다. 열어 봐야 실패합니다.
  if (order.paymentMethod === 'card' && order.totalAmount < CARD_MIN_AMOUNT) {
    return empty(
      `신용카드는 ${CARD_MIN_AMOUNT.toLocaleString('ko-KR')}원 이상부터 결제할 수 있습니다.`
    );
  }

  const live = order.items.filter((item) => item.itemStatus !== 'cancelled');
  const goodName = buildGoodName(live[0]?.productName ?? '', live.length);

  const fields: KsnetFormFields = {
    sndPaymethod: paymethod,
    sndStoreid: ksnetMid(),
    // 주문번호는 우리가 만든 값이라 원래 안전하지만, 규격 검사를 똑같이 태웁니다.
    sndOrdernumber: clampEuckr(sanitizeKsnetValue(order.orderNo), KSNET_MAX_BYTES),
    sndGoodname: goodName,
    sndAmount: ksnetAmount(order.totalAmount),
    sndOrdername: clampEuckr(sanitizeKsnetValue(order.ordererName), KSNET_MAX_BYTES),
    sndEmail: sanitizeKsnetValue(order.ordererEmail),
    sndMobile: ksnetPhone(order.ordererPhone),
    // ★ 반드시 절대경로여야 합니다. 상대경로면 KSNET 이 돌아올 곳을 찾지 못합니다.
    sndReply: replyUrl,
    sndShowcard: KSNET_SHOWCARD,
    sndCurrencytype: KSNET_CURRENCY,
    sndInstallmenttype: KSNET_INSTALLMENT,
    sndInteresttype: KSNET_INTEREST,
    /*
     * 카카오페이 필수 3종.
     * ★ 카카오페이가 아니어도 함께 보냅니다. 다른 수단은 무시하고,
     *   보내지 않았다가 카카오페이에서만 실패하는 사고를 막습니다.
     * ★ 값은 관리자 설정(스토어 정보)에서 옵니다. 코드에 박지 않습니다.
     */
    sndStoreCeoName: clampEuckr(
      sanitizeKsnetValue(store.business.ceo || KSNET_STORE_CEO_FALLBACK),
      KSNET_MAX_BYTES
    ),
    sndStorePhoneNo: ksnetPhone(store.phone),
    sndStoreAddress: clampEuckr(sanitizeKsnetValue(store.business.address), 100),
  };

  const problems = assertKsnetLimits(fields);
  if (problems.length > 0) return empty(problems.join(' '), action);

  return { fields, action, problem: null };
}

function empty(problem: string, action = KSPAY_PC_ACTION): KsnetFormResult {
  return { fields: {}, action, problem };
}

/**
 * PC 인지 모바일인지.
 *
 * ★ 화면 폭으로 판단하면 안 됩니다.
 *   PC 브라우저 창을 좁혔다고 모바일 결제창을 열면, 페이지가 통째로 이동해
 *   장바구니로 돌아올 수 없게 됩니다. 반대로 모바일에서 PC 방식을 쓰면
 *   레이어가 화면 밖으로 나가 카드번호를 입력할 수 없습니다.
 * ★ 그래서 User-Agent 로만 판단합니다. 서버에서 헤더를 읽어 정합니다.
 */
export function isMobileUserAgent(userAgent: string): boolean {
  return /android|iphone|ipad|ipod|iemobile|opera mini|mobile|blackberry|windows phone/i.test(
    userAgent ?? ''
  );
}
