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
import { hasBankAccount } from '@/lib/site-config';
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

function validate(input: CheckoutInput): string | null {
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
  if (input.paymentMethod !== 'bank_transfer') {
    return '지금은 무통장입금만 이용하실 수 있습니다.';
  }
  if (!input.depositorName.trim()) {
    return '입금자명을 입력해 주세요.';
  }
  if (input.items.length === 0) {
    return '장바구니가 비어 있습니다.';
  }

  if (input.cashReceiptType !== 'none') {
    const digits = input.cashReceiptNo.replace(/[^0-9]/g, '');
    if (input.cashReceiptType === 'personal' && digits.length < 10) {
      return '현금영수증에 쓸 휴대폰 번호를 정확히 입력해 주세요.';
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

export async function placeOrderAction(
  input: CheckoutInput
): Promise<ActionResult<{ orderNo: string; token: string }>> {
  // 같은 IP 가 1분에 10번 넘게 주문을 밀어 넣지 못하게 합니다.
  const ip = clientIp(headers());
  const limited = rateLimit(`checkout:${ip}`, 10, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `주문 요청이 너무 많습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  const problem = validate(input);
  if (problem) return { ok: false, error: problem };

  // 결제 수단은 lib/payments 에 등록된 것만 받습니다.
  // PG 를 붙이면 구현체를 추가하는 것만으로 여기를 통과하게 됩니다.
  const provider = getPaymentProvider(input.paymentMethod);
  if (!provider || !provider.ready) {
    return { ok: false, error: '지금 이용할 수 없는 결제 수단입니다.' };
  }

  // 계좌를 등록하지 않았으면 주문을 받을 수 없습니다.
  const payment = await getPaymentSettings();
  if (!hasBankAccount(payment)) {
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
      cashReceiptType: toCashReceiptType(input.cashReceiptType),
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
  // PG 를 붙이면 여기서 결제창 주소를 받아 손님을 보내게 됩니다.
  try {
    await provider.createPayment(order);
  } catch (error) {
    // 안내를 못 만들어도 주문은 이미 저장되어 있습니다. 로그만 남깁니다.
    console.warn('[checkout] 결제 안내 생성 실패:', error);
  }

  // ★ 알림 실패가 주문을 막으면 안 됩니다. 실패해도 주문은 이미 저장되어 있습니다.
  if (payment.telegramEnabled) {
    try {
      await notifyNewOrder(order);
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
  return { ok: true, data: { orderNo: order.orderNo, token } };
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
