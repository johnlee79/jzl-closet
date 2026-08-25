import { redirect } from 'next/navigation';
import MemberOrderList from '@/components/MemberOrderList';
import { requireMember } from '@/lib/auth';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';
import { isMypageOrderTab } from '@/lib/order-status';
import { getOrdersOfUser } from '@/lib/orders';
import { getReviewedKeys } from '@/lib/reviews';
import { getCachedPayment } from '@/lib/settings';

export const metadata = { title: '주문 내역' };

export default async function MypageOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  /*
   * ★ 비로그인이면 로그인 화면으로 보냅니다. (로그인 뒤 여기로 돌아옵니다)
   *   로그인은 했지만 쇼핑몰 회원이 아니면 안내 화면을 그립니다.
   *   예전에는 둘 다 null 이라 본문이 통째로 빈 화면이 나왔습니다.
   */
  const member = await requireMember('/mypage/orders');
  if (!member) return <MemberOnlyNotice />;

  const status = searchParams.status ?? 'all';

  /*
   * ★ 탭을 여섯 개로 줄이면서 없어진 주소가 생겼습니다.
   *   (?status=payment_review 처럼 손님이 즐겨찾기해 두었을 수 있는 것들)
   *   그대로 두면 아무것도 걸리지 않아 빈 목록만 보입니다. 전체로 돌려보냅니다.
   * ★ 주소까지 깨끗해집니다. 화면만 전체로 바꾸면 주소창에는 없어진 탭 이름이
   *   남아 있어, 그 주소를 다시 공유하게 됩니다.
   */
  if (status !== 'all' && !isMypageOrderTab(status)) {
    redirect('/mypage/orders');
  }
  const [orders, payment] = await Promise.all([
    getOrdersOfUser(member.user.id, status),
    getCachedPayment(),
  ]);

  // 이미 후기를 쓴 상품에는 버튼 대신 "작성 완료"를 보여 줍니다.
  const reviewedKeys = await getReviewedKeys(orders.map((order) => order.id));

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="font-serif text-[22px] text-ink">
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
