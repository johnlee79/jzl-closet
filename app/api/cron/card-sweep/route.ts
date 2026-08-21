import { NextResponse, type NextRequest } from 'next/server';
import { runCardSweep } from '@/lib/card-sweep';

/**
 * 결제대기 카드 주문 정리 — 정기 실행 입구 (4-B).
 *
 * ★★ 왜 자동취소와 따로 두는가
 *   무통장입금 자동취소(/api/cron/auto-cancel)는 지금 잘 돌고 있고,
 *   하루 한 번(UTC 19시 = 한국 새벽 4시)이면 충분합니다.
 *   카드는 다릅니다. 결제창을 닫는 순간부터 재고가 묶이므로 자주 봐야 합니다.
 *
 *   두 일을 한 입구에 합치면 주기를 바꿀 때마다 다른 쪽 동작이 함께 바뀝니다.
 *   무통장입금 쪽을 건드리지 않기 위해 입구와 주기를 완전히 갈라 둡니다.
 *   (vercel.json 에 cron 이 두 개인 이유입니다)
 *
 * ★ 이 입구가 하는 일은 "정리" 가 아니라 "확인" 입니다.
 *   오래된 결제대기 카드 주문을 KSNET 에 다시 물어보고,
 *   승인이 났으면 결제완료로, 안 났으면 결제실패로, 모르겠으면 그대로 둡니다.
 *   판단은 전부 lib/card-sweep.ts 에 있습니다.
 *
 * ★ 아무나 부르지 못하게 CRON_SECRET 으로 막습니다.
 *   자동취소 입구와 같은 값을 씁니다. 값을 넣지 않으면 이 입구는 열리지 않습니다.
 *   (관리자 화면에 들어올 때의 정리는 그대로 동작합니다)
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  // ★ 비밀값을 정하지 않았으면 열어 두지 않습니다.
  if (!secret) return false;

  const bearer = request.headers.get('authorization')?.trim();
  if (bearer === `Bearer ${secret}`) return true;

  // pg_net 처럼 Authorization 을 쓰기 번거로운 곳을 위해 헤더 하나를 더 받습니다.
  return request.headers.get('x-cron-secret')?.trim() === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCardSweep(true);
    return NextResponse.json(
      {
        ok: true,
        checked: result.checked,
        /** 승인이 확인되어 결제완료로 되살린 주문 */
        recovered: result.recovered.map((order) => order.orderNo),
        /** 미승인으로 확인되어 결제실패로 바꾼 주문 (재고를 되돌렸습니다) */
        failed: result.failed.map((order) => order.orderNo),
        /** 조회에 실패해 그대로 둔 주문 — 사람이 확인해야 합니다 */
        needsReview: result.needsReview.map((order) => order.orderNo),
        skipped: result.skipped,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '카드 주문 정리에 실패했습니다.';
    console.error('[cron/card-sweep]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** pg_net 은 POST 를 쓰는 편이 편합니다. 같은 동작으로 받아 줍니다. */
export const POST = GET;
