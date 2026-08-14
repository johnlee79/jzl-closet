import type { Metadata } from 'next';
import { UpdatePasswordForm } from '@/components/ResetPasswordForm';

/** 메일 링크(/auth/callback)를 거쳐 세션이 만들어진 뒤 들어오는 화면입니다. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '새 비밀번호 설정',
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">RESET PASSWORD</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          새 비밀번호 설정
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          앞으로 사용하실 비밀번호를 정해 주세요.
        </p>
      </header>

      <UpdatePasswordForm />
    </div>
  );
}
