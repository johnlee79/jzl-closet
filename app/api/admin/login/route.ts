import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  isAdminConfigured,
  verifyPassword,
} from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 로그인 — 비밀번호는 서버에서만 대조하고, 쿠키에는 서명값만 담습니다. */
export async function POST(request: Request) {
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
