import WithdrawForm from '@/components/WithdrawForm';
import { requireMember } from '@/lib/auth';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';
import { isSocialProvider, providerLabel } from '@/lib/profiles';

export const metadata = { title: '회원 탈퇴' };

export default async function MypageWithdrawPage() {
  /*
   * ★ 비로그인이면 로그인 화면으로 보냅니다. (로그인 뒤 여기로 돌아옵니다)
   *   로그인은 했지만 쇼핑몰 회원이 아니면 안내 화면을 그립니다.
   *   예전에는 둘 다 null 이라 본문이 통째로 빈 화면이 나왔습니다.
   */
  const member = await requireMember('/mypage/withdraw');
  if (!member) return <MemberOnlyNotice />;

  return (
    <section aria-labelledby="withdraw-heading">
      <h2 id="withdraw-heading" className="border-b border-stone pb-4 font-serif text-[22px] text-ink">
        회원 탈퇴
      </h2>
      <div className="mt-8">
        <WithdrawForm
          isSocial={isSocialProvider(member.profile.provider)}
          providerName={providerLabel(member.profile.provider)}
          pointBalance={member.profile.pointBalance}
        />
      </div>
    </section>
  );
}
