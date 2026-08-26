import Link from 'next/link';
import StatsRange from '@/components/admin/StatsRange';
import { kstDaysAgo, kstToday } from '@/lib/orders';
import { statusBadgeClass, statusLabel, ORDER_STATUSES } from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import { getReviewStats } from '@/lib/reviews';
import { getCachedAnalytics } from '@/lib/settings';
import { emptySales, getProductStats, getSalesStats } from '@/lib/stats';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '통계' };

import { resolveRange, type RangeParams } from '@/lib/admin-range';

type SearchParams = RangeParams;


/** 막대그래프 한 줄 — 라이브러리 없이 폭만 조절해 그립니다. */
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3 text-[15px]">
      <span className="w-[92px] shrink-0 truncate text-slate-600">{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-sm bg-slate-100">
        <span
          className="block h-full bg-blue-600"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />
      </span>
      <span className="w-[110px] shrink-0 text-right tabular-nums text-slate-900">
        {formatPrice(value)}원
      </span>
    </li>
  );
}

function StatCard({
  label,
  value,
  suffix,
  tone = 'plain',
}: {
  label: string;
  value: number;
  suffix: string;
  tone?: 'plain' | 'warn';
}) {
  return (
    <div className="admin-card p-4">
      <p className="text-[15px] text-slate-600">{label}</p>
      <p
        className={`mt-2 text-[26px] font-semibold tabular-nums ${
          tone === 'warn' && value > 0 ? 'text-red-700' : 'text-slate-900'
        }`}
      >
        {formatPrice(value)}
        <span className="ml-1 text-[16px] font-normal">{suffix}</span>
      </p>
    </div>
  );
}

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const configured = isSupabaseConfigured();
  // ** 기간 푸는 규칙은 lib/admin-range.ts 하나만 씁니다. (2026-08-27)
  //   통계 화면의 기본은 지금까지대로 1주일입니다.
  const { from, to, preset } = resolveRange(searchParams, '7d');

  const [sales, products, reviewStats, analytics] = configured
    ? await Promise.all([
        getSalesStats(from, to),
        getProductStats(from, to),
        getReviewStats(),
        getCachedAnalytics(),
      ])
    : [
        emptySales(),
        { top: [], byCategory: [], byBrand: [] },
        [],
        { ga4Id: '' },
      ];

  const maxDaily = Math.max(1, ...sales.daily.map((entry) => entry.amount));
  const maxCategory = Math.max(1, ...products.byCategory.map((entry) => entry.amount));
  const maxBrand = Math.max(1, ...products.byBrand.map((entry) => entry.amount));

  // 리뷰가 많은 상품 / 별점이 낮은 상품
  const mostReviewed = [...reviewStats].sort((a, b) => b.count - a.count).slice(0, 10);
  const lowestRated = [...reviewStats]
    // 한두 건짜리는 흔들림이 커서 제외합니다.
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => a.average - b.average)
    .slice(0, 10);

  const exportQuery = new URLSearchParams({ from, to }).toString();

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <h1 className="text-[24px] font-semibold text-slate-900">통계</h1>
      <p className="mt-1 text-[15px] text-slate-600">
        {from} ~ {to} · 취소·반품·결제실패 주문은 매출에서 뺐습니다.
      </p>

      {/* ★ 방문자 통계는 GA4 에서 봅니다. */}
      <div className="admin-card mt-5 flex flex-wrap items-center justify-between gap-3 border-blue-200 bg-blue-50 p-4">
        <p className="text-[16px] leading-relaxed text-blue-900">
          방문자 통계(페이지뷰·체류시간·이탈률)는 Google Analytics에서 확인하세요.
          {analytics.ga4Id ? (
            <span className="ml-2 font-mono text-[15px]">{analytics.ga4Id}</span>
          ) : (
            <span className="ml-2 text-[15px]">
              (측정 ID 가 아직 등록되지 않았습니다 —{' '}
              <Link href="/admin/settings?tab=analytics" className="underline" prefetch={false}>
                설정 &gt; 분석
              </Link>
              )
            </span>
          )}
        </p>
        <a
          href="https://analytics.google.com/"
          target="_blank"
          rel="noreferrer"
          className="admin-btn shrink-0"
        >
          Google Analytics 열기 ↗
        </a>
      </div>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[16px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : null}

      {/* ── 기간 선택 ─────────────────────────────────── */}
      <div className="admin-card mt-5 p-4">
        <StatsRange from={from} to={to} preset={preset} basePath="/admin/stats" />
        <div className="mt-3">
          <a href={`/api/admin/export/stats?${exportQuery}`} download className="admin-btn">
            이 조건으로 CSV 내보내기
          </a>
        </div>
      </div>

      {/* ── 매출 요약 ─────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="총 매출" value={sales.totalSales} suffix="원" />
        <StatCard label="주문 건수" value={sales.orderCount} suffix="건" />
        <StatCard label="평균 객단가" value={sales.averageOrder} suffix="원" />
        {/*
          ★★ 결제대기를 따로 보여 줍니다. (2026-08-25)
            매출에서는 뺐지만 "얼마가 들어올 예정인지" 는 봐야 합니다.
            빼는 것과 안 보이게 하는 것은 다릅니다.
          ★ 취소·반품 칸에 섞지 않습니다. 취소한 적 없는 주문이 취소로
            집계되면 그 숫자로는 아무 판단도 할 수 없습니다.
        */}
        <StatCard
          label={`입금·승인 대기 (${sales.pendingCount}건)`}
          value={sales.pendingAmount}
          suffix="원"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`취소·반품 (${sales.cancelledCount}건)`}
          value={sales.cancelledAmount}
          suffix="원"
          tone="warn"
        />
        <p className="text-[14px] leading-relaxed text-slate-500 sm:col-span-3">
          총 매출에는 <strong>결제가 확인된 주문만</strong> 들어갑니다. 무통장입금은 입금 전,
          카드는 승인 전인 주문이 <strong>입금·승인 대기</strong> 로 따로 잡힙니다.
          취소·반품·결제실패와 검토필요·승인확인실패도 매출에서 빠집니다.
        </p>
      </div>

      {/* ── 일자별 추이 ───────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold text-slate-900">일자별 매출</h2>
        {sales.daily.length === 0 ? (
          <p className="admin-card mt-3 px-4 py-10 text-center text-[16px] text-slate-500">
            이 기간에는 주문이 없습니다.
          </p>
        ) : (
          <div className="admin-card mt-3 overflow-x-auto p-4">
            {/* 세로 막대 — 폭만 조절해 직접 그립니다. */}
            <div className="flex min-w-max items-end gap-1" style={{ height: '180px' }}>
              {sales.daily.map((entry) => {
                const height = Math.round((entry.amount / maxDaily) * 100);
                return (
                  <div
                    key={entry.day}
                    className="flex w-[26px] flex-col items-center justify-end"
                    style={{ height: '100%' }}
                    title={`${entry.day} · ${formatPrice(entry.amount)}원 · ${entry.count}건`}
                  >
                    <span
                      className={`w-full rounded-t-sm ${
                        entry.amount > 0 ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                      style={{ height: `${Math.max(entry.amount > 0 ? 2 : 1, height)}%` }}
                      aria-hidden="true"
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex min-w-max gap-1">
              {sales.daily.map((entry) => (
                <span
                  key={entry.day}
                  className="w-[26px] text-center text-[12px] tabular-nums text-slate-500"
                >
                  {entry.day.slice(8)}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[14px] text-slate-500">
              최고 {formatPrice(maxDaily)}원 · 막대에 마우스를 올리면 자세히 보입니다.
            </p>
          </div>
        )}
      </section>

      {/* ── 상태별 건수 ───────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold text-slate-900">상태별 주문 건수</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ORDER_STATUSES.map((status) => (
            <li key={status} className="admin-card p-3">
              <span className={`admin-badge ${statusBadgeClass(status)}`}>
                {statusLabel(status)}
              </span>
              <span className="mt-2 block text-[20px] font-semibold tabular-nums text-slate-900">
                {sales.byStatus[status] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 상품 통계 ─────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold text-slate-900">판매 수량 상위 20</h2>
        <div className="admin-card mt-3 overflow-x-auto">
          {products.top.length === 0 ? (
            <p className="px-4 py-10 text-center text-[16px] text-slate-500">
              이 기간에는 판매된 상품이 없습니다.
            </p>
          ) : (
            <table className="w-full min-w-[560px] border-collapse text-[16px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[15px] text-slate-600">
                  <th scope="col" className="w-10 px-3 py-2 font-medium">#</th>
                  <th scope="col" className="px-3 py-2 font-medium">상품명</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">판매수량</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">매출액</th>
                </tr>
              </thead>
              <tbody>
                {products.top.map((entry, index) => (
                  <tr key={entry.slug} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 tabular-nums text-slate-400">{index + 1}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/products/${entry.slug}`}
                        target="_blank"
                        className="text-blue-700 hover:underline"
                      >
                        {entry.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {entry.quantity}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                      {formatPrice(entry.amount)}원
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <h2 className="text-[18px] font-semibold text-slate-900">카테고리별 매출</h2>
          <div className="admin-card mt-3 p-4">
            {products.byCategory.length === 0 ? (
              <p className="py-6 text-center text-[16px] text-slate-500">자료가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {products.byCategory.map((entry) => (
                  <Bar
                    key={entry.key}
                    label={entry.label}
                    value={entry.amount}
                    max={maxCategory}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[18px] font-semibold text-slate-900">브랜드별 매출</h2>
          <div className="admin-card mt-3 p-4">
            {products.byBrand.length === 0 ? (
              <p className="py-6 text-center text-[16px] text-slate-500">자료가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {products.byBrand.map((entry) => (
                  <Bar
                    key={entry.key}
                    label={entry.label}
                    value={entry.amount}
                    max={maxBrand}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ── 리뷰 ──────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <h2 className="text-[18px] font-semibold text-slate-900">리뷰가 많은 상품</h2>
          <div className="admin-card mt-3">
            {mostReviewed.length === 0 ? (
              <p className="py-6 text-center text-[16px] text-slate-500">
                아직 리뷰가 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {mostReviewed.map((entry) => (
                  <li
                    key={entry.productSlug}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-[16px]"
                  >
                    <Link
                      href={`/products/${entry.productSlug}`}
                      target="_blank"
                      className="min-w-0 truncate text-blue-700 hover:underline"
                    >
                      {entry.productSlug}
                    </Link>
                    <span className="shrink-0 tabular-nums text-slate-700">
                      {entry.count}건 · ★{entry.average}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[18px] font-semibold text-slate-900">별점이 낮은 상품</h2>
          <div className="admin-card mt-3">
            {lowestRated.length === 0 ? (
              <p className="py-6 text-center text-[16px] text-slate-500">
                리뷰가 2건 이상인 상품이 아직 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowestRated.map((entry) => (
                  <li
                    key={entry.productSlug}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-[16px]"
                  >
                    <Link
                      href={`/products/${entry.productSlug}`}
                      target="_blank"
                      className="min-w-0 truncate text-blue-700 hover:underline"
                    >
                      {entry.productSlug}
                    </Link>
                    <span
                      className={`shrink-0 tabular-nums ${
                        entry.average <= 3 ? 'font-medium text-red-700' : 'text-slate-700'
                      }`}
                    >
                      ★{entry.average} · {entry.count}건
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-2 text-[14px] text-slate-500">
            흔들림을 줄이려고 리뷰가 2건 이상인 상품만 보여 줍니다.
          </p>
        </section>
      </div>
    </div>
  );
}
