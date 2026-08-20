import 'server-only';

import { ksnetMode } from '@/lib/payments/ksnet/config';
import { PAYMENT_METHODS, isPgMethod, paymentMethodLabel } from '@/lib/site-config';
import type { Order } from '@/lib/types';
import type {
  CancelPaymentResult,
  CreatePaymentResult,
  PaymentProvider,
  VerifyPaymentResult,
} from '@/lib/payments/types';

/**
 * KSNET (KSPay V1.4) — 신용카드 · 카카오페이 · 네이버페이 · 계좌이체.
 *
 * ★ 이 파일은 "어떻게 시작하는가" 만 다룹니다.
 *   실제 승인 확인은 lib/payments/ksnet/approve.ts,
 *   주문 상태 반영은 lib/orders.ts 의 applyKsnetApproval 이 합니다.
 *   결제 검증을 여러 곳에 흩어 두면 언젠가 한 곳만 빠집니다.
 *
 * ★ 취소(환불)는 여기서 할 수 없습니다.
 *   KSNET 이 가맹점에 취소 API 권한을 주지 않습니다. 대행사를 통해 사람이 처리합니다.
 *   그래서 cancelPayment 는 항상 실패를 돌려줍니다.
 *   버튼을 눌러 취소가 되는 것처럼 만들면 "취소했는데 돈이 안 들어온다" 는
 *   분쟁이 반드시 납니다.
 */
function ksnetProvider(methodKey: string): PaymentProvider {
  return {
    id: methodKey,
    label: paymentMethodLabel(methodKey),
    pgProvider: 'ksnet',
    ready: true,

    async createPayment(order: Order): Promise<CreatePaymentResult> {
      /*
       * 결제창 파라미터는 여기서 만들지 않습니다.
       * /checkout/pay 화면이 주문을 DB 에서 다시 읽어 서버에서 만듭니다.
       * (User-Agent 로 PC·모바일을 갈라야 하는데, 그 정보가 여기에는 없습니다)
       */
      return { kind: 'pg_form', continueUrl: `/checkout/pay?no=${order.orderNo}` };
    },

    /**
     * ★ 여기서는 검증하지 않습니다.
     *   승인 확인은 결제 결과를 받는 서버 라우트가
     *   approveKsnetPayment → applyKsnetApproval 순서로 처리합니다.
     *   이 자리에 두 번째 검증 경로를 만들면, 한쪽만 고쳐졌을 때
     *   금액이 다른 승인이 통과합니다.
     */
    async verifyPayment(_raw: unknown, _expectedAmount: number): Promise<VerifyPaymentResult> {
      void _raw;
      void _expectedAmount;
      return {
        ok: false,
        paidAmount: null,
        tid: null,
        paidAt: null,
        error:
          'KSNET 승인 확인은 /api/payment/ksnet/return 에서 처리합니다. 이 경로로 검증하지 마세요.',
      };
    },

    async cancelPayment(_order: Order): Promise<CancelPaymentResult> {
      void _order;
      return {
        ok: false,
        error:
          'KSNET 은 가맹점에 취소 권한을 주지 않습니다. 관리자에서 [취소 요청 접수] 를 누른 뒤 대행사에 연락해 주세요.',
      };
    },
  };
}

/** 등록할 KSNET 결제수단들 — 무통장입금을 뺀 전부 */
export const ksnetProviders: PaymentProvider[] = PAYMENT_METHODS.filter((method) =>
  isPgMethod(method.key)
).map((method) => ksnetProvider(method.key));

/** 관리자 화면 안내에 씁니다. */
export function ksnetModeLabel(): string {
  return ksnetMode() === 'live' ? '운영' : '테스트';
}
