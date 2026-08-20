import Link from 'next/link';
import WelcomeNotice from '@/components/WelcomeNotice';
import { getActiveMember } from '@/lib/auth';
import { countInquiriesOfUser } from '@/lib/inquiries';
import { statusLabel } from '@/lib/order-status';
import { countOrdersOfUser, depositDeadline, getOrdersOfUser } from '@/lib/orders';
import { formatDate } from '@/lib/format';
import { formatPrice } from '@/lib/product-utils';
import { getCachedEvent, getCachedPayment } from '@/lib/settings';

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

  const [counts, recent, inquiryCounts, event, payment] = await Promise.all([
    countOrdersOfUser(member.user.id),
    getOrdersOfUser(member.user.id),
    countInquiriesOfUser(member.user.id),
    getCachedEvent(),
    getCachedPayment(),
  ]);

  /* ── 입금 기한이 1시간 남은 주문 ────────────────────────
   * ★ 기한을 모르고 자동취소당하는 일이 없도록 미리 알려 줍니다.
   *   비회원은 연락할 방법이 없어 이 안내를 못 받습니다. (문자 발송은 다음 작업)
   *   이미 불러온 주문 목록에서 고르므로 조회가 늘지 않습니다. */
  const soonExpiring = payment.autoCancelEnabled
    ? recent.filter((order) => {
        if (order.status !== 'pending_payment') return false;
        const deadline = depositDeadline(order.createdAt, payment.depositHours);
        if (!deadline) return false;
        const left = deadline.getTime() - Date.now();
        return left > 0 && left <= 60 * 60 * 1000;
      })
    : [];

  // 가입 축하 안내 — 최근 7일 안에 가입한 회원에게만, 브라우저에서 한 번만 보여 줍니다.
  const joined = member.profile.createdAt
    ? Date.now() - new Date(member.profile.createdAt).getTime()
    : Number.MAX_SAFE_INTEGER;
  const showWelcome = joined < 7 * 24 * 60 * 60 * 1000;

  const totalOrders = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const pendingInquiries = inquiryCounts.pending ?? 0;

  return (
    <div className="flex flex-col gap-12">
      {/* ★ 입금 기한이 1시간 남았습니다. */}
      {soonExpiring.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-wine bg-wine/5 px-5 py-4">
          <p className="text-[16px] leading-relaxed text-wine">
            입금 기한이 1시간 남았습니다. 기한이 지나면 주문이 자동 취소됩니다.
            {soonExpiring.length > 1 ? ` (${soonExpiring.length}건)` : ''}
          </p>
          <Link
            href={
              soonExpiring.length === 1
                ? `/mypage/orders/${soonExpiring[0].id}`
                : '/mypage/orders?status=pending_payment'
            }
            className="btn-secondary min-h-[40px] px-4 py-0 text-[14px]"
          >
            주문 확인
          </Link>
        </div>
      ) : null}

      {showWelcome ? <WelcomeNotice message={event.mypageWelcome} /> : null}

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="font-serif text-[22px] text-ink">
          주문 요약
        </h2>

        <ul className="mt-6 grid grid-cols-3 gap-3">
          {HIGHLIGHT.map((item) => (
            <li key={item.status}>
              <Link
                href={item.href}
                className="block border border-stone p-5 transition-colors hover:border-ink"
              >
                <span className="text-[14px] text-muted">{statusLabel(item.status)}</span>
                <span className="mt-2 block text-[28px] font-semibold tabular-nums text-ink">
                  {counts[item.status] ?? 0}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[15px] text-muted">
          전체 주문 {totalOrders}건 ·{' '}
          <Link href="/mypage/orders" className="link-wine">
            주문 내역 전체 보기
          </Link>
        </p>
      </section>

      {pendingInquiries > 0 ? (
        <section className="border border-stone p-5">
          <p className="text-[16px] leading-relaxed text-ink">
            답변을 기다리는 문의가 {pendingInquiries}건 있습니다.{' '}
            <Link href="/mypage/inquiries" className="link-wine">
              문의 내역 보기
            </Link>
          </p>
        </section>
      ) : null}

      <section aria-labelledby="recent-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-stone pb-4">
          <h2 id="recent-heading" className="font-serif text-[22px] text-ink">
            최근 주문
          </h2>
          <Link href="/mypage/orders" className="text-[15px] text-muted underline underline-offset-4">
            전체 보기
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="py-14">
            <p className="text-[17px] leading-relaxed text-ink">아직 주문 내역이 없습니다.</p>
            <div className="btn-row mt-6">
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
                      <span className="text-[16px] font-semibold tabular-nums tracking-[0.02em] text-ink">
                        {order.orderNo}
                      </span>
                      <span className="text-[14px] text-muted">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-[16px] leading-snug text-ink">{summary}</p>
                    <p className="mt-1 text-[15px] text-muted">
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
