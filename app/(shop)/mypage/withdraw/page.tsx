import WithdrawForm from '@/components/WithdrawForm';
import { getActiveMember } from '@/lib/auth';

export const metadata = { title: '회원 탈퇴' };

export default async function MypageWithdrawPage() {
  const member = await getActiveMember();
  if (!member) return null;

  return (
    <section aria-labelledby="withdraw-heading">
      <h2 id="withdraw-heading" className="border-b border-stone pb-4 font-serif text-[20px] text-ink">
        회원 탈퇴
      </h2>
      <div className="mt-8">
        <WithdrawForm />
      </div>
    </section>
  );
}
