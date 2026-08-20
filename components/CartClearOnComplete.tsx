'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '@/lib/cart';
import { clearDraft } from '@/lib/checkout-draft';

/**
 * 주문 완료 화면에서 장바구니를 비웁니다.
 *
 * ★ 왜 여기서 비우는가 (4-A)
 *   무통장입금은 주문서에서 저장이 끝나는 순간 완료라 그때 비우면 됩니다.
 *   카드결제는 다릅니다. 주문을 저장한 뒤에도 결제창에서 취소하거나
 *   카드가 거절될 수 있습니다. 그때 장바구니가 비어 있으면 손님이
 *   상품을 처음부터 다시 담아야 합니다. 그래서 결제가 실제로 끝난
 *   이 화면에 도착했을 때 비웁니다.
 *
 * ★ 화면에 아무것도 그리지 않습니다.
 * ★ 두 번 실행되어도 문제없습니다. (이미 비어 있으면 그대로입니다)
 */
export default function CartClearOnComplete() {
  const { clear } = useCart();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    clear();
    clearDraft();
  }, [clear]);

  return null;
}
