import { type NextRequest, NextResponse } from 'next/server';
import { getOrderByNo } from '@/lib/orders';
import { verifyOrderToken } from '@/lib/order-token';
import { ksnetResultUrl } from '@/lib/payments/ksnet/result-url';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * ============================================================
 * 결제 결과 확인 — 바깥 창이 스스로 물어보는 창구
 * ============================================================
 *
 * GET /api/payment/ksnet/status?no=ORD-...&k=<주문 토큰>
 *
 * ★★ 왜 필요한가
 *   PC 결제는 우리 페이지 위에 띄운 아이프레임 안에서 돕니다.
 *   결제가 끝나면 그 프레임이 바깥 창에 "결과 화면으로 가라" 고 알립니다.
 *   그 신호 하나에만 기대면, 브라우저가 그 길을 막는 순간 손님이
 *   중간 화면에 갇혀 새로고침해야 합니다. 실제로 그러고 있었습니다.
 *
 *   그래서 바깥 창이 스스로도 확인합니다. 신호가 오면 그것으로 끝나고,
 *   안 오면 이쪽이 몇 초 뒤 같은 결론에 이릅니다. 길이 둘이면 하나가 막혀도 됩니다.
 *
 * ★★ 주문번호만으로는 열리지 않습니다.
 *   주문번호는 ORD-20260824-0001 처럼 규칙적이라 추측할 수 있습니다.
 *   주문 직후 발급한 서명(k)이 맞아야 답합니다. 완료 화면과 같은 기준입니다.
 *
 * ★ 돌려주는 것은 "끝났는지" 와 "어디로 가면 되는지" 뿐입니다.
 *   금액·이름·연락처는 내보내지 않습니다. 필요하지 않습니다.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  /*
   * ★ 서명이 있어야 열리지만, 그래도 횟수를 제한합니다.
   *   바깥 창이 몇 초에 한 번 부르는 창구라 넉넉하게 둡니다.
   */
  const limited = rateLimit(`ksnet-status:${clientIp(request.headers)}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: '확인 요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    );
  }

  const orderNo = (request.nextUrl.searchParams.get('no') ?? '').trim();
  const token = (request.nextUrl.searchParams.get('k') ?? '').trim();

  if (!orderNo || !token || !(await verifyOrderToken(orderNo, token))) {
    return NextResponse.json({ error: '확인할 수 없습니다.' }, { status: 404 });
  }

  const order = await getOrderByNo(orderNo);
  if (!order) {
    return NextResponse.json({ error: '확인할 수 없습니다.' }, { status: 404 });
  }

  /*
   * ★ 결제대기면 아직입니다. 그 밖의 상태는 결론이 난 것이라
   *   그 상태에 맞는 화면으로 보냅니다. (완료 · 확인 중 · 실패)
   */
  const done = order.status !== 'pending_payment';

  return NextResponse.json(
    {
      status: order.status,
      done,
      url: done ? await ksnetResultUrl(order.status, orderNo) : null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
