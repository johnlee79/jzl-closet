import 'server-only';

import { bankTransfer } from '@/lib/payments/bank-transfer';
import { ksnetProviders } from '@/lib/payments/ksnet';
import type { PaymentProvider } from '@/lib/payments/types';

/**
 * 쓸 수 있는 결제 수단 목록.
 *
 * PG 를 붙이는 순서
 *   1) lib/payments/<이름>.ts 에 PaymentProvider 를 하나 만든다
 *   2) 아래 배열에 추가한다
 *   3) 주문서의 결제 수단 목록(lib/site-config.ts 의 PAYMENT_METHODS)에 한 줄 넣는다
 *   4) 관리자 > 설정 > 결제·주문 에서 그 수단을 켠다
 * 다른 코드는 손대지 않아도 됩니다.
 *
 * ★ ready 는 "코드가 준비되었는지" 입니다.
 *   손님에게 실제로 보일지는 관리자 설정(PaymentSettings.methods)이 정합니다.
 *   그래서 여기서 ready 인 것과 주문서에 나오는 것은 다를 수 있습니다.
 */
const PROVIDERS: PaymentProvider[] = [bankTransfer, ...ksnetProviders];

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

/** 코드상 결제를 받을 수 있는 수단만 (관리자 설정은 따로 확인하세요) */
export function getReadyProviders(): PaymentProvider[] {
  return PROVIDERS.filter((provider) => provider.ready);
}

export type { PaymentProvider } from '@/lib/payments/types';
