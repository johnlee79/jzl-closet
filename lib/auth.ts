import 'server-only';

import { redirect } from 'next/navigation';
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

/**
 * ============================================================
 * 마이페이지 화면들이 쓰는 문 (2026-08-25)
 * ============================================================
 *
 * ★★ 무엇이 문제였나
 *   마이페이지 화면 열 곳이 전부 이렇게 되어 있었습니다.
 *       const member = await getActiveMember();
 *       if (!member) return null;
 *   본문을 통째로 안 그립니다. 헤더와 푸터는 레이아웃이 그리므로,
 *   손님에게는 "머리와 발만 있고 가운데가 텅 빈 화면" 이 보입니다.
 *   무엇이 잘못됐는지도, 어디로 가야 하는지도 알 수 없습니다.
 *
 * ★★ 왜 그냥 /login 으로 보내면 안 되는가 — 무한 반복이 됩니다
 *   미들웨어가 /login 에서 "로그인한 사람" 을 /mypage 로 되돌려 보냅니다.
 *   (middleware.ts 의 isGuestOnly)
 *   그런데 여기서 !member 인 경우는 두 가지입니다.
 *
 *     ① 아예 로그인을 안 함        → 미들웨어도 /login 으로 보냅니다. 맞습니다
 *     ② 로그인은 했는데 회원이 아님 → 미들웨어는 "로그인했다" 고 봅니다
 *
 *   ②에서 /login 으로 보내면 미들웨어가 다시 /mypage 로 보내고,
 *   /mypage 가 또 /login 으로 보냅니다. 손님 브라우저가 그 자리에서 멈춥니다.
 *
 *   ②는 실제로 생깁니다. 관리자 이메일로 로그인하면 Supabase 세션이 생기는데
 *   그 계정에는 profiles 행이 없습니다. 탈퇴한 계정도 같은 상태입니다.
 *
 * ★ 그래서 둘을 나눠 다룹니다.
 *     ① → /login?next=… 로 보냅니다. 로그인하면 원래 가려던 곳으로 돌아옵니다
 *     ② → 돌려보내지 않고 null 을 돌려줍니다. 부르는 쪽이 안내 화면을 그립니다
 *
 * @param nextPath 로그인 뒤 돌아올 주소
 * @returns 회원이면 그 값, ②번 상황이면 null (①번은 여기서 리다이렉트합니다)
 */
export async function requireMember(
  nextPath: string
): Promise<{ user: SessionUser; profile: Profile } | null> {
  const member = await getActiveMember();
  if (member) return member;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  // 로그인은 되어 있는데 쇼핑몰 회원이 아닙니다. (프로필 없음 · 탈퇴)
  return null;
}

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
