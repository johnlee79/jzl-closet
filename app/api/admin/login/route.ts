import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  isAdminConfigured,
  verifyPassword,
} from '@/lib/admin-auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 시도 제한 — 손님 로그인과 같은 기준입니다. (1분에 5회)
 *
 * ★★ 여기에 제한이 없었습니다.
 *   손님 로그인·회원가입·주문 조회에는 전부 있는데 관리자만 없었습니다.
 *   비밀번호 하나로 주문·회원 정보·설정 전체에 들어가는 입구라
 *   보호가 가장 두꺼워야 하는데 가장 얇았습니다.
 *
 * ★ 새로 만들지 않고 lib/rate-limit.ts 를 그대로 씁니다.
 *   손님 로그인이 쓰는 것과 같은 함수, 같은 저장소입니다.
 *   기준이 두 벌이 되면 한쪽만 고치게 됩니다.
 *
 * ★ 성공해도 카운트는 되돌리지 않습니다. 손님 로그인과 같습니다.
 *   비밀번호를 아는 사람이 1분에 다섯 번 넘게 로그인할 일은 없습니다.
 */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60_000;

/** 로그인 — 비밀번호는 서버에서만 대조하고, 쿠키에는 서명값만 담습니다. */
export async function POST(request: Request) {
  /*
   * ★ 비밀번호를 읽기 전에 겁니다.
   *   본문 파싱 뒤에 두면, 형식이 틀린 요청으로는 얼마든지 두드릴 수 있습니다.
   */
  const limited = rateLimit(
    `admin-login:${clientIp(request.headers)}`,
    LOGIN_LIMIT,
    LOGIN_WINDOW_MS
  );
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: `로그인 시도가 ${LOGIN_LIMIT}회를 넘었습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
      },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          'ADMIN_PASSWORD 가 설정되지 않았습니다. .env.local 에 값을 넣고 서버를 다시 시작해 주세요.',
      },
      { status: 500 }
    );
  }

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: '비밀번호가 맞지 않습니다.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: await createSessionToken(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

/** 로그아웃 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
