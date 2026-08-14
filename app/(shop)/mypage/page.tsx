import Link from 'next/link';
import { getActiveMember } from '@/lib/auth';
import { countInquiriesOfUser } from '@/lib/inquiries';
import { statusLabel } from '@/lib/order-status';
import { countOrdersOfUser, getOrdersOfUser } from '@/lib/orders';
import { formatDate } from '@/lib/format';
import { formatPrice } from '@/lib/product-utils';

export const metadata = { title: '요약' };

/** 마이페이지에서 눈에 띄게 보여 줄 상태들 */
const HIGHLIGHT = [
  { status: 'pending_payment', href: '/mypage/orders?status=pending_payment' },
  { status: 'shipping', href: '/mypage/orders?status=shipping' },
  { status: 'delivered', href: '/mypage/orders?status=delivered' },
] as const;

export default async function MypageHomePage() {
  const member = await getActiveMember();
  if (!member) return null;

  const [counts, recent, inquiryCounts] = await Promise.all([
    countOrdersOfUser(member.user.id),
    getOrdersOfUser(member.user.id),
    countInquiriesOfUser(member.user.id),
  ]);

  const totalOrders = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const pendingInquiries = inquiryCounts.pending ?? 0;

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="font-serif text-[20px] text-ink">
          주문 요약
        </h2>

        <ul className="mt-6 grid grid-cols-3 gap-3">
          {HIGHLIGHT.map((item) => (
            <li key={item.status}>
              <Link
                href={item.href}
                className="block border border-stone p-5 transition-colors hover:border-ink"
              >
                <span className="text-[13px] text-muted">{statusLabel(item.status)}</span>
                <span className="mt-2 block font-display text-[26px] text-ink">
                  {counts[item.status] ?? 0}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[14px] text-muted">
          전체 주문 {totalOrders}건 ·{' '}
          <Link href="/mypage/orders" className="link-wine">
            주문 내역 전체 보기
          </Link>
        </p>
      </section>

      {pendingInquiries > 0 ? (
        <section className="border border-stone p-5">
          <p className="text-[15px] leading-relaxed text-ink">
            답변을 기다리는 문의가 {pendingInquiries}건 있습니다.{' '}
            <Link href="/mypage/inquiries" className="link-wine">
              문의 내역 보기
            </Link>
          </p>
        </section>
      ) : null}

      <section aria-labelledby="recent-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-stone pb-4">
          <h2 id="recent-heading" className="font-serif text-[20px] text-ink">
            최근 주문
          </h2>
          <Link href="/mypage/orders" className="text-[14px] text-muted underline underline-offset-4">
            전체 보기
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="py-14">
            <p className="text-[16px] leading-relaxed text-ink">아직 주문 내역이 없습니다.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/products" className="btn-primary">
                상품 둘러보기
              </Link>
              <Link href="/mypage/orders" className="btn-secondary">
                비회원 주문 불러오기
              </Link>
            </div>
          </div>
        ) : (
          <ul>
            {recent.slice(0, 5).map((order) => {
              const live = order.items.filter((item) => item.itemStatus === 'normal');
              const summary =
                live.length === 0
                  ? '(전체 취소)'
                  : `${live[0].productName}${live.length > 1 ? ` 외 ${live.length - 1}건` : ''}`;
              return (
                <li key={order.id} className="border-b border-stone py-5">
                  <Link href={`/mypage/orders/${order.id}`} className="block">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-[15px] tracking-[0.1em] text-ink">
                        {order.orderNo}
                      </span>
                      <span className="text-[13px] text-muted">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] leading-snug text-ink">{summary}</p>
                    <p className="mt-1 text-[14px] text-muted">
                      {statusLabel(order.status)} · {formatPrice(order.totalAmount)}원
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
