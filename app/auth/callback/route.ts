import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';

/**
 * Supabase 가 보낸 메일 링크가 도착하는 자리입니다.
 *   · 가입 확인 메일 → /mypage 로
 *   · 비밀번호 재설정 메일 → /reset-password/update 로
 *
 * 링크에 담긴 코드를 세션으로 바꾼 뒤 원래 가려던 곳으로 보냅니다.
 * 코드가 없거나 만료됐으면 안내와 함께 로그인 화면으로 돌려보냅니다.
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

  return NextResponse.redirect(new URL(next, request.url));
}
