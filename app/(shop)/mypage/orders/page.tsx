import MemberOrderList from '@/components/MemberOrderList';
import { getActiveMember } from '@/lib/auth';
import { getOrdersOfUser } from '@/lib/orders';

export const metadata = { title: '주문 내역' };

export default async function MypageOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const member = await getActiveMember();
  if (!member) return null;

  const status = searchParams.status ?? 'all';
  const orders = await getOrdersOfUser(member.user.id, status);

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="font-serif text-[20px] text-ink">
        주문 내역
      </h2>
      <div className="mt-6">
        <MemberOrderList orders={orders} status={status} />
      </div>
    </section>
  );
}
