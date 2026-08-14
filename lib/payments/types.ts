import type { Order } from '@/lib/types';

/**
 * ============================================================
 * 결제 수단 인터페이스
 * ============================================================
 *
 * 지금은 무통장입금 하나뿐입니다. 나중에 PG(토스페이먼츠·나이스페이 등)를
 * 붙일 때 파일 하나(예: lib/payments/toss.ts)를 추가하고
 * lib/payments/index.ts 의 목록에 등록하기만 하면 됩니다.
 *
 * ★ 결제 검증은 반드시 서버에서 합니다.
 *   verifyPayment 는 "클라이언트가 보낸 결과"가 아니라
 *   "PG 서버에 직접 조회한 결과"로 판단해야 합니다.
 *   그래서 이 인터페이스는 클라이언트가 보낸 값을 raw 로만 받고,
 *   금액 확인에 쓰는 expectedAmount 는 우리 DB 값으로 넘기게 되어 있습니다.
 */

/** 결제 시작 — 손님을 어디로 보낼지 (또는 무엇을 안내할지) 알려 줍니다. */
export type CreatePaymentResult =
  | {
      kind: 'instruction';
      /** 화면에 보여 줄 안내 (무통장입금 계좌 등) */
      message: string;
    }
  | {
      kind: 'redirect';
      /** PG 결제창 주소 */
      url: string;
    };

/** 결제 검증 결과 */
export type VerifyPaymentResult = {
  ok: boolean;
  /** 실제로 결제된 금액 (PG 조회 결과) */
  paidAmount: number | null;
  /** PG 거래번호 */
  tid: string | null;
  paidAt: string | null;
  error?: string;
};

export type CancelPaymentResult = {
  ok: boolean;
  error?: string;
};

export type PaymentProvider = {
  /** orders.payment_method 에 저장되는 값 */
  id: string;
  label: string;
  /** orders.pg_provider 에 저장되는 값. 무통장입금은 null 입니다. */
  pgProvider: string | null;
  /** 지금 쓸 수 있는지. false 면 주문서에서 "준비 중" 으로 표시합니다. */
  ready: boolean;

  /** 주문을 만든 직후 호출합니다. */
  createPayment(order: Order): Promise<CreatePaymentResult>;

  /**
   * 결제 결과를 검증합니다.
   * @param raw            클라이언트나 PG 콜백이 보낸 원본 (신뢰하지 않습니다)
   * @param expectedAmount 우리 DB 에 저장된 결제금액 (이 값과 대조합니다)
   */
  verifyPayment(raw: unknown, expectedAmount: number): Promise<VerifyPaymentResult>;

  /** 결제 취소 (환불). 무통장입금은 사람이 직접 이체하므로 수동 처리입니다. */
  cancelPayment(order: Order): Promise<CancelPaymentResult>;
};
