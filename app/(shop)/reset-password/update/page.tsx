import type { Metadata } from 'next';
import AuthCard from '@/components/AuthCard';
import { UpdatePasswordForm } from '@/components/ResetPasswordForm';

/** 메일 링크(/auth/callback)를 거쳐 세션이 만들어진 뒤 들어오는 화면입니다. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '새 비밀번호 설정',
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
  return (
    <AuthCard
      eyebrow="RESET PASSWORD"
      title="새 비밀번호 설정"
      description="앞으로 사용하실 비밀번호를 정해 주세요."
    >
      <UpdatePasswordForm />
    </AuthCard>
  );
}
