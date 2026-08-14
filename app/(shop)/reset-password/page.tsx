import type { Metadata } from 'next';
import Link from 'next/link';
import AuthCard from '@/components/AuthCard';
import { RequestResetForm } from '@/components/ResetPasswordForm';

export const metadata: Metadata = {
  title: '비밀번호 찾기',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthCard
      eyebrow="RESET PASSWORD"
      title="비밀번호 찾기"
      description="가입하신 이메일로 비밀번호 재설정 링크를 보내드립니다."
      footer={
        <Link href="/login" className="link-wine">
          로그인 화면으로 돌아가기
        </Link>
      }
    >
      <RequestResetForm />
    </AuthCard>
  );
}
