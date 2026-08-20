import WithdrawForm from '@/components/WithdrawForm';
import { getActiveMember } from '@/lib/auth';
import { isSocialProvider, providerLabel } from '@/lib/profiles';

export const metadata = { title: '회원 탈퇴' };

export default async function MypageWithdrawPage() {
  const member = await getActiveMember();
  if (!member) return null;

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
