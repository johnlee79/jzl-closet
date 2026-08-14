import MemberOrderList from '@/components/MemberOrderList';
import { getActiveMember } from '@/lib/auth';
import { getOrdersOfUser } from '@/lib/orders';
import { getReviewedKeys } from '@/lib/reviews';
import { getCachedPayment } from '@/lib/settings';

export const metadata = { title: '주문 내역' };

export default async function MypageOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const member = await getActiveMember();
  if (!member) return null;

  const status = searchParams.status ?? 'all';
  const [orders, payment] = await Promise.all([
    getOrdersOfUser(member.user.id, status),
    getCachedPayment(),
  ]);

  // 이미 후기를 쓴 상품에는 버튼 대신 "작성 완료"를 보여 줍니다.
  const reviewedKeys = await getReviewedKeys(orders.map((order) => order.id));

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="font-serif text-[20px] text-ink">
        주문 내역
      </h2>
      <div className="mt-6">
        <MemberOrderList
          orders={orders}
          status={status}
          reviewedKeys={Array.from(reviewedKeys)}
          depositHours={payment.autoCancelEnabled ? payment.depositHours : 0}
        />
      </div>
    </section>
  );
}
