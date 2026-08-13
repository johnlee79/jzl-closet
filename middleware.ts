import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';

/**
 * /admin/* 전체를 보호합니다. 로그인 화면과 로그인 API 는 예외입니다.
 * Edge 런타임에서 돌아가므로 Web Crypto 만 사용하는 lib/admin-auth 를 씁니다.
 */
export const config = {
  matcher: ['/admin/:path*'],
};

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ★ 로그인 화면 자체는 막지 않습니다. (막으면 무한 리다이렉트가 됩니다)
  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(loginUrl);
}
