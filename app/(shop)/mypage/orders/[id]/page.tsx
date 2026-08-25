import { notFound } from 'next/navigation';
import MemberOrderDetail from '@/components/MemberOrderDetail';
import { requireMember } from '@/lib/auth';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';
import { getOrderOfUser } from '@/lib/orders';
import { getCachedStore } from '@/lib/settings';

export const metadata = { title: '주문 상세' };

export default async function MypageOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  /*
   * ★ 비로그인이면 로그인 화면으로 보냅니다. (로그인 뒤 여기로 돌아옵니다)
   *   로그인은 했지만 쇼핑몰 회원이 아니면 안내 화면을 그립니다.
   *   예전에는 둘 다 null 이라 본문이 통째로 빈 화면이 나왔습니다.
   */
  const member = await requireMember('/mypage/orders');
  if (!member) return <MemberOnlyNotice />;

  // ★ 본인 주문이 아니면 404 입니다. 남의 주문번호로는 열리지 않습니다.
  const [order, store] = await Promise.all([
    getOrderOfUser(member.user.id, params.id),
    getCachedStore(),
  ]);
  if (!order) notFound();

  return <MemberOrderDetail order={order} storeName={store.name} />;
}
