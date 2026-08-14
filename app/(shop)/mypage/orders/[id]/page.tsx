import { notFound } from 'next/navigation';
import MemberOrderDetail from '@/components/MemberOrderDetail';
import { getActiveMember } from '@/lib/auth';
import { getOrderOfUser } from '@/lib/orders';
import { getCachedStore } from '@/lib/settings';

export const metadata = { title: '주문 상세' };

export default async function MypageOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const member = await getActiveMember();
  if (!member) return null;

  // ★ 본인 주문이 아니면 404 입니다. 남의 주문번호로는 열리지 않습니다.
  const [order, store] = await Promise.all([
    getOrderOfUser(member.user.id, params.id),
    getCachedStore(),
  ]);
  if (!order) notFound();

  return (
    <MemberOrderDetail order={order} storeName={store.name} storePhone={store.phone} />
  );
}
