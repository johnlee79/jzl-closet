import type { Metadata } from 'next';
import Link from 'next/link';
import AuthCard from '@/components/AuthCard';
import SignupForm from '@/components/SignupForm';
import { isAuthConfigured } from '@/lib/supabase/auth-server';

/** ★ 개인정보를 입력하는 화면이라 검색에 잡히면 안 됩니다. */
export const metadata: Metadata = {
  title: '회원가입',
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthCard
      eyebrow="SIGN UP"
      title="회원가입"
      // 항목이 많아 카드를 조금 넓게 씁니다.
      width="wide"
      description="가입하시면 주문 내역과 배송 상황을 한곳에서 확인하실 수 있습니다."
      footer={
        <>
          <p>
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="link-wine">
              로그인
            </Link>
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-muted">
            회원가입 없이도 주문하실 수 있습니다.
          </p>
        </>
      }
    >
      {isAuthConfigured() ? (
        <SignupForm />
      ) : (
        <p className="border border-wine px-5 py-4 text-[16px] leading-relaxed text-wine">
          로그인 기능이 아직 설정되지 않았습니다. 회원가입 없이도 주문하실 수 있습니다.
        </p>
      )}
    </AuthCard>
  );
}
