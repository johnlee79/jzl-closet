import 'server-only';

import { bankTransfer } from '@/lib/payments/bank-transfer';
import type { PaymentProvider } from '@/lib/payments/types';

/**
 * 쓸 수 있는 결제 수단 목록.
 *
 * PG 를 붙이는 순서
 *   1) lib/payments/<이름>.ts 에 PaymentProvider 를 하나 만든다
 *   2) 아래 배열에 추가한다
 *   3) 주문서의 결제 수단 목록(lib/site-config.ts 의 PAYMENT_METHODS)에서
 *      ready 를 true 로 바꾼다
 * 다른 코드는 손대지 않아도 됩니다.
 */
const PROVIDERS: PaymentProvider[] = [bankTransfer];

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

/** 지금 실제로 결제를 받을 수 있는 수단만 */
export function getReadyProviders(): PaymentProvider[] {
  return PROVIDERS.filter((provider) => provider.ready);
}

export type { PaymentProvider } from '@/lib/payments/types';
