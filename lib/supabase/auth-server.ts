import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_AUTH_COOKIE } from '@/lib/admin-auth';

/**
 * 로그인 세션을 다루는 Supabase 클라이언트.
 *
 * ANON_KEY 를 쓰고 세션은 쿠키에 담깁니다. (httpOnly)
 * 데이터 조회·저장은 지금까지처럼 service_role(lib/supabase/server.ts)로 하고,
 * 이 클라이언트는 "지금 누가 로그인했는지"와 로그인/로그아웃에만 씁니다.
 *
 * ★ 서버 컴포넌트에서는 쿠키를 쓸 수 없습니다.
 *   Next.js 가 예외를 던지므로 try/catch 로 삼킵니다.
 *   토큰 갱신은 미들웨어와 서버 액션에서 이루어집니다.
 */
function build(cookieName?: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const store = cookies();

  return createServerClient(url, anonKey, {
    /*
     * ★★ 이름을 주면 그 칸을 씁니다. 안 주면 Supabase 기본 이름입니다.
     *   라이브러리가 cookieOptions.name 을 storageKey 로 넘깁니다.
     *   (@supabase/ssr 0.12.4 — dist/main/createServerClient.js:29)
     *
     * ★ 손님은 이름을 주지 않습니다. 지금까지 쓰던 칸 그대로입니다.
     *   그래서 이 변경으로 손님이 다시 로그인할 일이 없습니다.
     */
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
    cookies: {
      get(name: string) {
        return store.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          store.set({ name, value, ...options });
        } catch (error) {
          /*
           * ★★ 조용히 넘어가지 않습니다 (2026-08-25)
           *   서버 컴포넌트에서는 쿠키를 쓸 수 없어 Next.js 가 예외를 던집니다.
           *   여기까지 왔다는 것은 "토큰이 갱신됐는데 저장하지 못했다" 는 뜻입니다.
           *   갱신된 토큰을 버리면 브라우저에는 이미 소모된 옛 토큰이 남고,
           *   다음 갱신이 실패해 손님이 로그아웃됩니다. 흔한 일은 아니지만
           *   일어나면 반드시 알아야 하는 일이라 남깁니다.
           */
          console.warn(
            `[auth] 갱신된 세션 쿠키를 저장하지 못했습니다 (서버 컴포넌트): ${name} —`,
            error instanceof Error ? error.message : String(error)
          );
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          store.set({ name, value: '', ...options, maxAge: 0 });
        } catch (error) {
          // 위와 같습니다. 로그아웃이 반쪽만 된 상태일 수 있어 남깁니다.
          console.warn(
            `[auth] 세션 쿠키를 지우지 못했습니다 (서버 컴포넌트): ${name} —`,
            error instanceof Error ? error.message : String(error)
          );
        }
      },
    },
  });
}

/**
 * 손님용. 지금까지와 완전히 같습니다.
 *
 * ★ 이 클라이언트가 쓰는 칸에는 손님 세션만 들어갑니다.
 *   관리자는 아래 createAdminAuthClient() 로 다른 칸을 씁니다.
 */
export function createAuthClient(): SupabaseClient | null {
  return build();
}

/**
 * ============================================================
 * ★★ 관리자용 (2026-08-26)
 * ============================================================
 *
 * ★★ 손님과 쿠키 칸을 나눕니다.
 *   전에는 둘이 한 칸을 같이 써서, 관리자로 들어와 있다가 손님 화면에서
 *   구글·카카오 로그인을 누르면 관리자 세션이 그 자리에서 덮어써졌습니다.
 *
 * ★★ 관리자 쪽에서 세션을 다루는 곳은 **전부** 이것을 써야 합니다.
 *   하나라도 빠뜨리면 "로그인은 되는데 화면에서 튕김" 이 됩니다.
 *   쓰는 곳 (2026-08-26 기준 전수 확인):
 *     · app/admin/login-actions.ts  로그인·로그아웃
 *     · app/api/admin/session/route.ts  조용한 갱신
 *     · lib/admin-guard.ts  서버 액션·API 의 관리자 문
 *     · middleware.ts  화면의 관리자 문 (거기서는 직접 createServerClient 를
 *       부르므로 ADMIN_AUTH_COOKIE 를 직접 넘깁니다)
 *
 *   ★ app/admin/member-actions.ts 는 여기 없습니다. 일부러입니다.
 *     그곳은 회원에게 비밀번호 재설정 메일만 보냅니다. 세션을 읽지도
 *     쓰지도 않아 어느 칸을 보든 하는 일이 같습니다.
 */
export function createAdminAuthClient(): SupabaseClient | null {
  return build(ADMIN_AUTH_COOKIE);
}

/** 로그인 기능을 쓸 수 있는 상태인지 (환경변수가 채워져 있는지) */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
