import type { Metadata } from 'next';
import Link from 'next/link';
import MypageNav from '@/components/MypageNav';
import PhonePrompt from '@/components/PhonePrompt';
import { requireMember } from '@/lib/auth';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';

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
  /*
   * ============================================================
   * ★★ 여기가 "텅 빈 마이페이지" 의 진짜 원인이었습니다 (2026-08-25)
   * ============================================================
   *
   * 예전에는 이랬습니다.
   *     const member = await getActiveMember();
   *     if (!member) redirect('/login?next=/mypage');
   *
   * 비로그인이면 맞는 동작입니다. 문제는 다른 경우입니다.
   *
   *   로그인은 했는데 쇼핑몰 회원이 아닌 계정 — profiles 행이 없거나 탈퇴한 계정.
   *   이 상태에서 /mypage 에 오면
   *     이 레이아웃이 /login 으로 보냄
   *       → 미들웨어가 "로그인한 사람" 으로 보고 /mypage 로 되돌려 보냄
   *         → 이 레이아웃이 또 /login 으로 보냄 … 끝없이 반복
   *   화면을 옮기는 도중이라 바깥 껍데기(헤더·푸터)는 그대로 남고 가운데만
   *   비어 보입니다. 손님 눈에는 "본문이 통째로 없는 화면" 입니다.
   *
   *   이런 계정이 실제로 있습니다. 관리자 이메일로 로그인하면 Supabase 세션이
   *   생기는데, 그 계정은 쇼핑몰 회원으로 가입한 적이 없어 profiles 가 없습니다.
   *
   * ★ requireMember 가 둘을 갈라 줍니다.
   *     비로그인            → /login?next=… (여기서 리다이렉트)
   *     로그인했지만 회원 아님 → null (아래에서 안내 화면을 그립니다)
   *   두 번째를 돌려보내지 않는 것이 반복을 끊는 핵심입니다.
   */
  const member = await requireMember('/mypage');
  if (!member) return <MemberOnlyNotice />;

  return (
    // 좌측 메뉴 + 우측 내용 구조는 그대로 두고 전체를 가운데 정렬합니다.
    <div className="mx-auto w-full max-w-[1100px] px-5 py-14 md:px-10 md:py-20">
      <header>
        <p className="label-xs">MY PAGE</p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          {member.profile.name}님
        </h1>
        <p className="mt-3 text-[16px] text-muted">{member.user.email}</p>
      </header>

      {/* ★ 구글 로그인은 연락처를 주지 않습니다. 비어 있으면 안내합니다. */}
      {!member.profile.phone ? (
        <div className="mt-8">
          <PhonePrompt variant="inline" />
        </div>
      ) : null}

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[200px_1fr] lg:gap-16">
        <MypageNav />
        <div className="min-w-0">{children}</div>
      </div>

      <p className="mt-16 border-t border-stone pt-6 text-[14px] leading-relaxed text-muted">
        비회원으로 주문하신 내역은{' '}
        <Link href="/mypage/orders" className="link-wine">
          주문 내역
        </Link>
        에서 &ldquo;비회원 주문 불러오기&rdquo;로 가져오실 수 있습니다.
      </p>
    </div>
  );
}
