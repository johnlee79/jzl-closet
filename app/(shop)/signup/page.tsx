import type { Metadata } from 'next';
import SignupForm from '@/components/SignupForm';
import { isAuthConfigured } from '@/lib/supabase/auth-server';

/** ★ 개인정보를 입력하는 화면이라 검색에 잡히면 안 됩니다. */
export const metadata: Metadata = {
  title: '회원가입',
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">SIGN UP</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          회원가입
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          가입하시면 주문 내역과 배송 상황을 한곳에서 확인하실 수 있습니다.
          주소를 저장해 두면 다음 주문부터 자동으로 채워집니다.
        </p>
      </header>

      {isAuthConfigured() ? (
        <SignupForm />
      ) : (
        <p className="mt-10 border border-wine px-5 py-4 text-[15px] leading-relaxed text-wine">
          로그인 기능이 아직 설정되지 않았습니다. 회원가입 없이도 주문하실 수 있습니다.
        </p>
      )}
    </div>
  );
}
