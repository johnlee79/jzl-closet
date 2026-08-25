'use client';

import { isLeaving } from '@/lib/leaving';

/**
 * ============================================================
 * ★★ 화면 오류를 남기고, 서버로도 한 줄 보냅니다 (2026-08-25)
 * ============================================================
 *
 * ★★ 왜 서버로도 보내는가
 *   브라우저 콘솔은 우리가 볼 수 없습니다. 특히 아이폰은 맥이 있어야
 *   들여다볼 수 있어 사실상 길이 막혀 있습니다. 아이폰에서만 나는 문제를
 *   쫓으려면 브라우저가 우리에게 알려 주는 수밖에 없습니다.
 *   받는 쪽은 app/api/client-error/route.ts 이고, Vercel 함수 로그에 남습니다.
 *
 * ★★ app/error.tsx 와 app/global-error.tsx 가 같이 씁니다.
 *   같은 코드를 두 벌 두면 반드시 한쪽만 고쳐집니다. 여기 한 곳에 둡니다.
 *
 * ★★ 무슨 일이 있어도 조용히 끝나야 합니다.
 *   오류를 보고하다 또 오류를 내면 손님 화면이 두 번 무너집니다.
 */

/** 서버로 보낼 때 각 항목을 이 길이까지만 담습니다. (받는 쪽에서도 한 번 더 자릅니다) */
const MAX = { message: 400, digest: 80, href: 400, agent: 400, stack: 2000 };

function cut(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.slice(0, max);
}

/**
 * @param error 오류 경계가 받은 값
 * @param where 어느 경계인지. 로그에서 구분하려고 붙입니다.
 */
export function reportUiError(
  error: (Error & { digest?: string }) | undefined,
  where: string
): void {
  const href = typeof window !== 'undefined' ? window.location.href : '';
  const agent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const leaving = isLeaving();

  /*
   * ★ 브라우저 콘솔 — 개발자도구를 볼 수 있는 자리에서는 이게 제일 빠릅니다.
   * ★ 떠나는 중이면 고장이 아니므로 warn 으로, 그 밖에는 error 로 남깁니다.
   */
  const line = [
    `message: ${error?.message ?? ''} |`,
    `digest: ${error?.digest ?? '없음'} |`,
    `주소: ${href} |`,
    `userAgent: ${agent}`,
  ];

  if (leaving) {
    console.warn(`[ui] 화면을 떠나는 중에 끊겼습니다 (고장 아님) — ${where} —`, ...line);
  } else {
    console.error(`[ui] 화면 오류 — ${where} —`, ...line);
  }

  /*
   * ★ 서버로 한 줄 보냅니다.
   * ★ keepalive — 화면이 떠나는 중에도 끝까지 보내집니다. 이게 없으면
   *   정작 알고 싶은 "떠나면서 난 오류" 가 전송 도중에 잘려 사라집니다.
   * ★ .catch — 보내기가 실패해도 아무 일이 없어야 합니다.
   */
  try {
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: cut(error?.message, MAX.message),
        digest: cut(error?.digest, MAX.digest),
        // ★★ 어느 코드가 터졌는지는 여기 있습니다. 이것 때문에 만든 길입니다.
        stack: cut(error?.stack, MAX.stack),
        href: cut(href, MAX.href),
        agent: cut(agent, MAX.agent),
        where,
        leaving,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* fetch 자체를 못 부르는 환경입니다. 화면은 그대로 그려져야 하므로 넘어갑니다. */
  }
}
