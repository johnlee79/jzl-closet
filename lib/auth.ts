import 'server-only';

import { cache } from 'react';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { getProfile, type Profile } from '@/lib/profiles';

/**
 * "지금 누가 로그인했는지"를 알려 주는 헬퍼.
 *
 * 한 번의 요청 안에서 여러 컴포넌트가 불러도 실제 조회는 한 번만 합니다. (React cache)
 * 로그인하지 않았거나 Supabase 설정이 없으면 조용히 null 을 돌려줍니다.
 */

export type SessionUser = {
  id: string;
  email: string;
};

/** 로그인한 계정. 없으면 null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = createAuthClient();
  if (!supabase) return null;

  try {
    // getUser() 는 토큰을 Supabase 서버에서 다시 확인합니다.
    // 쿠키만 믿는 getSession() 보다 안전합니다.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? '' };
  } catch {
    return null;
  }
});

/** 로그인한 계정 + 쇼핑몰 회원 정보 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return getProfile(user.id);
});

/** 로그인 + 탈퇴하지 않은 회원인지. 마이페이지가 이 값을 씁니다. */
export const getActiveMember = cache(
  async (): Promise<{ user: SessionUser; profile: Profile } | null> => {
    const user = await getCurrentUser();
    if (!user) return null;
    const profile = await getProfile(user.id);
    if (!profile || profile.status === 'withdrawn') return null;
    return { user, profile };
  }
);

/** 헤더에 보여 줄 이름. 프로필이 없으면 이메일 앞부분을 씁니다. */
export function displayName(profile: Profile | null, user: SessionUser | null): string {
  if (profile?.name) return profile.name;
  if (user?.email) return user.email.split('@')[0];
  return '';
}
