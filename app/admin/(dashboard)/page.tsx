import Link from 'next/link';
import { sweepAutoCancelQuietly } from '@/lib/auto-cancel';
import { countPendingInquiries } from '@/lib/inquiries';
import { countReviewsToday } from '@/lib/reviews';
import { statusBadgeClass, statusLabel, ORDER_STATUSES } from '@/lib/order-status';
import { getDashboardStats } from '@/lib/orders';
import { formatPrice } from '@/lib/product-utils';
import { countMembersByStatus } from '@/lib/profiles';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import type { DashboardStats, Order } from '@/lib/types';

/** 관리자 첫 화면. 항상 최신 값을 봅니다. */
export const dynamic = 'force-dynamic';

export const metadata = { title: '대시보드' };

/** 전일·전월 대비 증감률. 이전 값이 0이면 비교하지 않습니다. */
function changeRate(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const rate = changeRate(current, previous);
  if (rate === null) {
    return <span className="text-[12px] text-slate-400">비교 대상 없음</span>;
  }
  const up = rate > 0;
  const flat = rate === 0;
  return (
    <span
      className={`text-[12px] ${
        flat ? 'text-slate-500' : up ? 'text-green-700' : 'text-red-600'
      }`}
    >
      {flat ? '변동 없음' : `${up ? '▲' : '▼'} ${Math.abs(rate)}%`}
    </span>
  );
}

function StatCard({
  label,
  value,
  suffix = '',
  children,
  tone = 'plain',
  href,
}: {
  label: string;
  value: number;
  suffix?: string;
  children?: React.ReactNode;
  tone?: 'plain' | 'alert';
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[13px] text-slate-600">{label}</p>
      <p
        className={`mt-2 text-[24px] font-semibold tabular-nums ${
          tone === 'alert' && value > 0 ? 'text-amber-700' : 'text-slate-900'
        }`}
      >
        {formatPrice(value)}
        {suffix ? <span className="ml-1 text-[14px] font-normal">{suffix}</span> : null}
      </p>
      {children ? <p className="mt-1">{children}</p> : null}
    </>
  );

  const className = `admin-card block p-4 ${
    tone === 'alert' && value > 0 ? 'border-amber-300 bg-amber-50' : ''
  } ${href ? 'transition-colors hover:bg-slate-50' : ''}`;

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function RecentRow({ order }: { order: Order }) {
  const live = order.items.filter((item) => item.itemStatus === 'normal');
  const summary =
    live.length === 0
      ? '(전체 취소)'
      : `${live[0].productName}${live.length > 1 ? ` 외 ${live.length - 1}건` : ''}`;

  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="whitespace-nowrap px-3 py-2.5">
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-medium text-blue-700 hover:underline"
        >
          {order.orderNo}
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
        {order.createdAt
          ? new Date(order.createdAt).toLocaleString('ko-KR', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : ''}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">{order.ordererName}</td>
      <td className="max-w-[240px] truncate px-3 py-2.5 text-slate-700">{summary}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">
        {formatPrice(order.totalAmount)}원
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={`admin-badge ${statusBadgeClass(order.status)}`}>
          {statusLabel(order.status)}
        </span>
      </td>
    </tr>
  );
}

export default async function AdminDashboardPage() {
  const configured = isSupabaseConfigured();
  // ★ 주문·회원·문의가 하나도 없어도 전부 0 으로 내려옵니다. 화면이 깨지지 않습니다.
  const empty: DashboardStats = {
    todayAmount: 0,
    yesterdayAmount: 0,
    monthAmount: 0,
    lastMonthAmount: 0,
    todayCount: 0,
    pendingPaymentCount: 0,
    unshippedCount: 0,
    countByStatus: {},
    recentOrders: [],
  };

  // 관리자 첫 화면에서도 기한 지난 입금대기 건을 정리합니다.
  if (configured) await sweepAutoCancelQuietly();

  const [stats, pendingInquiryCount, memberCounts, reviewCounts] = configured
    ? await Promise.all([
        getDashboardStats(),
        countPendingInquiries(),
        countMembersByStatus(),
        countReviewsToday(),
      ])
    : [empty, 0, {} as Record<string, number>, { today: 0, lowRating: 0 }];

  const activeMembers = memberCounts.active ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <h1 className="text-[20px] font-semibold text-slate-900">대시보드</h1>
      <p className="mt-1 text-[13px] text-slate-600">
        오늘 처리할 일을 여기서 확인하세요. (한국 시간 기준)
      </p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : null}

      {/* ★ 입금대기는 매일 확인해야 하므로 맨 위에 크게 둡니다. */}
      {stats.pendingPaymentCount > 0 ? (
        <Link
          href="/admin/orders?status=pending_payment"
          className="admin-card mt-5 flex flex-wrap items-center justify-between gap-3 border-amber-400 bg-amber-50 p-5 transition-colors hover:bg-amber-100"
        >
          <div>
            <p className="text-[15px] font-semibold text-amber-900">
              입금대기 {stats.pendingPaymentCount}건
            </p>
            <p className="mt-1 text-[13px] text-amber-800">
              통장을 확인하고 입금된 주문은 결제완료로 바꿔 주세요.
            </p>
          </div>
          <span className="admin-btn-primary bg-amber-600 border-amber-600 hover:bg-amber-700">
            입금대기 주문 보기
          </span>
        </Link>
      ) : null}

      {/* ★ 미답변 문의도 매일 확인해야 합니다. */}
      {pendingInquiryCount > 0 ? (
        <Link
          href="/admin/inquiries?status=pending"
          className="admin-card mt-4 flex flex-wrap items-center justify-between gap-3 border-amber-400 bg-amber-50 p-5 transition-colors hover:bg-amber-100"
        >
          <div>
            <p className="text-[15px] font-semibold text-amber-900">
              미답변 문의 {pendingInquiryCount}건
            </p>
            <p className="mt-1 text-[13px] text-amber-800">
              영업일 기준 1~2일 안에 답변드린다고 안내하고 있습니다.
            </p>
          </div>
          <span className="admin-btn-primary border-amber-600 bg-amber-600 hover:bg-amber-700">
            문의 보러 가기
          </span>
        </Link>
      ) : null}

      {/* 매출 */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="오늘 주문금액" value={stats.todayAmount} suffix="원">
          <Delta current={stats.todayAmount} previous={stats.yesterdayAmount} />
        </StatCard>
        <StatCard label="이번달 주문금액" value={stats.monthAmount} suffix="원">
          <Delta current={stats.monthAmount} previous={stats.lastMonthAmount} />
        </StatCard>
        <StatCard label="오늘 주문건수" value={stats.todayCount} suffix="건" href="/admin/orders" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="미출고 (결제완료 + 상품준비중)"
          value={stats.unshippedCount}
          suffix="건"
          href="/admin/orders?status=paid"
        />
        <StatCard
          label="미답변 문의"
          value={pendingInquiryCount}
          suffix="건"
          tone="alert"
          href="/admin/inquiries?status=pending"
        />
        <StatCard
          label="활동 중인 회원"
          value={activeMembers}
          suffix="명"
          href="/admin/members"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="오늘 등록된 리뷰"
          value={reviewCounts.today}
          suffix="건"
          href="/admin/reviews"
        />
        <StatCard
          label="별점 3점 이하 리뷰"
          value={reviewCounts.lowRating}
          suffix="건"
          tone="alert"
          href="/admin/reviews?rating=3"
        />
      </div>

      {/* 상태별 건수 */}
      <section className="mt-8">
        <h2 className="text-[16px] font-semibold text-slate-900">상태별 주문</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ORDER_STATUSES.map((status) => {
            const count = stats.countByStatus[status] ?? 0;
            return (
              <li key={status}>
                <Link
                  href={`/admin/orders?status=${status}`}
                  className={`admin-card block p-3 transition-colors hover:bg-slate-50 ${
                    status === 'pending_payment' && count > 0
                      ? 'border-amber-300 bg-amber-50'
                      : ''
                  }`}
                >
                  <span className={`admin-badge ${statusBadgeClass(status)}`}>
                    {statusLabel(status)}
                  </span>
                  <span className="mt-2 block text-[20px] font-semibold tabular-nums text-slate-900">
                    {count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 최근 주문 */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold text-slate-900">최근 주문 10건</h2>
          <Link href="/admin/orders" className="admin-btn">
            전체 보기
          </Link>
        </div>

        <div className="admin-card mt-3 overflow-x-auto">
          {stats.recentOrders.length === 0 ? (
            <p className="px-4 py-14 text-center text-[14px] leading-relaxed text-slate-500">
              아직 주문이 없습니다.
              <br />
              <span className="text-[13px]">
                첫 주문이 들어오면 여기에 바로 나타납니다.
              </span>
            </p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[13px] text-slate-600">
                  <th scope="col" className="px-3 py-2 font-medium">주문번호</th>
                  <th scope="col" className="px-3 py-2 font-medium">주문일시</th>
                  <th scope="col" className="px-3 py-2 font-medium">주문자</th>
                  <th scope="col" className="px-3 py-2 font-medium">상품</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">결제금액</th>
                  <th scope="col" className="px-3 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order) => (
                  <RecentRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
