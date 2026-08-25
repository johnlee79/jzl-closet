import Link from 'next/link';
import { Suspense } from 'react';
import BulkTrackingPanel from '@/components/admin/BulkTrackingPanel';
import OrderFilters from '@/components/admin/OrderFilters';
import OrderTable from '@/components/admin/OrderTable';
import CardSweepButton from '@/components/admin/CardSweepButton';
import { sweepAutoCancelQuietly } from '@/lib/auto-cancel';
import { countOrdersByStatus, getOrders } from '@/lib/orders';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/** 주문 목록은 항상 최신 값을 봐야 합니다. */
export const dynamic = 'force-dynamic';

/**
 * ★ 목록 자체는 DB 만 읽어 1초 안에 끝납니다. 이 값은 [지금 정리하기] 를 위한 것입니다.
 *   그 버튼은 서버 액션이고, 서버 액션은 이 페이지의 라우트 설정을 따릅니다.
 *   KSNET 조회를 기다려야 하므로 기본값(15초)으로는 모자랍니다.
 */
export const maxDuration = 60;

export const metadata = { title: '주문 관리' };

const PAGE_SIZE = 20;

type SearchParams = {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
  /** 현금영수증 신청 건만 보기 (4-A) — 'requested' | 'todo' */
  receipt?: string;
  /** 결제수단으로 거르기 (4-A) */
  method?: string;
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const configured = isSupabaseConfigured();

  /*
   * ★ 무통장입금 기한이 지난 건만 여기서 정리합니다.
   *   DB 안에서 끝나는 일이라 화면을 붙잡지 않습니다.
   *   그쪽 크론은 하루 한 번이라, 관리자가 들어올 때 정리해 주는 것이 의미가 있습니다.
   *   최근에 한 번 돌았으면 그냥 넘어갑니다. (lib/auto-cancel.ts)
   *
   * ★★ 카드 정리는 여기서 뺐습니다. 화면을 그리기 전에 KSNET 에 물어보고 있었습니다.
   *   결제대기 카드 주문 하나마다 20초 타임아웃으로 두 번 조회합니다.
   *   한 번에 최대 30건까지 보므로 최악의 경우 30 × (20 + 1.5 + 20)초 ≈ 21분입니다.
   *   그동안 주문 목록이 아예 안 열리고, Vercel 함수 시간 제한에 먼저 걸립니다.
   *   주문이 몰려 결제대기가 쌓이는 순간에 관리자 화면이 마비되는 구조였습니다.
   *
   *   카드 정리는 10분마다 도는 크론(/api/cron/card-sweep)이 이미 맡고 있습니다.
   *   급할 때는 목록 위의 [지금 정리하기] 버튼으로 직접 돌릴 수 있습니다.
   *   정리가 하는 일 자체는 하나도 바뀌지 않았습니다. 도는 시점만 옮겼습니다.
   */
  if (configured) {
    await sweepAutoCancelQuietly();
  }

  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);

  // ★ 주소로 들어오는 값이라 아는 값만 통과시킵니다.
  const receipt: 'todo' | 'requested' | undefined =
    searchParams.receipt === 'todo'
      ? 'todo'
      : searchParams.receipt === 'requested'
        ? 'requested'
        : undefined;

  const filter = {
    status: searchParams.status,
    search: searchParams.q,
    from: searchParams.from,
    to: searchParams.to,
    cashReceipt: receipt,
    paymentMethod: searchParams.method || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  /*
   * ★★ 탭 건수도 목록과 같은 조건으로 셉니다. (2026-08-25)
   *   상태만 빼고 전부 같은 필터를 넘깁니다. 검색·기간·결제수단을 걸어 두고
   *   탭에는 전체 숫자가 보이면, 탭과 목록이 서로 다른 세계를 보는 셈이라
   *   어느 쪽을 믿어야 할지 알 수 없습니다.
   *   limit·offset 도 뺍니다. 건수는 페이지와 상관이 없습니다.
   */
  const { status: _unusedStatus, limit: _unusedLimit, offset: _unusedOffset, ...countFilter } = filter;

  const [{ orders, total }, counts] = configured
    ? await Promise.all([getOrders(filter), countOrdersByStatus(countFilter)])
    : [{ orders: [], total: 0 }, {} as Record<string, number>];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** 페이지 번호만 바꾼 주소 */
  const pageHref = (number: number): string => {
    const query = new URLSearchParams();
    if (searchParams.status) query.set('status', searchParams.status);
    if (searchParams.q) query.set('q', searchParams.q);
    if (searchParams.from) query.set('from', searchParams.from);
    if (searchParams.to) query.set('to', searchParams.to);
    if (searchParams.receipt) query.set('receipt', searchParams.receipt);
    if (searchParams.method) query.set('method', searchParams.method);
    query.set('page', String(number));
    return `/admin/orders?${query.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold text-slate-900">주문 관리</h1>
          <p className="mt-1 text-[15px] text-slate-600">
            조건에 맞는 주문 {total}건 · {page}/{totalPages} 페이지
          </p>
        </div>
      </div>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[16px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : null}

      <div className="admin-card mt-5 p-4">
        <Suspense fallback={<p className="text-[15px] text-slate-500">불러오는 중…</p>}>
          {/*
            ★★ 지금 보고 있는 탭의 숫자는 목록이 스스로 센 값을 그대로 씁니다.
              목록과 그 건수는 한 응답에서 나온 값이라 어긋날 수가 없습니다.
              그래서 "탭에는 4건인데 목록에는 5줄" 같은 일이 구조적으로 불가능해집니다.
              나머지 탭은 위 한 번의 집계에서 옵니다. (역시 서로 같은 시점)
          */}
          <OrderFilters counts={counts} activeTotal={total} />
        </Suspense>
      </div>

      {/*
        ★ 결제대기 카드 정리 — 예전에는 이 화면을 그리기 전에 자동으로 돌았습니다.
          KSNET 조회를 기다리느라 목록이 안 열리는 일이 있어 버튼으로 뺐습니다.
          평소에는 10분마다 도는 크론이 합니다.
      */}
      {configured ? <CardSweepButton /> : null}

      <div className="mt-5">
        {/* 공급처가 회신한 송장을 한 번에 넣는 자리 */}
        <BulkTrackingPanel />

        <Suspense fallback={<p className="text-[15px] text-slate-500">불러오는 중…</p>}>
          <OrderTable orders={orders} />
        </Suspense>
      </div>

      {totalPages > 1 ? (
        <nav aria-label="페이지" className="mt-6 flex flex-wrap items-center gap-2">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={pageHref(number)}
              aria-current={number === page ? 'page' : undefined}
              className={`min-h-[38px] min-w-[38px] rounded-md border px-3 py-2 text-center text-[16px] ${
                number === page
                  ? 'border-blue-700 bg-blue-700 font-semibold text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {number}
            </Link>
          ))}
        </nav>
      ) : null}

      <p className="mt-6 text-[14px] leading-relaxed text-slate-500">
        주문 테이블이 없다는 안내가 나오면 Supabase SQL Editor 에서{' '}
        <code>supabase/schema-2a.sql</code> 을 실행한 뒤{' '}
        <code>supabase/rls-2a.sql</code> 을 이어서 실행해 주세요.
      </p>
    </div>
  );
}
