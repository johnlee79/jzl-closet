/**
 * 주문 상태 — 서버·클라이언트 공용 (순수 함수만 둡니다)
 *
 * 흐름
 *   입금대기 → 결제완료 → 상품준비중 → 배송중 → 배송완료 → 구매확정
 *   어디서든 취소·교환·반품으로 빠질 수 있습니다.
 *
 * ★ PG 를 붙이면 "입금대기" 자리에 카드결제가 들어갑니다.
 *   그때 결제 성공은 paid, 실패는 failed 로 들어옵니다.
 */

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'preparing',
  'shipping',
  'delivered',
  'confirmed',
  'cancelled',
  'exchange',
  'returned',
  'failed',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

type StatusMeta = {
  label: string;
  /** 관리자 목록 뱃지 색 */
  /**
   * 뱃지 색.
   *   wait  입금대기 — 앰버
   *   go    결제완료 — 블루
   *   prep  상품준비중 — 슬레이트
   *   ship  배송중 — 앰버
   *   done  배송완료·구매확정 — 그린
   *   stop  취소·반품·실패 — 레드
   */
  tone: 'wait' | 'go' | 'prep' | 'ship' | 'done' | 'stop';
  /** 손님에게 보여 주는 한 줄 설명 */
  hint: string;
};

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  pending_payment: {
    label: '입금대기',
    tone: 'wait',
    hint: '안내드린 계좌로 입금해 주시면 확인 후 발송 준비를 시작합니다.',
  },
  paid: {
    label: '결제완료',
    tone: 'go',
    hint: '입금이 확인되었습니다. 곧 상품 준비를 시작합니다.',
  },
  preparing: {
    label: '상품준비중',
    tone: 'prep',
    hint: '주문하신 상품을 포장하고 있습니다.',
  },
  shipping: {
    label: '배송중',
    tone: 'ship',
    hint: '상품이 출고되었습니다. 송장번호로 배송 조회가 가능합니다.',
  },
  delivered: {
    label: '배송완료',
    tone: 'done',
    hint: '상품이 도착했습니다. 문제가 있으면 7일 이내에 연락해 주세요.',
  },
  confirmed: {
    label: '구매확정',
    tone: 'done',
    hint: '구매가 확정되었습니다. 이용해 주셔서 감사합니다.',
  },
  cancelled: {
    label: '취소',
    tone: 'stop',
    hint: '주문이 취소되었습니다. 입금하신 금액이 있다면 확인 후 환불해 드립니다.',
  },
  exchange: {
    label: '교환',
    tone: 'stop',
    hint: '교환 처리 중입니다. 진행 상황은 고객센터로 문의해 주세요.',
  },
  returned: {
    label: '반품',
    tone: 'stop',
    hint: '반품 처리 중입니다. 확인 후 환불해 드립니다.',
  },
  failed: {
    label: '결제실패',
    tone: 'stop',
    hint: '결제가 완료되지 않았습니다. 다시 주문해 주세요.',
  },
};

export function statusLabel(status: string): string {
  return ORDER_STATUS_META[status as OrderStatus]?.label ?? status;
}

export function statusHint(status: string): string {
  return ORDER_STATUS_META[status as OrderStatus]?.hint ?? '';
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** 관리자 목록의 상태 탭 순서 */
export const STATUS_TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  ...ORDER_STATUSES.map((status) => ({
    key: status,
    label: ORDER_STATUS_META[status].label,
  })),
];

/** 아직 출고되지 않은 상태 — 배송지 수정과 손님의 취소 요청이 가능한 구간 */
export const BEFORE_SHIPPING: OrderStatus[] = ['pending_payment', 'paid', 'preparing'];

/** 손님이 직접 취소를 요청할 수 있는 상태 */
export const CANCELABLE_BY_CUSTOMER: OrderStatus[] = ['pending_payment', 'paid'];

export function canEditAddress(status: string): boolean {
  return BEFORE_SHIPPING.includes(status as OrderStatus);
}

export function canRequestCancel(status: string): boolean {
  return CANCELABLE_BY_CUSTOMER.includes(status as OrderStatus);
}

/** 취소·반품처럼 재고를 되돌려야 하는 상태인지 */
export function isStockReleasing(status: string): boolean {
  return status === 'cancelled' || status === 'returned';
}

/** 미출고 = 결제완료 + 상품준비중. 사장님이 매일 확인하는 숫자입니다. */
export const UNSHIPPED_STATUSES: OrderStatus[] = ['paid', 'preparing'];

/** 관리자 뱃지 색 */
/**
 * 관리자 목록의 상태 뱃지 색.
 * ★ 라이트·다크 양쪽에서 대비가 확보되도록 다크에서의 색은
 *   app/globals.css 의 .dark .admin-root 규칙이 다시 칠합니다.
 */
export function statusBadgeClass(status: string): string {
  switch (ORDER_STATUS_META[status as OrderStatus]?.tone) {
    case 'wait':
    case 'ship':
      return 'bg-amber-100 text-amber-800';
    case 'go':
      return 'bg-blue-100 text-blue-800';
    case 'done':
      return 'bg-green-100 text-green-800';
    case 'stop':
      return 'bg-red-100 text-red-700';
    case 'prep':
    default:
      return 'bg-slate-100 text-slate-700';
  }
}
