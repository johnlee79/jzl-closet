import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_AUTH_COOKIE, ADMIN_COOKIE, isAdminEmail, isAdminEmailConfigured, verifySessionToken } from '@/lib/admin-auth';
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
 * ★★★ 갱신된 쿠키를 반드시 저장합니다 — 되돌리지 마세요 (2026-08-26)
 *
 *   전에는 여기 set()·remove() 가 빈 함수였고, 주석에 "읽기만 합니다" 라고
 *   적혀 있었습니다. 그게 관리자가 자꾸 로그아웃되던 원인이었습니다.
 *
 *   getUser() 는 액세스 토큰이 만료됐으면 **리프레시 토큰을 써서 갱신**합니다.
 *   Supabase 리프레시 토큰은 한 번 쓰면 새 것으로 바뀝니다.
 *   그런데 set() 이 비어 있어 새 토큰이 어디에도 저장되지 않았습니다.
 *   → 브라우저에는 **이미 써 버린 옛 토큰**이 남고, 다음 요청에서 갱신이
 *     실패합니다. 그대로 로그아웃입니다.
 *
 *   상품 등록 화면에 오래 머무는 것이 정확히 이 조건입니다. 한 시간 넘게
 *   아무 요청도 안 하다가 [저장]을 누르는 순간 만료된 토큰으로 처음
 *   말을 겁니다.
 *
 *   ★ 손님 경로(아래 2번)는 처음부터 올바르게 하고 있었습니다.
 *     같은 방식 그대로 맞췄습니다 — 요청과 응답 양쪽에 씁니다.
 *
 * ★ getUser() 를 씁니다. 쿠키에 든 토큰을 그대로 믿는 getSession() 이 아닙니다.
 *   관리자 문에서 쿠키만 믿으면 안 됩니다.
 *
 * ★ 목록이 비어 있으면 Supabase 에 물어보지도 않습니다.
 *   아직 이메일 로그인을 쓰지 않는 동안 쓸데없는 왕복을 만들지 않습니다.
 *
 * @param response 갱신된 쿠키를 실어 보낼 응답. 부르는 쪽이 이것을 돌려줘야 합니다.
 */
async function isAdminBySupabaseSession(
  request: NextRequest,
  response: NextResponse,
  pathname: string
): Promise<boolean> {
  if (!isAdminEmailConfigured()) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  try {
    const supabase = createServerClient(url, anonKey, {
      /*
       * ★★ 관리자는 손님과 다른 쿠키 칸을 씁니다 (2026-08-26)
       *   전에는 한 칸을 같이 써서, 관리자로 들어와 있다가 손님 화면에서
       *   구글 카카오 로그인을 누르면 관리자 세션이 덮어써졌습니다.
       *   이름의 뜻과 되돌리는 법은 lib/admin-auth.ts 에 적어 두었습니다.
       */
      cookieOptions: { name: ADMIN_AUTH_COOKIE },
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

    const { data, error } = await supabase.auth.getUser();

    /*
     * ============================================================
     * ★★ 조용히 false 를 돌려주지 않습니다 (2026-08-26)
     * ============================================================
     *
     * 전에는 `if (error || !data.user) return false;` 한 줄이었습니다.
     * 관리자가 왜 튕겼는지 아무 데도 남지 않았습니다.
     *
     * ★★ error 만 봐서는 안 됩니다. 회원 뱃지에서 배운 것입니다.
     *   그때 없는 표를 조회하니 HTTP 204 에 **error 는 null** 이었습니다.
     *   그래서 "값이 비었는데 오류도 없는" 경우를 따로 봅니다.
     *   그것이 가장 위험한 경우입니다 — 아무 흔적 없이 튕깁니다.
     *
     * ★ "그냥 로그인 안 함" 은 남기지 않습니다. 관리자 주소를 모르고
     *   들어온 사람에게도 찍히면 진짜 문제가 묻힙니다.
     */
    if (error && !isJustLoggedOut(error)) {
      console.warn(
        `[auth] 관리자 세션 확인 실패 (${pathname}): ${error.message || '(오류 메시지 없음)'}`
      );
      return false;
    }
    if (!data.user) {
      if (!error) {
        console.warn(
          `[auth] 관리자 세션이 비었는데 오류도 없습니다 (${pathname}). ` +
            'Supabase 응답이 비어 온 경우입니다. 자주 보이면 알려 주세요.'
        );
      }
      return false;
    }
    /*
     * ============================================================
     * ** 여기가 마지막 남은 조용한 구멍이었습니다 (2026-08-26)
     * ============================================================
     *
     * ** 로그인은 돼 있는데 관리자 이메일이 아닌 경우입니다.
     *   data.user 는 있고 error 도 없어서 위 두 로그를 둘 다 비껴갑니다.
     *   전에는 이 줄 하나뿐이라 아무 흔적 없이 튕겼습니다.
     *
     * ** 세션을 나눈 뒤에도 이 로그는 남겨 둡니다.
     *   덮어쓰기는 없어졌지만, 만료 갱신 실패 다른 이유로 관리자가
     *   튕기는 일은 또 생깁니다. 그때 왜 튕겼는지 남는 곳이 여기뿐입니다.
     *
     * * 이메일은 남기지 않습니다. id 앞 8자리만 남깁니다.
     *   어느 계정인지 대조는 되어야 하고, 남의 이메일이 로그에 쌓이면 안 됩니다.
     */
    if (!isAdminEmail(data.user.email)) {
      console.warn(
        `[auth] 관리자 아닌 계정으로 관리자 주소에 들어왔습니다 (${pathname}). ` +
          `(id ${data.user.id.slice(0, 8)})`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn(
      `[auth] 관리자 세션 확인 중 오류 (${pathname}):`,
      error instanceof Error ? error.message : String(error)
    );
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

    /*
     * ★★ 갱신된 세션 쿠키를 담을 응답을 먼저 만듭니다. (2026-08-26)
     *   아래 확인 중에 토큰이 갱신되면 이 응답에 새 쿠키가 실립니다.
     *   통과할 때도 튕길 때도 **이 응답을 돌려줘야** 새 토큰이 저장됩니다.
     *   전에는 NextResponse.next() 를 새로 만들어 돌려줘서 매번 버렸습니다.
     */
    const adminResponse = NextResponse.next({ request: { headers: request.headers } });

    if (await isAdminBySupabaseSession(request, adminResponse, pathname)) {
      return adminResponse;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    loginUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    // ★ 튕길 때도 갱신된 쿠키를 실어 보냅니다. (손님 경로와 같은 방식)
    return redirectKeepingCookies(adminResponse, loginUrl);
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
