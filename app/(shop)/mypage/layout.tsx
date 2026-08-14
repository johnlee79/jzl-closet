import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import MypageNav from '@/components/MypageNav';
import { getActiveMember } from '@/lib/auth';

/**
 * 마이페이지 공통 껍데기.
 * ★ 개인정보가 나오는 화면이라 전부 noindex 입니다.
 *   미들웨어가 로그인도 확인하지만, 서버 컴포넌트에서 한 번 더 막습니다.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: '마이페이지', template: '%s | 마이페이지' },
  robots: { index: false, follow: false, nocache: true },
};

export default async function MypageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getActiveMember();
  if (!member) redirect('/login?next=/mypage');

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">MY PAGE</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          {member.profile.name}님
        </h1>
        <p className="mt-3 text-[15px] text-muted">{member.user.email}</p>
      </header>

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[200px_1fr] lg:gap-16">
        <MypageNav />
        <div className="min-w-0">{children}</div>
      </div>

      <p className="mt-16 border-t border-stone pt-6 text-[13px] leading-relaxed text-muted">
        비회원으로 주문하신 내역은{' '}
        <Link href="/mypage/orders" className="link-wine">
          주문 내역
        </Link>
        에서 &ldquo;비회원 주문 불러오기&rdquo;로 가져오실 수 있습니다.
      </p>
    </div>
  );
}
