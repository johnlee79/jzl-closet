import { NextResponse, type NextRequest } from 'next/server';
import { runAutoCancel } from '@/lib/auto-cancel';

/**
 * 입금대기 자동취소 — 정기 실행 입구.
 *
 * ★★ vercel.json 의 cron 주기 (2026-08-15 현재 하루 1회)
 *   Hobby 플랜은 크론을 하루 1회만 허용합니다. `*\/10 * * * *` 로 두면
 *   배포 자체가 거부됩니다. 그래서 `0 19 * * *` (UTC 19시 = 한국시간 새벽 4시)로 두었습니다.
 *   ▶ Pro 로 전환한 뒤 vercel.json 의 schedule 을 `*\/10 * * * *` 로 되돌리세요.
 *     (vercel.json 은 주석을 넣을 수 없는 엄격한 JSON 이라 이 메모를 여기에 둡니다)
 *
 *   하루 1회여도 큰 문제는 없습니다. 관리자가 주문 목록·대시보드에 들어올 때마다
 *   기한이 지난 건을 정리하므로(lib/auto-cancel.ts), 실제로는 그쪽이 먼저 처리합니다.
 *   다만 관리자가 하루 종일 안 들어오면 그만큼 취소가 늦어집니다.
 *
 * ★ 부르는 쪽은 둘 중 아무거나 됩니다.
 *
 *   1) Vercel Cron (권장 · 설정이 가장 간단합니다)
 *      vercel.json 에 이미 넣어 두었습니다.
 *      Vercel 이 보내는 Authorization: Bearer <CRON_SECRET> 을 확인합니다.
 *
 *   2) Supabase pg_cron + pg_net
 *      select cron.schedule(
 *        'jzl-auto-cancel', '*\/10 * * * *',
 *        $$ select net.http_post(
 *             url     := 'https://<사이트주소>/api/cron/auto-cancel',
 *             headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET 값>')
 *           ); $$
 *      );
 *
 * ★ 아무나 부르지 못하게 CRON_SECRET 으로 막습니다.
 *   .env.local 과 Vercel 환경변수에 같은 값을 넣어 주세요.
 *   값을 넣지 않으면 이 입구는 아예 열리지 않습니다. (관리자 화면 진입 시 정리는 그대로 동작합니다)
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
    const result = await runAutoCancel(true);
    return NextResponse.json(
      {
        ok: true,
        cancelled: result.cancelled.length,
        // 송장이 있거나 자동취소 제외로 남겨 둔 건수
        skipped: result.skipped,
        orderNos: result.cancelled.map((order) => order.orderNo),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '자동취소에 실패했습니다.';
    console.error('[cron/auto-cancel]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** pg_net 은 POST 를 쓰는 편이 편합니다. 같은 동작으로 받아 줍니다. */
export const POST = GET;
