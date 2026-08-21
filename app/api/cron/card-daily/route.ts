import { NextResponse, type NextRequest } from 'next/server';
import { runCardDailyCheck } from '@/lib/card-sweep';

/**
 * 자정 전 마감 점검 — 정기 실행 입구 (4-B).
 *
 * ★★ 왜 자정 직전에 한 번 더 도는가
 *   KSNET 승인 재조회는 **당일에 한해** 가능합니다.
 *   23시 50분에 들어온 주문은 40분 뒤면 다음 날이라 영영 확인할 수 없게 됩니다.
 *   하루가 끝나기 전에 그날 주문을 한 번 훑어, 판정할 수 있는 것은 판정해 둡니다.
 *
 * ★ 40분이 안 지난 주문도 조회합니다. 조회는 조회일 뿐 상태를 바꾸지 않습니다.
 *   판정이 확실한 건(승인 확인·불일치·미승인)만 처리하고,
 *   아직 결제 중일 수 있는 건은 손대지 않습니다.
 *
 * ★ 여기서 하루치 요약 알림도 한 번 보냅니다.
 *   결제 Key 없이 정리된 건은 건별로 알리지 않고 이 요약에만 담습니다.
 *
 * ★★ 무통장입금 자동취소와는 완전히 별개입니다.
 *   입구도 주기도 다릅니다. 그쪽 라우트는 건드리지 않았습니다.
 *
 * ★ 아무나 부르지 못하게 CRON_SECRET 으로 막습니다. (다른 cron 과 같은 값)
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  // ★ 비밀값을 정하지 않았으면 열어 두지 않습니다.
  if (!secret) return false;

  const bearer = request.headers.get('authorization')?.trim();
  if (bearer === `Bearer ${secret}`) return true;

  return request.headers.get('x-cron-secret')?.trim() === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCardDailyCheck();
    return NextResponse.json(
      {
        ok: true,
        checked: result.checked,
        /** 승인이 확인되어 결제완료로 되살린 주문 */
        recovered: result.recovered.map((order) => order.orderNo),
        /** 승인 없음이 확인되어 결제실패로 바꾼 주문 */
        failed: result.failed.map((order) => order.orderNo),
        /** 금액·주문번호가 어긋나 검토필요로 둔 주문 */
        review: result.review.map((order) => order.orderNo),
        /** 자정이 지나 조회할 수 없게 되어 승인확인실패로 보낸 주문 */
        expired: result.expired.map((order) => order.orderNo),
        skipped: result.skipped,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '마감 점검에 실패했습니다.';
    console.error('[cron/card-daily]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** pg_net 은 POST 를 쓰는 편이 편합니다. 같은 동작으로 받아 줍니다. */
export const POST = GET;
