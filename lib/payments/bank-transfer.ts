import 'server-only';

import { formatPrice } from '@/lib/product-utils';
import { getPaymentSettings } from '@/lib/settings';
import type { Order } from '@/lib/types';
import type {
  CancelPaymentResult,
  CreatePaymentResult,
  PaymentProvider,
  VerifyPaymentResult,
} from '@/lib/payments/types';

/**
 * 무통장입금(계좌이체).
 *
 * PG 를 거치지 않고 사장님이 통장을 직접 확인하는 방식입니다.
 * 그래서 verifyPayment 는 자동으로 확인할 방법이 없어 항상 "아직 확인 안 됨"을
 * 돌려줍니다. 입금 확인은 관리자 화면에서 상태를 '결제완료'로 바꾸는 것으로 합니다.
 */
export const bankTransfer: PaymentProvider = {
  id: 'bank_transfer',
  label: '무통장입금 (계좌이체)',
  pgProvider: null,
  ready: true,

  async createPayment(order: Order): Promise<CreatePaymentResult> {
    const payment = await getPaymentSettings();
    const deadline = new Date(
      (order.createdAt ? new Date(order.createdAt).getTime() : Date.now()) +
        payment.depositHours * 60 * 60 * 1000
    );

    return {
      kind: 'instruction',
      message: [
        `${payment.bankName} ${payment.accountNo} (예금주 ${payment.accountHolder})`,
        `${formatPrice(order.totalAmount)}원을 ${payment.depositHours}시간 이내에 입금해 주세요.`,
        `입금 기한: ${deadline.toLocaleString('ko-KR')}`,
      ].join('\n'),
    };
  },

  async verifyPayment(_raw: unknown, _expectedAmount: number): Promise<VerifyPaymentResult> {
    void _raw;
    void _expectedAmount;
    // 계좌이체는 자동 검증 수단이 없습니다.
    // 사장님이 통장을 보고 관리자에서 '결제완료'로 바꾸면 그때가 확인 시점입니다.
    return {
      ok: false,
      paidAmount: null,
      tid: null,
      paidAt: null,
      error: '무통장입금은 관리자가 입금을 확인한 뒤 결제완료로 바꿉니다.',
    };
  },

  async cancelPayment(_order: Order): Promise<CancelPaymentResult> {
    void _order;
    // 환불도 사람이 직접 이체합니다. 여기서는 성공으로 두고 상태만 바꿉니다.
    return { ok: true };
  },
};
