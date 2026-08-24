import 'server-only';

import { createOrderToken } from '@/lib/order-token';
import { SITE_URL } from '@/lib/store';

/**
 * 주문 상태에 맞는 결과 화면 주소.
 *
 * ★★ 손님에게 보이는 말이 상태와 어긋나면 안 됩니다.
 *   확인 중인 주문에 "완료" 라고 하면 발송을 기다리게 되고,
 *   승인이 났을 수 있는 주문에 "실패" 라고 하면 이중결제를 부릅니다.
 *
 * ★ 결제창 응답(return 라우트)과 바깥 창의 상태 확인(status 라우트)이
 *   같은 함수를 씁니다. 두 벌로 두면 한쪽만 고쳐 서로 다른 곳으로 보내게 됩니다.
 */
export async function ksnetResultUrl(status: string, orderNo: string): Promise<string> {
  const encoded = encodeURIComponent(orderNo);

  // 사람이 확인해야 하는 상태 — "확인 중" 으로만 안내합니다.
  if (status === 'payment_review' || status === 'payment_unconfirmed') {
    return `${SITE_URL}/checkout/pending?no=${encoded}`;
  }

  // 돈이 오가지 않은 것이 확실한 상태
  if (status === 'failed') {
    return `${SITE_URL}/checkout/failed?no=${encoded}&reason=declined`;
  }
  if (status === 'cancelled' || status === 'cancel_requested') {
    return `${SITE_URL}/checkout/failed?no=${encoded}&reason=cancelled`;
  }

  // 결제완료 이후(준비중·배송중…)는 완료 화면으로 보냅니다.
  const token = await createOrderToken(orderNo);
  const query = new URLSearchParams({ no: orderNo, k: token });
  return `${SITE_URL}/checkout/complete?${query.toString()}`;
}
