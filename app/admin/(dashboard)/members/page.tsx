import Link from 'next/link';
import { Suspense } from 'react';
import MemberTable from '@/components/admin/MemberTable';
import { countMembersByStatus, getMembers } from '@/lib/profiles';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '회원 관리' };

const PAGE_SIZE = 20;

type SearchParams = {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** 'yyyy-mm-dd' → 한국 시간 하루의 시작·끝 */
function kstStart(day: string): string {
  return new Date(`${day}T00:00:00+09:00`).toISOString();
}
function kstEnd(day: string): string {
  return new Date(`${day}T23:59:59.999+09:00`).toISOString();
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const configured = isSupabaseConfigured();
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);

  const listFilter = {
    status: searchParams.status,
    search: searchParams.q,
    from: searchParams.from ? kstStart(searchParams.from) : undefined,
    to: searchParams.to ? kstEnd(searchParams.to) : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  /*
   * ★★ 탭 건수도 목록과 같은 조건으로 셉니다. (2026-08-26)
   *   상태만 빼고 전부 같은 조건을 넘깁니다. 검색어나 가입기간을 걸어 두고
   *   탭에는 전체 숫자가 보이면, 탭과 목록이 서로 다른 세계를 보는 셈이라
   *   어느 쪽을 믿어야 할지 알 수 없습니다.
   *   limit·offset 도 뺍니다. 건수는 페이지와 상관이 없습니다.
   *
   *   ★ 주문 화면(admin/(dashboard)/orders/page.tsx)과 같은 규칙입니다.
   *     그쪽이 먼저 고쳐졌고, 여기가 옛 방식으로 남아 있었습니다.
   */
  const { status: _unusedStatus, limit: _unusedLimit, offset: _unusedOffset, ...countFilter } =
    listFilter;

  const [{ members, total }, counts] = configured
    ? await Promise.all([getMembers(listFilter), countMembersByStatus(countFilter)])
    : [{ members: [], total: 0 }, {}];

  const allCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (number: number): string => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== 'page') query.set(key, value);
    }
    query.set('page', String(number));
    return `/admin/members?${query.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <h1 className="text-[24px] font-semibold text-slate-900">회원 관리</h1>
      <p className="mt-1 text-[15px] text-slate-600">
        조건에 맞는 회원 {total}명 · {page}/{totalPages} 페이지
      </p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[16px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : null}

      <div className="mt-5">
        <Suspense fallback={<p className="text-[15px] text-slate-500">불러오는 중…</p>}>
          <MemberTable members={members} counts={counts} total={allCount} />
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
            prefetch={false}
            >
              {number}
            </Link>
          ))}
        </nav>
      ) : null}

      <p className="mt-6 text-[14px] leading-relaxed text-slate-500">
        profiles 테이블이 없다는 안내가 나오면 Supabase SQL Editor 에서{' '}
        <code>supabase/schema-2b.sql</code> 을 실행한 뒤{' '}
        <code>supabase/rls-2b.sql</code> 을 이어서 실행해 주세요.
      </p>
    </div>
  );
}
