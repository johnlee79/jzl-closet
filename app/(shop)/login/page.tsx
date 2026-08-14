import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';
import { isAuthConfigured } from '@/lib/supabase/auth-server';

export const metadata: Metadata = {
  title: '로그인',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">LOGIN</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          로그인
        </h1>
      </header>

      {isAuthConfigured() ? (
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      ) : (
        <p className="mt-10 border border-wine px-5 py-4 text-[15px] leading-relaxed text-wine">
          로그인 기능이 아직 설정되지 않았습니다. 회원가입 없이도 주문하실 수 있습니다.
        </p>
      )}
    </div>
  );
}
