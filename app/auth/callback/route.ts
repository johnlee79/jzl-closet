import { NextResponse, type NextRequest } from 'next/server';
import { earnSignupPoints } from '@/lib/points';
import {
  ensureProfile,
  getProfile,
  isSocialProvider,
  touchLastLogin,
  type AuthProvider,
} from '@/lib/profiles';
import { createAuthClient } from '@/lib/supabase/auth-server';

/**
 * 외부에서 돌아오는 링크가 모두 이 자리로 들어옵니다.
 *   · 구글 로그인 → /mypage (또는 원래 가려던 곳)
 *   · 가입 확인 메일 → /mypage
 *   · 비밀번호 재설정 메일 → /reset-password/update
 *
 * 링크에 담긴 코드를 세션으로 바꾼 뒤 원래 가려던 곳으로 보냅니다.
 * 실패하면 /login?error=... 로 보내 화면에 안내가 뜨게 합니다.
 */
export const dynamic = 'force-dynamic';

/** 열린 리다이렉트를 막습니다. 사이트 안쪽 주소만 허용합니다. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/mypage';
  return value;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get('next'));
  const code = params.get('code');
  // 구형 메일 템플릿은 token_hash + type 을 보냅니다.
  const tokenHash = params.get('token_hash');
  const type = params.get('type');

  // 구글 동의 화면에서 사용자가 취소를 누르면 error 로 돌아옵니다.
  const oauthError = params.get('error');
  if (oauthError) {
    const reason = oauthError === 'access_denied' ? 'cancelled' : 'oauth';
    return NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
  }

  const supabase = createAuthClient();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=auth', request.url));
  }

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'recovery' | 'signup' | 'email_change' | 'invite' | 'magiclink',
      });
      if (error) throw error;
    } else {
      return NextResponse.redirect(new URL('/login?error=link', request.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/login?error=expired', request.url));
  }

  /* ── 프로필 확인 ───────────────────────────────────────
   * ★ 구글로 처음 로그인하면 profiles 행이 없습니다. 여기서 만들어 줍니다.
   *   이메일로 가입했던 계정에 구글이 연결된 경우에는 이미 행이 있으므로
   *   ensureProfile 이 기존 값을 건드리지 않고 그대로 둡니다. */
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (user) {
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        typeof metadata.full_name === 'string'
          ? metadata.full_name
          : typeof metadata.name === 'string'
            ? metadata.name
            : '';

      // 어느 소셜로 들어왔는지 기록해 둡니다.
      // ★ 이 값으로 회원정보 수정 화면에서 비밀번호 칸을 감추고,
      //   비밀번호 찾기에서 "구글로 로그인하세요" 안내를 띄웁니다.
      const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
      const rawProvider =
        typeof appMetadata.provider === 'string' ? appMetadata.provider : '';
      const provider: AuthProvider = isSocialProvider(rawProvider)
        ? (rawProvider as AuthProvider)
        : 'email';

      const created = await ensureProfile({
        id: user.id,
        email: user.email ?? '',
        name,
        provider,
      });
      // 구글로 처음 들어온 회원에게도 가입 축하 포인트를 드립니다.
      if (created) await earnSignupPoints(user.id);

      // 탈퇴한 계정이면 다시 들여보내지 않습니다.
      const profile = await getProfile(user.id);
      if (profile?.status === 'withdrawn') {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL('/login?error=withdrawn', request.url));
      }
      if (profile?.status === 'inactive') {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL('/login?error=inactive', request.url));
      }

      await touchLastLogin(user.id);
    }
  } catch (error) {
    // 프로필을 못 만들면 로그인 자체를 되돌립니다. 반쪽짜리 계정을 남기지 않습니다.
    console.error('[auth/callback] 프로필 준비 실패:', error);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=profile', request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
