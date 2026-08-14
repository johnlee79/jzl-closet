import Link from 'next/link';
import { Suspense } from 'react';
import InquiryTable from '@/components/admin/InquiryTable';
import { countInquiriesByStatus, getInquiries } from '@/lib/inquiries';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '문의 관리' };

const PAGE_SIZE = 20;

type SearchParams = { status?: string; q?: string; page?: string };

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const configured = isSupabaseConfigured();
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);

  const [{ inquiries, total }, counts] = configured
    ? await Promise.all([
        getInquiries({
          status: searchParams.status,
          search: searchParams.q,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        countInquiriesByStatus(),
      ])
    : [{ inquiries: [], total: 0 }, {}];

  const allCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (number: number): string => {
    const query = new URLSearchParams();
    if (searchParams.status) query.set('status', searchParams.status);
    if (searchParams.q) query.set('q', searchParams.q);
    query.set('page', String(number));
    return `/admin/inquiries?${query.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <h1 className="text-[20px] font-semibold text-slate-900">문의 관리</h1>
      <p className="mt-1 text-[13px] text-slate-600">
        조건에 맞는 문의 {total}건 · {page}/{totalPages} 페이지
      </p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : null}

      <div className="mt-5">
        <Suspense fallback={<p className="text-[13px] text-slate-500">불러오는 중…</p>}>
          <InquiryTable inquiries={inquiries} counts={counts} total={allCount} />
        </Suspense>
      </div>

      {totalPages > 1 ? (
        <nav aria-label="페이지" className="mt-6 flex flex-wrap items-center gap-2">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={pageHref(number)}
              aria-current={number === page ? 'page' : undefined}
              className={`min-h-[38px] min-w-[38px] rounded-md border px-3 py-2 text-center text-[14px] ${
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

      <p className="mt-6 text-[12px] leading-relaxed text-slate-500">
        inquiries 테이블이 없다는 안내가 나오면 Supabase SQL Editor 에서{' '}
        <code>supabase/schema-2b.sql</code> 을 실행한 뒤{' '}
        <code>supabase/rls-2b.sql</code> 을 이어서 실행해 주세요.
      </p>
    </div>
  );
}
