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
    hint: '카드 승인 내역이 확인되지 않아 주문이 마무리되지 않았습니다. 장바구니는 그대로 있으니 다시 주문하실 수 있습니다.',
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

/* ==================================================================
 * 손님에게 보여 줄 결제 안내 — ★ 이 함수 하나만 씁니다
 * ==================================================================
 *
 * ★★ 왜 따로 두는가 (4-A 에서 실제로 사고가 났습니다)
 *   주문 완료 화면은 제목을 결제수단으로 정하고, 상태 카드는 status 로 정했습니다.
 *   그 둘이 서로 다른 값을 보다 보니 한 화면에서
 *     제목  "결제가 완료되었습니다"
 *     상태  "결제대기 — 무통장입금을 고르셨다면 계좌로 입금해 주세요"
 *   가 동시에 나왔습니다. 카드로 결제한 손님이 이걸 보면 결제가 안 된 줄 압니다.
 *
 *   그래서 손님에게 나가는 결제 관련 문구는 전부 이 함수 하나에서 나옵니다.
 *   완료 화면·주문 조회·마이페이지가 같은 함수를 부르므로 서로 다른 말을 할 수 없습니다.
 *   문구를 고칠 일이 생기면 여기만 고치세요.
 *
 * ★ 두 가지 원칙
 *   1) 카드 주문에는 절대 "입금해 주세요" 라고 하지 않습니다.
 *   2) 승인 여부가 확실하지 않은 상태(승인확인실패·검토필요)를 실패로 단정하지 않습니다.
 *      손님에게는 내부 상태명 대신 "결제를 확인하고 있습니다" 로만 보여 줍니다.
 *      여기서 재결제를 유도하면 이중결제가 납니다.
 */

/** 손님 화면에서 구분하는 결제 상태 */
export type CustomerPaymentView =
  /** 결제가 끝났습니다 */
  | 'paid'
  /** 무통장입금 — 아직 입금 전 */
  | 'bank_pending'
  /** 확인 중 (카드 결제대기 · 승인확인실패 · 검토필요) */
  | 'checking'
  | 'cancelled'
  | 'failed'
  /** 배송 단계 등 그 밖의 상태 */
  | 'other';

export function customerPaymentView(
  status: string,
  paymentMethod: string
): CustomerPaymentView {
  const isBank = paymentMethod === 'bank_transfer';

  switch (status) {
    case 'pending_payment':
      /*
       * ★ 같은 '결제대기' 라도 결제수단에 따라 뜻이 다릅니다.
       *   무통장입금 — 손님이 입금할 차례입니다 (계좌를 안내해야 합니다)
       *   카드       — 우리가 승인 결과를 확인하는 중입니다 (입금 안내를 하면 안 됩니다)
       *   카드 주문이 잠깐 이 상태로 보이는 것은 승인 확인이 끝나기 전 몇 초입니다.
       */
      return isBank ? 'bank_pending' : 'checking';
    case 'payment_unconfirmed':
    case 'payment_review':
      return 'checking';
    case 'failed':
      return 'failed';
    case 'cancelled':
    case 'cancel_requested':
      return 'cancelled';
    case 'paid':
      return 'paid';
    default:
      return 'other';
  }
}

/**
 * 손님에게 보여 줄 제목과 설명.
 * ★ 완료 화면의 큰 제목과 주문 내역의 상태 카드가 이 값을 함께 씁니다.
 */
export function customerPaymentText(
  view: CustomerPaymentView,
  status: string
): { title: string; body: string } {
  switch (view) {
    case 'paid':
      return {
        title: '결제가 완료되었습니다',
        body: '곧 상품 준비를 시작하며, 출고되면 송장번호를 안내드립니다.',
      };
    case 'bank_pending':
      return {
        title: '주문이 접수되었습니다',
        body: '안내드린 계좌로 입금해 주시면 확인 후 발송 준비를 시작합니다.',
      };
    case 'checking':
      return {
        title: '결제를 확인하고 있습니다',
        body: '잠시 후 주문 조회에서 확인하실 수 있습니다.',
      };
    case 'cancelled':
      return {
        title: statusLabel(status),
        body: statusHint(status),
      };
    /*
     * ★ "결제 실패" 라고 단정해 적지 않습니다.
     *   카드 승인이 났는데 우리만 결과를 못 받은 경우가 드물게 있습니다.
     *   그때 "결제되지 않았다" 고 못 박으면 손님이 다시 결제해 이중결제가 납니다.
     *   확인된 사실(승인 내역이 확인되지 않음)만 적고, 다음 행동을 안내합니다.
     * ★ 장바구니는 비우지 않습니다. 그대로 다시 시도할 수 있습니다.
     */
    case 'failed':
      return {
        title: '결제가 완료되지 않았습니다',
        body:
          '카드 승인 내역이 확인되지 않았습니다. 장바구니는 그대로 있으니 다시 주문하실 수 있습니다. 결제하신 기억이 있는데 이 화면이 나온다면 문의해 주세요.',
      };
    default:
      return { title: statusLabel(status), body: statusHint(status) };
  }
}

/** 주문 하나를 그대로 넘겨 쓰는 짧은 형태 */
export function orderPaymentText(order: {
  status: string;
  paymentMethod: string;
}): { view: CustomerPaymentView; title: string; body: string } {
  const view = customerPaymentView(order.status, order.paymentMethod);
  return { view, ...customerPaymentText(view, order.status) };
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** 관리자 목록의 상태 탭 순서 */
/**
 * 사람이 직접 확인해야 하는 두 상태를 한 번에 거르는 값. (4-B)
 *
 * ★★ 왜 따로 두는가
 *   승인확인실패와 검토필요는 "돈이 오갔는지 우리가 모르는" 주문입니다.
 *   둘을 따로 눌러 봐야 하면 한쪽을 잊습니다. 매일 확인해야 하는 목록이라
 *   한 번에 보이게 합니다.
 * ★ 상태값이 아니라 목록이므로 주소에는 이 문자열이 그대로 들어갑니다.
 *   getOrders 가 'needs_check' 를 알아보고 두 상태를 함께 겁니다.
 */
export const NEEDS_CHECK_TAB = 'needs_check';

/** '확인 필요' 탭이 실제로 거르는 상태들 */
export const NEEDS_CHECK_STATUSES: OrderStatus[] = ['payment_unconfirmed', 'payment_review'];

export const STATUS_TABS: { key: OrderStatus | 'all' | typeof NEEDS_CHECK_TAB; label: string }[] = [
  { key: 'all', label: '전체' },
  /*
   * ★ 전체 바로 다음에 둡니다. 매일 가장 먼저 봐야 하는 목록입니다.
   */
  { key: NEEDS_CHECK_TAB, label: '확인 필요' },
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
/**
 * 이 상태가 되면 잡아 둔 재고를 손님에게서 풀어 주어야 하는지.
 *
 * ★★ 4-B 에서 failed(결제실패)가 들어왔습니다.
 *   주문을 저장하는 순간 재고를 깎으므로, 결제가 끝내 안 된 주문은
 *   재고를 돌려놓지 않으면 팔 수 있는 물건이 영영 잠깁니다.
 *   (전체 점검 1번 — 카드 결제창을 닫고 나간 주문이 재고를 물고 있던 문제)
 *
 * ★ 되돌림이 두 번 일어나지 않게 막는 것은 이 함수가 아닙니다.
 *   lib/orders.ts 의 releaseOrderStock 이 orders.stock_released_at 으로
 *   DB 수준에서 한 번만 통과시킵니다. 결제실패 → 취소완료 처럼
 *   되돌림 상태끼리 옮겨 다녀도 재고는 한 번만 돌아갑니다.
 */
export function isStockReleasing(status: string): boolean {
  return status === 'cancelled' || status === 'returned' || status === 'failed';
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
