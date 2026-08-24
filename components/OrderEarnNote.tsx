'use client';

import { useSite } from '@/components/SiteProvider';
import { isEarnPending } from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import { EARN_PAYOUT_NOTE, expectedPurchasePoints } from '@/lib/site-config';
import type { Order } from '@/lib/types';

/**
 * 이 주문으로 쌓일 적립 포인트.
 *
 * ★★ 왜 필요했나
 *   사기 전(상품·장바구니·주문서)에는 "적립 예정" 을 보여 주면서, 정작 주문한 뒤
 *   배송완료를 기다리는 동안에는 얼마가 쌓일지 볼 수 없었습니다.
 *   기다리는 쪽이 궁금한 시점입니다.
 *
 * ★★ 아무 주문에나 보여 주면 거짓말이 됩니다. 세 가지를 먼저 봅니다.
 *   1) 비회원 주문 — 적립이 아예 없습니다. (lib/orders.ts 가 userId 가 있을 때만 지급)
 *   2) 이미 지급된 주문 — 배송완료·구매확정에서 나갑니다. "예정" 이 아닙니다.
 *   3) 취소·반품·결제실패 — 적립이 없습니다.
 *
 * ★ 금액은 화면에서 계산합니다. 조회를 늘리지 않습니다.
 *   기준은 서버가 지급할 때 쓰는 것과 같습니다 —
 *   살아 있는 상품금액 합계에서 사용한 포인트를 뺀 값. (배송비는 빼고 셉니다)
 *   ※ 지급 자체는 건드리지 않았습니다. 여기서는 같은 식으로 보여 주기만 합니다.
 */
export default function OrderEarnNote({
  order,
  className = '',
}: {
  order: Order;
  className?: string;
}) {
  const { points } = useSite();

  // 비회원 주문에는 적립이 없습니다.
  if (!order.userId) return null;

  /*
   * ★★ 이미 지급이 끝난 주문은 "예정" 이 아니라 "적립되었습니다" 라고 말합니다.
   *   예전에는 지급된 뒤에 이 자리가 통째로 사라졌습니다. 손님 입장에서는
   *   기다리던 포인트가 들어왔는지 어디서도 확인할 수 없었습니다.
   *
   * ★ 금액은 다시 계산하지 않고 주문에 적힌 실제 지급액을 그대로 씁니다.
   *   그 사이 적립률이 바뀌었으면 다시 계산한 값은 실제와 달라집니다.
   */
  if (order.pointsEarned > 0) {
    return (
      <p className={`text-[15px] leading-relaxed text-wine ${className}`}>
        <strong className="whitespace-nowrap font-semibold">
          {formatPrice(order.pointsEarned)}P
        </strong>
        {' 가 적립되었습니다.'}
      </p>
    );
  }

  if (!isEarnPending(order.status)) return null;

  const base = Math.max(
    0,
    order.items
      .filter((item) => item.itemStatus !== 'cancelled')
      .reduce((sum, item) => sum + item.lineTotal, 0) - order.discount
  );
  const amount = expectedPurchasePoints(base, points);
  if (amount <= 0) return null;

  return (
    <p className={`text-[15px] leading-relaxed text-wine ${className}`}>
      적립 예정{' '}
      <strong className="whitespace-nowrap font-semibold">
        {formatPrice(amount)}P
      </strong>
      <span className="mt-0.5 block text-[13px] text-muted">{EARN_PAYOUT_NOTE}</span>
    </p>
  );
}
