import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

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
export function createAuthClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const store = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return store.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          store.set({ name, value, ...options });
        } catch {
          // 서버 컴포넌트에서 호출된 경우입니다. 미들웨어가 갱신을 맡습니다.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          store.set({ name, value: '', ...options, maxAge: 0 });
        } catch {
          // 위와 같습니다.
        }
      },
    },
  });
}

/** 로그인 기능을 쓸 수 있는 상태인지 (환경변수가 채워져 있는지) */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
