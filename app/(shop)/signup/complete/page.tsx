import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthCard from '@/components/AuthCard';
import SignupComplete from '@/components/SignupComplete';

/**
 * 이메일로 가입을 마친 뒤 오는 화면.
 * Supabase 의 Confirm email 이 켜져 있어 메일의 링크를 눌러야 로그인됩니다.
 * (구글 로그인은 인증이 필요 없어 이 화면을 거치지 않습니다)
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '인증 메일을 보냈습니다',
  robots: { index: false, follow: false, nocache: true },
};

export default function SignupCompletePage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const email = (searchParams.email ?? '').trim();
  // 주소로 직접 들어온 경우에는 보여 줄 것이 없습니다.
  if (!email) redirect('/signup');

  return (
    <AuthCard
      eyebrow="SIGN UP"
      title="인증 메일을 보냈습니다"
      description={
        <>
          <span className="block break-all font-medium text-ink">{email}</span>
          <span className="mt-2 block">
            메일함에서 인증 링크를 눌러야 로그인할 수 있습니다.
          </span>
        </>
      }
      footer={
        <>
          <Link href="/login" className="link-wine">
            로그인 화면으로
          </Link>
          <span className="mx-2 text-stone">·</span>
          <Link href="/products" className="link-wine">
            쇼핑 계속하기
          </Link>
        </>
      }
    >
      <SignupComplete email={email} />
    </AuthCard>
  );
}
