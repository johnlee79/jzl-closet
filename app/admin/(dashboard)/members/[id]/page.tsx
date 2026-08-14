import { notFound } from 'next/navigation';
import MemberDetail from '@/components/admin/MemberDetail';
import { getOrdersOfUser } from '@/lib/orders';
import { getProfile } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const profile = await getProfile(params.id);
  return { title: profile ? `회원 ${profile.name}` : '회원 상세' };
}

export default async function AdminMemberDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await getProfile(params.id);
  if (!profile) notFound();

  const orders = await getOrdersOfUser(params.id);
  // 취소·반품·결제실패는 구매금액에서 뺍니다.
  const totalSpent = orders
    .filter((order) => !['cancelled', 'returned', 'failed'].includes(order.status))
    .reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <MemberDetail profile={profile} orders={orders} totalSpent={totalSpent} />
    </div>
  );
}
