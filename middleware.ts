import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  isAdminEmail,
  isAdminEmailConfigured,
  verifySessionToken,
} from '@/lib/admin-auth';
import { isActiveMember, isJustLoggedOut } from '@/lib/member-session';

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
 * ============================================================
 * ★★ 리다이렉트할 때도 갱신된 세션 쿠키를 반드시 실어 보냅니다 (2026-08-25)
 * ============================================================
 *
 * 전에는 그냥 NextResponse.redirect() 로 새 응답을 만들어 돌려줬습니다.
 * 그러면 아래에서 갱신해 넣어 둔 새 토큰이 통째로 버려집니다.
 *
 * Supabase 리프레시 토큰은 한 번 쓰면 새 것으로 바뀝니다. 새 것을 안 실으면
 * 브라우저에는 이미 써 버린 옛 토큰이 남고, 다음 갱신이 실패합니다.
 * 즉 이 리다이렉트를 한 번 지날 때마다 세션이 죽을 수 있었습니다.
 * "가만히 있었는데 로그인이 풀린다" 의 원인 중 하나입니다.
 */
function redirectKeepingCookies(response: NextResponse, url: URL): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

/**
 * 로그인 뒤 돌아갈 곳.
 *
 * ★★ 전에는 next 를 통째로 지웠습니다. (mypageUrl.search = '')
 *   그래서 주문 내역을 보려다 로그인한 손님이 늘 마이페이지 첫 화면으로
 *   떨어졌습니다. 원래 가려던 곳으로 보내 드립니다.
 *
 * ★ 우리 사이트 안쪽 주소만 받습니다. 남의 사이트로 튕겨 보낼 수 없게 막습니다.
 *   '//evil.com' 과 '/\evil.com' 은 브라우저가 바깥 주소로 읽습니다.
 * ★ 로그인·회원가입으로 되돌리면 제자리를 맴돕니다. 그때는 마이페이지로 갑니다.
 */
function safeNextPath(request: NextRequest): string {
  const raw = request.nextUrl.searchParams.get('next') ?? '';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/mypage';
  }
  const path = raw.split('?')[0];
  if (path === '/login' || path === '/signup') return '/mypage';
  return raw;
}

/**
 * ============================================================
 * ★★ 로그인 화면에서 돌려보내도 되는 사람인가 (2026-08-25)
 * ============================================================
 *
 * ★★ 왜 로그인 여부만으로는 안 되는가
 *   프로필이 없거나 조회에 실패한 계정을 마이페이지로 돌려보내면
 *   "이 계정으로는 마이페이지를 쓸 수 없습니다" 화면이 뜹니다.
 *   손님이 [로그인] 을 눌렀는데 그 화면이 나오는 것은 어떤 경우에도
 *   정상이 아닙니다. 그래서 헤더와 똑같은 기준으로 봅니다.
 *   기준 자체는 lib/member-session.ts 한 곳에만 있습니다.
 *
 * ★ 본인 행만 읽습니다. RLS 정책 profiles_select_own 이 그것만 허용합니다.
 *   그래서 service_role 키를 Edge 로 가져올 필요가 없습니다.
 *
 * ★★ 못 물어봤으면 false 입니다. 즉 돌려보내지 않고 로그인 화면을 보여 줍니다.
 *   조회가 한 번 삐끗했다고 손님을 막다른 화면으로 보내면 안 됩니다.
 *   로그인 화면은 언제 봐도 손해가 없는 화면입니다.
 */
async function isActiveMemberSession(
  supabase: SupabaseClient,
  userId: string,
  pathname: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn(
        `[auth] 프로필 상태를 확인하지 못했습니다 — user id ${userId} (${pathname}): ` +
          `${error.message}. 로그인 화면을 그대로 보여 줍니다.`
      );
      return false;
    }
    /*
     * ★★ 행이 비어 있을 때도 남깁니다.
     *   RLS 가 막아서 빈 것인지, 정말 프로필이 없는 것인지 PostgREST 는
     *   구분해 주지 않습니다. 둘 다 빈 결과입니다.
     *   운영 DB 에 profiles_select_own 정책이 빠져 있으면 로그인한 회원 전원이
     *   여기서 빈 값을 받게 되는데, 로그가 없으면 아무도 모른 채
     *   "로그인을 눌러도 로그인 화면만 뜬다" 가 됩니다. (막히지는 않습니다)
     *   이 줄이 그 상황을 즉시 드러냅니다.
     */
    if (!data) {
      console.warn(
        `[auth] 프로필 행이 비어 있습니다 — user id ${userId} (${pathname}). ` +
          '로그인 화면을 그대로 보여 줍니다. ' +
          '로그인한 회원 전원에게 이 로그가 찍힌다면 profiles 의 RLS 정책을 확인하세요.'
      );
      return false;
    }
    return isActiveMember(data as { status: string });
  } catch (error) {
    console.warn(
      `[auth] 프로필 상태 확인 중 오류 — user id ${userId} (${pathname}):`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
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
    const { data, error } = await supabase.auth.getUser();

    /*
     * ★★ 전에는 error 를 읽지도 않았습니다 (2026-08-25)
     *   토큰 갱신이 실패한 것과 그냥 로그인을 안 한 것이 똑같이 "비로그인" 이
     *   되어, 손님이 왜 튕겼는지 아무 데도 남지 않았습니다.
     *
     * ★ 비로그인은 남기지 않습니다. 그것까지 찍으면 진짜 문제가 묻힙니다.
     */
    if (error && !isJustLoggedOut(error)) {
      console.warn(`[auth] 세션 확인 실패 (${pathname}):`, error.message);
    }
    userId = data.user?.id ?? null;
  } catch (error) {
    console.warn(
      `[auth] 미들웨어에서 세션을 확인하지 못했습니다 (${pathname}):`,
      error instanceof Error ? error.message : String(error)
    );
    userId = null;
  }

  /*
   * ★★ 여기는 기준을 바꾸지 않습니다 — 로그인조차 안 한 사람만 막습니다.
   *
   *   프로필이 없는 계정까지 여기서 /login 으로 돌려보내면, 그 손님은
   *   로그인에 성공해도 다시 /login 으로 밀려납니다. 빠져나갈 길이 없습니다.
   *   지금처럼 들여보내면 화면(MemberOnlyNotice)이 사실을 말하고
   *   로그아웃 버튼을 줍니다. 그게 유일한 탈출구입니다.
   *
   *   ★ 아래 isGuestOnly 와 기준이 다른 것은 일부러입니다. 질문이 다릅니다.
   *       여기      — "회원 전용 화면에서 막아야 하나?"   → 비로그인만 막는다
   *       isGuestOnly — "로그인 화면에서 돌려보내도 되나?" → 완전한 회원만 보낸다
   */
  if (isMemberOnly(pathname) && !userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return redirectKeepingCookies(response, loginUrl);
  }

  if (isGuestOnly(pathname) && userId) {
    // 로그인만으로는 돌려보내지 않습니다. 헤더와 같은 기준으로 봅니다.
    if (await isActiveMemberSession(supabase, userId, pathname)) {
      const target = new URL(safeNextPath(request), request.nextUrl.origin);
      return redirectKeepingCookies(response, target);
    }
    // 회원이 아니거나 확인에 실패했습니다. 로그인 화면을 그대로 보여 줍니다.
  }

  return response;
}
