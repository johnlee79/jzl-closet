'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  CheckoutError,
  calcShipping,
  createOrder,
  getOrderForLookup,
  requestCancel,
} from '@/lib/orders';
import { getCurrentUser } from '@/lib/auth';
import { canRequestCancel } from '@/lib/order-status';
import { createOrderToken } from '@/lib/order-token';
import { getPaymentProvider } from '@/lib/payments';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getPaymentSettings } from '@/lib/settings';
import {
  acceptsCashReceipt,
  enabledPaymentMethods,
  hasBankAccount,
  isPgMethod,
} from '@/lib/site-config';
import { notifyCancelRequest, notifyNewOrder } from '@/lib/telegram';
import type { CashReceiptType, CheckoutInput, Order } from '@/lib/types';

/**
 * 주문 관련 서버 액션.
 *
 * ★ 금액은 여기서 계산하지 않습니다. lib/orders.ts 가 상품 테이블을 다시 읽어
 *   가격·옵션 추가금액·배송비를 계산합니다. 클라이언트가 보낸 금액은 받지도 않습니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; problems?: string[] };

/* ------------------------------------------------------------------
 * 입력 검증
 * ------------------------------------------------------------------ */

const PHONE_PATTERN = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

function required(value: string, label: string): string | null {
  return value.trim() ? null : `${label}을(를) 입력해 주세요.`;
}

function validate(input: CheckoutInput, enabled: string[]): string | null {
  if (!input.agreed) return '구매조건 확인 및 결제진행에 동의해 주세요.';

  const checks: (string | null)[] = [
    required(input.ordererName, '주문자 이름'),
    required(input.ordererPhone, '주문자 연락처'),
    required(input.receiverName, '받는 분 이름'),
    required(input.receiverPhone, '받는 분 연락처'),
    required(input.postcode, '우편번호'),
    required(input.address1, '주소'),
  ];
  const first = checks.find(Boolean);
  if (first) return first;

  if (!PHONE_PATTERN.test(input.ordererPhone.trim())) {
    return '주문자 연락처를 다시 확인해 주세요.';
  }
  if (!PHONE_PATTERN.test(input.receiverPhone.trim())) {
    return '받는 분 연락처를 다시 확인해 주세요.';
  }
  if (input.ordererEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.ordererEmail.trim())) {
    return '이메일 주소를 다시 확인해 주세요.';
  }
  /*
   * ★ 관리자가 켜 둔 결제수단만 받습니다. (4-A)
   *   화면에서 안 보이게 하는 것만으로는 부족합니다.
   *   요청을 직접 만들어 보내면 꺼 둔 수단으로도 주문이 들어옵니다.
   *   특히 계좌이체는 KSNET 오픈 확인 전이라 결제창 자체가 열리지 않습니다.
   */
  if (!enabled.includes(input.paymentMethod)) {
    return '지금 이용할 수 없는 결제 수단입니다. 다른 수단을 골라 주세요.';
  }

  // 입금자명은 무통장입금에만 필요합니다. 카드 주문에는 받지 않습니다.
  if (input.paymentMethod === 'bank_transfer' && !input.depositorName.trim()) {
    return '입금자명을 입력해 주세요.';
  }
  if (input.items.length === 0) {
    return '장바구니가 비어 있습니다.';
  }

  /*
   * ★ 현금영수증은 무통장입금에만 해당합니다.
   *   카드·간편결제는 현금영수증 대상이 아닙니다. (카드 매출전표가 그 역할을 합니다)
   *   화면에서도 감추지만, 값이 섞여 들어오면 여기서 막습니다.
   */
  if (!acceptsCashReceipt(input.paymentMethod) && input.cashReceiptType !== 'none') {
    return '카드·간편결제는 현금영수증 신청 대상이 아닙니다.';
  }

  if (input.cashReceiptType !== 'none') {
    const digits = input.cashReceiptNo.replace(/[^0-9]/g, '');
    if (input.cashReceiptType === 'personal' && (digits.length < 10 || digits.length > 11)) {
      return '현금영수증에 쓸 휴대폰 번호를 10~11자리 숫자로 입력해 주세요.';
    }
    if (input.cashReceiptType === 'business' && digits.length !== 10) {
      return '사업자등록번호는 10자리 숫자로 입력해 주세요.';
    }
  }

  return null;
}

function toCashReceiptType(value: string): CashReceiptType {
  return value === 'personal' || value === 'business' ? value : 'none';
}

/* ------------------------------------------------------------------
 * 배송비 미리 보기 — 우편번호를 고르면 화면 금액을 맞춰 줍니다.
 * ------------------------------------------------------------------ */

export async function quoteShippingAction(
  itemsTotal: number,
  postcode: string
): Promise<{ shippingFee: number; extraShippingFee: number; remote: boolean }> {
  const safeTotal = Number.isFinite(itemsTotal) ? Math.max(0, Math.trunc(itemsTotal)) : 0;
  return calcShipping(safeTotal, postcode);
}

/* ------------------------------------------------------------------
 * 주문하기
 * ------------------------------------------------------------------ */

export type PlaceOrderResult = {
  orderNo: string;
  token: string;
  /**
   * 이 주소로 보내세요.
   *   무통장입금 → /checkout/complete (주문 완료 · 계좌 안내)
   *   카드·간편결제 → /checkout/pay   (KSNET 결제창)
   * ★ 어디로 보낼지는 서버가 정합니다. 클라이언트가 판단하면
   *   결제수단이 늘어날 때마다 두 곳을 고쳐야 하고 언젠가 한쪽이 빠집니다.
   */
  nextUrl: string;
  /** 결제창으로 넘어가는 중인지 — 장바구니를 비울 시점을 가릅니다. */
  needsPayment: boolean;
};

export async function placeOrderAction(
  input: CheckoutInput
): Promise<ActionResult<PlaceOrderResult>> {
  // 같은 IP 가 1분에 10번 넘게 주문을 밀어 넣지 못하게 합니다.
  const ip = clientIp(headers());
  const limited = rateLimit(`checkout:${ip}`, 10, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `주문 요청이 너무 많습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  // ★ 켜져 있는 결제수단은 DB(관리자 설정)에서 읽습니다. 화면 값을 믿지 않습니다.
  const payment = await getPaymentSettings();
  const enabled = enabledPaymentMethods(payment.methods).map((method) => method.key);

  const problem = validate(input, enabled);
  if (problem) return { ok: false, error: problem };

  // 결제 수단은 lib/payments 에 등록된 것만 받습니다.
  const provider = getPaymentProvider(input.paymentMethod);
  if (!provider || !provider.ready) {
    return { ok: false, error: '지금 이용할 수 없는 결제 수단입니다.' };
  }

  // 무통장입금은 계좌를 등록하지 않았으면 주문을 받을 수 없습니다.
  // ★ 카드 주문은 계좌와 무관합니다. 계좌가 없다고 카드결제까지 막으면 안 됩니다.
  if (input.paymentMethod === 'bank_transfer' && !hasBankAccount(payment)) {
    return {
      ok: false,
      error:
        '입금 계좌가 아직 등록되지 않았습니다. 고객센터로 문의해 주시면 바로 도와드리겠습니다.',
    };
  }

  // ★ 회원 여부는 클라이언트가 보낸 값이 아니라 세션에서 직접 읽습니다.
  //   로그인하지 않았으면 지금까지처럼 비회원 주문으로 저장됩니다.
  const user = await getCurrentUser();

  let order: Order;
  try {
    order = await createOrder({
      ...input,
      userId: user?.id ?? null,
      // 비회원이면 포인트를 쓸 수 없습니다.
      usePoints: user ? Math.max(0, Math.trunc(Number(input.usePoints) || 0)) : 0,
      // ★ 카드 주문에는 현금영수증 정보를 저장하지 않습니다. (대상이 아닙니다)
      cashReceiptType: acceptsCashReceipt(input.paymentMethod)
        ? toCashReceiptType(input.cashReceiptType)
        : 'none',
      items: input.items.map((item) => ({
        productSlug: String(item.productSlug),
        optionKey: String(item.optionKey ?? ''),
        quantity: Math.max(1, Math.min(99, Math.trunc(Number(item.quantity) || 1))),
      })),
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return { ok: false, error: error.message, problems: error.problems };
    }
    const message = error instanceof Error ? error.message : '주문에 실패했습니다.';
    console.error('[checkout]', message);
    return { ok: false, error: message };
  }

  // 결제 시작. 무통장입금은 계좌 안내 문구만 돌려주고 끝납니다.
  // 카드·간편결제는 결제창으로 넘어갈 주소를 돌려줍니다.
  const needsPayment = isPgMethod(order.paymentMethod);
  try {
    await provider.createPayment(order);
  } catch (error) {
    // 안내를 못 만들어도 주문은 이미 저장되어 있습니다. 로그만 남깁니다.
    console.warn('[checkout] 결제 안내 생성 실패:', error);
  }

  /*
   * ★ 알림 실패가 주문을 막으면 안 됩니다. 실패해도 주문은 이미 저장되어 있습니다.
   * ★ 카드 주문은 여기서 알리지 않습니다. (4-A)
   *   결제창을 열었다가 그냥 닫는 경우가 아주 많습니다. 그때마다 알림이 가면
   *   공급처에 넘기면 안 되는 주문이 섞여 발송 사고가 납니다.
   *   카드 주문은 승인이 확인된 뒤(/api/payment/ksnet/return)에 알립니다.
   */
  if (payment.telegramEnabled && !needsPayment) {
    try {
      await notifyNewOrder(order, payment.depositHours);
    } catch (error) {
      console.warn('[checkout] 텔레그램 알림 실패:', error);
    }
  }

  // 재고가 줄었으므로 상품 화면을 다시 굽습니다.
  revalidatePath('/products');
  for (const item of order.items) {
    revalidatePath(`/products/${item.productSlug}`);
  }

  const token = await createOrderToken(order.orderNo);
  const query = new URLSearchParams({ no: order.orderNo, k: token });

  return {
    ok: true,
    data: {
      orderNo: order.orderNo,
      token,
      nextUrl: needsPayment
        ? `/checkout/pay?${query.toString()}`
        : `/checkout/complete?${query.toString()}`,
      needsPayment,
    },
  };
}

/* ------------------------------------------------------------------
 * 비회원 주문 조회
 * ------------------------------------------------------------------ */

export async function lookupOrderAction(
  orderNo: string,
  phone: string
): Promise<ActionResult<Order>> {
  // ★ 같은 IP 는 분당 10회까지만. 주문번호를 하나씩 바꿔가며 두드리는 시도를 막습니다.
  const ip = clientIp(headers());
  const limited = rateLimit(`lookup:${ip}`, 10, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `조회 시도가 너무 많습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  if (!orderNo.trim() || !phone.trim()) {
    return { ok: false, error: '주문번호와 연락처를 모두 입력해 주세요.' };
  }

  const order = await getOrderForLookup(orderNo, phone);
  if (!order) {
    // 주문번호가 있는지 없는지 알려 주지 않습니다.
    return { ok: false, error: '주문번호와 연락처가 일치하는 주문을 찾지 못했습니다.' };
  }

  return { ok: true, data: order };
}

/** 손님의 주문 취소 요청 — 관리자가 확인 후 처리합니다. */
export async function requestCancelAction(
  orderNo: string,
  phone: string,
  reason: string
): Promise<ActionResult> {
  const ip = clientIp(headers());
  const limited = rateLimit(`cancel:${ip}`, 5, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `요청이 너무 많습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  const order = await getOrderForLookup(orderNo, phone);
  if (!order) {
    return { ok: false, error: '주문번호와 연락처가 일치하는 주문을 찾지 못했습니다.' };
  }
  if (!canRequestCancel(order.status)) {
    return {
      ok: false,
      error: '이미 상품 준비가 시작되어 여기서는 취소할 수 없습니다. 고객센터로 문의해 주세요.',
    };
  }

  try {
    await requestCancel(order.id, reason);
  } catch (error) {
    const message = error instanceof Error ? error.message : '요청을 접수하지 못했습니다.';
    return { ok: false, error: message };
  }

  const payment = await getPaymentSettings();
  if (payment.telegramEnabled) {
    try {
      await notifyCancelRequest(order, reason);
    } catch (error) {
      console.warn('[checkout] 취소 요청 알림 실패:', error);
    }
  }

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true, data: undefined };
}
