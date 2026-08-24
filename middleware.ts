import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  isAdminEmail,
  isAdminEmailConfigured,
  verifySessionToken,
} from '@/lib/admin-auth';

/**
 * 두 가지 일을 합니다.
 *   1) /admin/* 을 관리자 쿠키로 보호합니다. (로그인 화면은 예외)
 *   2) 회원 세션 토큰을 갱신하고 /mypage/* 를 보호합니다.
 *
 * Edge 런타임에서 돌아가므로 Node 전용 모듈을 쓰지 않습니다.
 */
export const config = {
  matcher: [
    '/admin/:path*',
    '/mypage/:path*',
    '/login',
    '/signup',
    '/checkout/:path*',
    '/inquiry/:path*',
    '/reset-password/:path*',
  ],
};

/** 로그인해야 들어갈 수 있는 회원 전용 구간 */
function isMemberOnly(pathname: string): boolean {
  return pathname === '/mypage' || pathname.startsWith('/mypage/');
}

/** 이미 로그인했으면 갈 필요가 없는 화면 */
function isGuestOnly(pathname: string): boolean {
  return pathname === '/login' || pathname === '/signup';
}

/**
 * Supabase 로 로그인한 사람이 관리자 이메일인지. (2단계)
 *
 * ★ 여기서는 쿠키를 갱신하지 않습니다. 읽기만 합니다.
 *   관리자 화면은 손님 화면 갱신 흐름(아래 2번)을 타지 않으므로,
 *   토큰 갱신은 손님 쪽에서 하던 대로 그쪽에 맡깁니다.
 *   여기서 갱신까지 하려 들면 응답 쿠키를 만들어 돌려줘야 하는데,
 *   통과할 때는 NextResponse.next() 를 그대로 쓰는 편이 단순합니다.
 *
 * ★ getUser() 를 씁니다. 쿠키에 든 토큰을 그대로 믿는 getSession() 이 아닙니다.
 *   관리자 문에서 쿠키만 믿으면 안 됩니다.
 *
 * ★ 목록이 비어 있으면 Supabase 에 물어보지도 않습니다.
 *   아직 이메일 로그인을 쓰지 않는 동안 쓸데없는 왕복을 만들지 않습니다.
 */
async function isAdminBySupabaseSession(request: NextRequest): Promise<boolean> {
  if (!isAdminEmailConfigured()) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set() {
          /* 읽기만 합니다. */
        },
        remove() {
          /* 읽기만 합니다. */
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return false;
    return isAdminEmail(data.user.email);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /* ── 1. 관리자 ─────────────────────────────────────────── */
  if (pathname.startsWith('/admin')) {
    // ★ 로그인 화면 자체는 막지 않습니다. (막으면 무한 리다이렉트가 됩니다)
    if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
      return NextResponse.next();
    }

    /*
     * ★★ 두 가지 길을 모두 인정합니다. (전환 중)
     *   1) 옛 길 — 비밀번호 하나로 받은 서명 쿠키
     *   2) 새 길 — Supabase 로그인 + 이메일이 ADMIN_EMAILS 목록에 있음
     *   옛 길은 4단계에서 지웁니다.
     *
     * ★ 옛 쿠키를 먼저 봅니다. 계산만 하면 되어 즉시 끝납니다.
     *   Supabase 확인은 Supabase 서버까지 왕복이 있습니다.
     *   옛 길로 들어와 있는 동안에는 그 왕복이 아예 일어나지 않습니다.
     */
    if (await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value)) {
      return NextResponse.next();
    }
    if (await isAdminBySupabaseSession(request)) {
      return NextResponse.next();
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    loginUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(loginUrl);
  }

  /* ── 2. 회원 세션 ──────────────────────────────────────── */
  const response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // 환경변수가 없으면 로그인 기능 자체가 없는 상태입니다. 그냥 통과시킵니다.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        // 요청과 응답 양쪽에 반영해야 이번 요청에서도 새 토큰이 쓰입니다.
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response.cookies.set({ name, value: '', ...options, maxAge: 0 });
      },
    },
  });

  let userId: string | null = null;
  try {
    // 여기서 토큰이 만료됐으면 자동으로 갱신되고 위 set() 이 쿠키를 갈아 끼웁니다.
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  if (isMemberOnly(pathname) && !userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (isGuestOnly(pathname) && userId) {
    const mypageUrl = request.nextUrl.clone();
    mypageUrl.pathname = '/mypage';
    mypageUrl.search = '';
    return NextResponse.redirect(mypageUrl);
  }

  return response;
}
