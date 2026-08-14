import type { Metadata } from 'next';
import { RequestResetForm } from '@/components/ResetPasswordForm';

export const metadata: Metadata = {
  title: '비밀번호 찾기',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">RESET PASSWORD</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          비밀번호 찾기
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          가입하신 이메일로 비밀번호 재설정 링크를 보내드립니다.
        </p>
      </header>

      <RequestResetForm />
    </div>
  );
}
