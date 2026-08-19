import 'server-only';

import { toProvider, type AuthProvider } from '@/lib/auth-provider';

/**
 * auth.users 를 이메일로 직접 조회합니다.
 *
 * ★ 왜 필요한가
 *   회원 목록(profiles)만 보고 "가입 안 된 이메일" 이라 판단하면 안 됩니다.
 *   로그인 계정은 auth.users 에, 회원 정보는 profiles 에 따로 있고
 *   둘이 어긋난 계정이 실제로 생깁니다. 구글 로그인이 중간에 끊기면
 *   auth.users 행만 남고 profiles 행은 안 생깁니다.
 *
 *   그 상태에서 같은 이메일로 이메일 가입을 시도하면 Supabase 는
 *   "이미 있는 계정" 이라는 사실을 숨기려고 성공(200)처럼 응답하면서
 *   실제로는 없는 가짜 id 를 돌려줍니다. 그 id 로 profiles 에 넣으면
 *   profiles_id_fkey 외래키 위반이 납니다. 실제로 그렇게 터졌습니다.
 *
 * ★ auth 스키마는 PostgREST 로 열려 있지 않습니다.
 *   그래서 supabase-js 대신 GoTrue 관리자 API 를 직접 부릅니다.
 *   filter 는 이메일 정확 검색을 지원합니다. (목록 전체를 훑지 않습니다)
 *
 * ★ service_role 키를 씁니다. 반드시 서버에서만 부르세요.
 */
export type AuthAccount = {
  id: string;
  email: string;
  provider: AuthProvider;
  /** 이메일 인증까지 마친 계정인지 */
  confirmed: boolean;
};

export async function authAccountByEmail(email: string): Promise<AuthAccount | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const target = email.trim().toLowerCase();
  if (!target) return null;

  let payload: unknown;
  try {
    const response = await fetch(
      `${url}/auth/v1/admin/users?filter=${encodeURIComponent(target)}&per_page=20`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: 'no-store',
      }
    );
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    /*
      ★ 조회가 안 되면 "없다" 가 아니라 "모른다" 입니다.
        여기서 null 을 돌려주면 부르는 쪽이 가입을 막지 않고 그대로 진행합니다.
        Supabase 가 어차피 한 번 더 걸러 주므로 가입을 통째로 막는 것보다 낫습니다.
    */
    return null;
  }

  const users = (payload as { users?: unknown }).users;
  if (!Array.isArray(users)) return null;

  // filter 는 부분 일치도 잡아 줍니다. 정확히 같은 이메일만 씁니다.
  const found = users.find((row) => {
    const value = (row as { email?: unknown }).email;
    return typeof value === 'string' && value.trim().toLowerCase() === target;
  }) as Record<string, unknown> | undefined;
  if (!found || typeof found.id !== 'string') return null;

  const appMetadata = (found.app_metadata ?? {}) as Record<string, unknown>;

  return {
    id: found.id,
    email: target,
    provider: toProvider(
      typeof appMetadata.provider === 'string' ? appMetadata.provider : ''
    ),
    confirmed: Boolean(found.email_confirmed_at),
  };
}
