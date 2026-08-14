import type { Metadata } from 'next';
import Link from 'next/link';
import AuthCard from '@/components/AuthCard';
import LoginForm from '@/components/LoginForm';
import { isAuthConfigured } from '@/lib/supabase/auth-server';

/**
 * ★ next·error 를 서버에서 읽어 폼에 넘깁니다.
 *   클라이언트에서 useSearchParams 로 읽으면 폼 전체가 Suspense 로 감싸여
 *   서버 HTML 이 비고 화면이 한 번 깜빡입니다.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '로그인',
  robots: { index: false, follow: false },
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  return (
    <AuthCard
      eyebrow="LOGIN"
      title="로그인"
      footer={
        <>
          <p>
            아직 회원이 아니신가요?{' '}
            <Link href="/signup" className="link-wine">
              회원가입
            </Link>
          </p>
          {/* ★ 비회원 주문 안내는 그대로 둡니다. 로그인을 강제하지 않습니다. */}
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            회원가입 없이도 주문하실 수 있습니다. 이미 비회원으로 주문하셨다면{' '}
            <Link href="/order-lookup" className="link-wine">
              주문 조회
            </Link>
            에서 주문번호와 연락처로 확인해 주세요.
          </p>
        </>
      }
    >
      {isAuthConfigured() ? (
        <LoginForm
          next={searchParams.next ?? '/mypage'}
          linkError={searchParams.error ?? ''}
        />
      ) : (
        <p className="border border-wine px-5 py-4 text-[15px] leading-relaxed text-wine">
          로그인 기능이 아직 설정되지 않았습니다. 회원가입 없이도 주문하실 수 있습니다.
        </p>
      )}
    </AuthCard>
  );
}
