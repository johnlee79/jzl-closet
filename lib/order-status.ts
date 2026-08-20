/**
 * 주문 상태 — 서버·클라이언트 공용 (순수 함수만 둡니다)
 *
 * 흐름
 *   결제대기 → 결제완료 → 상품준비중 → 배송중 → 배송완료 → 구매확정
 *   어디서든 취소요청 → 취소완료, 교환·반품으로 빠질 수 있습니다.
 *
 * ★ 4-A 에서 카드결제(KSNET)가 붙으면서 상태가 늘었습니다.
 *   payment_review      금액·주문번호가 어긋난 승인 — 절대 결제완료로 넘기지 않습니다
 *   payment_unconfirmed 승인은 났을 수 있는데 우리가 확인하지 못한 건
 *   둘 다 사람이 확인해야 하는 상태입니다. 자동으로 풀리지 않습니다.
 *
 * ★ 취소는 두 단계입니다.
 *   KSNET 이 가맹점에 취소 권한을 주지 않아 대행사를 통해 사람이 처리합니다.
 *   그래서 "요청을 접수했다" 와 "실제로 환불이 끝났다" 를 반드시 구분합니다.
 *   한 상태로 합치면 "취소했는데 돈이 안 들어온다" 는 분쟁이 반드시 납니다.
 */

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'preparing',
  'shipping',
  'delivered',
  'confirmed',
  'cancel_requested',
  'cancelled',
  'exchange',
  'returned',
  'failed',
  'payment_unconfirmed',
  'payment_review',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

type StatusMeta = {
  label: string;
  /** 관리자 목록 뱃지 색 */
  /**
   * 뱃지 색.
   *   wait  결제대기·취소요청 — 앰버
   *   go    결제완료 — 블루
   *   prep  상품준비중 — 슬레이트
   *   ship  배송중 — 앰버
   *   done  배송완료·구매확정 — 그린
   *   stop  취소·반품·실패·검토필요 — 레드
   */
  tone: 'wait' | 'go' | 'prep' | 'ship' | 'done' | 'stop';
  /** 손님에게 보여 주는 한 줄 설명 */
  hint: string;
};

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  pending_payment: {
    label: '결제대기',
    tone: 'wait',
    hint: '결제가 아직 확인되지 않았습니다. 무통장입금을 고르셨다면 안내드린 계좌로 입금해 주시면 확인 후 발송 준비를 시작합니다.',
  },
  paid: {
    label: '결제완료',
    tone: 'go',
    hint: '결제가 확인되었습니다. 곧 상품 준비를 시작합니다.',
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
  /*
   * ★ 취소요청은 "접수만 된" 상태입니다. 아직 환불되지 않았습니다.
   *   재고도 이 단계에서는 되돌리지 않습니다. 취소완료로 바꿀 때 되돌아갑니다.
   */
  cancel_requested: {
    label: '취소요청',
    tone: 'wait',
    hint: '취소 요청을 접수했습니다. 환불까지는 영업일 기준 며칠이 걸릴 수 있습니다.',
  },
  cancelled: {
    label: '취소완료',
    tone: 'stop',
    hint: '주문이 취소되었습니다. 결제하신 금액이 있다면 환불 처리되었습니다.',
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
  /*
   * ★ 아래 두 상태는 절대 자동으로 풀리지 않습니다. 사람이 확인해야 합니다.
   * ★ 손님에게 "실패했다" 고 단정해 말하지 않습니다.
   *   실제로는 승인이 났는데 우리만 모르는 상황일 수 있습니다.
   *   여기서 "실패했으니 다시 결제하세요" 라고 하면 이중결제가 납니다.
   */
  payment_unconfirmed: {
    label: '승인확인실패',
    tone: 'stop',
    hint: '결제 결과를 확인하고 있습니다. 카드 승인이 이미 났을 수 있으니 다시 결제하지 마시고 잠시만 기다려 주세요. 확인되는 대로 연락드립니다.',
  },
  payment_review: {
    label: '검토필요',
    tone: 'stop',
    hint: '결제 내역을 확인하고 있습니다. 확인되는 대로 연락드립니다.',
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

/**
 * 운영자가 반드시 손봐야 하는 상태.
 * ★ 여기 걸린 주문은 돈이 걸려 있습니다. 관리자 목록에서 눈에 띄게 표시합니다.
 */
export const NEEDS_ATTENTION: OrderStatus[] = [
  'payment_review',
  'payment_unconfirmed',
  'cancel_requested',
];

export function needsAttention(status: string): boolean {
  return NEEDS_ATTENTION.includes(status as OrderStatus);
}

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

/**
 * 결제 확인이 이미 끝난 주문인지.
 *
 * ★ 중복 승인 처리를 막는 기준입니다.
 *   결제대기(pending_payment)와 결제실패(failed)만 "아직 결제 전" 입니다.
 *   그 밖의 상태(결제완료 이후, 취소, 검토필요…)에서는 승인 결과가 또 들어와도
 *   상태를 다시 건드리지 않습니다. 재고·포인트도 다시 차감하지 않습니다.
 */
export function isPaidStatus(status: string): boolean {
  return status !== 'pending_payment' && status !== 'failed';
}

/**
 * 매출에서 빼는 상태 — 통계·대시보드·주문자 요약이 모두 이 목록 하나를 씁니다.
 *
 * ★ 예전에는 같은 목록이 세 곳에 흩어져 있었습니다.
 *   4-A 에서 상태가 늘면서 한 곳만 고치면 매출이 서로 다르게 나오게 되어 모았습니다.
 * ★ 검토필요·승인확인실패는 돈이 들어왔는지 아직 모르는 상태입니다.
 *   매출로 세면 실제보다 많아 보입니다.
 * ★ 취소요청은 아직 환불 전이라 매출로 셉니다. 취소완료가 되면 빠집니다.
 */
export const NON_SALES_STATUSES: OrderStatus[] = [
  'cancelled',
  'returned',
  'failed',
  'payment_review',
  'payment_unconfirmed',
];

export function isSalesStatus(status: string): boolean {
  return !NON_SALES_STATUSES.includes(status as OrderStatus);
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
