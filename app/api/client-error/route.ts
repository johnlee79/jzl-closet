import { headers } from 'next/headers';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * ============================================================
 * ★★ 손님 브라우저에서 난 오류를 서버 로그에 남깁니다 (2026-08-25)
 * ============================================================
 *
 * ★★ 왜 필요한가
 *   아이폰에서만 로그인 화면이 오류로 넘어가는 일이 있습니다.
 *   오류 내용은 손님 브라우저 콘솔에만 찍히는데, 우리는 그것을 볼 수 없습니다.
 *   아이폰은 맥이 있어야 콘솔을 들여다볼 수 있어 사실상 길이 막혀 있습니다.
 *   그래서 브라우저가 우리에게 한 줄 보내 주게 합니다. 그러면 Vercel
 *   함수 로그에 남고, 손님이 한 번 눌러 보시는 것만으로 원인을 볼 수 있습니다.
 *
 * ★★ 저장하지 않습니다. 로그로만 남깁니다.
 *   DB 를 건드리지 않습니다. 표도 만들지 않습니다. 흐르고 사라집니다.
 *
 * ★★ 로그를 채우지 못하게 두 겹으로 막습니다.
 *   ① 길이 자르기 — 아무리 긴 값을 보내도 정해진 만큼만 남깁니다
 *   ② 횟수 제한  — 같은 곳에서 1분에 다섯 번까지만 받습니다
 *   이 주소는 누구나 부를 수 있습니다. 막지 않으면 로그를 부풀려
 *   요금을 올리는 데 쓸 수 있습니다.
 *
 * ★ 무슨 일이 있어도 204 로 답합니다.
 *   오류를 보고하다 또 오류가 나면 안 됩니다. 보내는 쪽은 답을 보지도 않습니다.
 */
export const dynamic = 'force-dynamic';

/** 각 항목을 이 길이까지만 남깁니다. */
const LIMITS = {
  message: 300,
  digest: 60,
  href: 300,
  agent: 300,
  stack: 1200,
} as const;

/** 같은 곳에서 1분에 받을 최대 건수. */
const MAX_PER_MINUTE = 5;

function cut(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value : String(value ?? '');
  // 줄바꿈이 많으면 로그가 세로로 길어집니다. 한 줄로 눕혀서 남깁니다.
  const flat = text.replace(/\s*\n\s*/g, ' ⏎ ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…(잘림)` : flat;
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(headers());
    if (!rateLimit(`client-error:${ip}`, MAX_PER_MINUTE, 60_000).ok) {
      // 조용히 버리지 않고 한 줄은 남깁니다. 왜 안 들어왔는지 알아야 합니다.
      console.warn(`[ui-report] 너무 잦아 건너뜁니다 (${ip})`);
      return new Response(null, { status: 204 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    console.error(
      '[ui-report] 손님 화면 오류 —',
      `message: ${cut(body.message, LIMITS.message)} |`,
      `digest: ${cut(body.digest, LIMITS.digest) || '없음'} |`,
      `주소: ${cut(body.href, LIMITS.href)} |`,
      `userAgent: ${cut(body.agent, LIMITS.agent)} |`,
      // 어느 오류 경계인지 · 떠나는 중이었는지. 두 갈래를 로그에서 구분합니다.
      `경계: ${cut(body.where, 40) || '?'} | 떠나는중: ${body.leaving === true ? '예' : '아니오'} |`,
      // ★ 어느 코드가 터졌는지는 여기 있습니다. 이것 때문에 이 주소를 만들었습니다.
      `stack: ${cut(body.stack, LIMITS.stack) || '없음'}`
    );
  } catch {
    console.error('[ui-report] 오류 내용을 읽지 못했습니다.');
  }

  return new Response(null, { status: 204 });
}
