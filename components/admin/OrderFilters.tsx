'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { STATUS_TABS } from '@/lib/order-status';

/**
 * 주문 목록 상단 — 상태 탭 · 검색 · 기간 필터.
 * 모두 주소(쿼리스트링)에 담습니다. 새로고침해도 조건이 유지됩니다.
 */
export default function OrderFilters({
  counts,
  total,
}: {
  /** 상태별 건수. 탭 뱃지에 씁니다. */
  counts: Record<string, number>;
  /** 전체 건수 */
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const status = params.get('status') ?? 'all';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');

  /** 지금 조건에서 일부만 바꾼 주소를 만듭니다. 조건이 바뀌면 1페이지로 돌아갑니다. */
  const buildHref = (patch: Record<string, string>): string => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const apply = (patch: Record<string, string>) => router.push(buildHref(patch));

  /** 오늘 / 7일 / 30일 버튼 */
  const quickRange = (days: number) => {
    const now = new Date();
    const kst = (date: Date) =>
      new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = kst(now);
    const start = kst(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
    setFrom(start);
    setTo(end);
    apply({ from: start, to: end });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 상태 탭 */}
      <nav aria-label="주문 상태" className="overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-slate-200">
          {STATUS_TABS.map((tab) => {
            const active = tab.key === status;
            const count = tab.key === 'all' ? total : (counts[tab.key] ?? 0);
            return (
              <li key={tab.key}>
                <Link
                  href={buildHref({ status: tab.key === 'all' ? '' : tab.key })}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[14px] transition-colors ${
                    active
                      ? 'border-blue-700 font-semibold text-blue-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`admin-badge ${
                      count > 0 && tab.key === 'pending_payment'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 검색 · 기간 */}
      <div className="flex flex-wrap items-end gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply({ q: search.trim() });
          }}
          className="flex flex-1 items-end gap-2"
        >
          <div className="min-w-[200px] flex-1">
            <label className="admin-label" htmlFor="order-search">
              검색 — 주문번호 · 주문자명 · 연락처 · 입금자명
            </label>
            <input
              id="order-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ORD-20260814-0001 또는 홍길동"
              className="admin-input"
            />
          </div>
          <button type="submit" className="admin-btn-primary">
            검색
          </button>
        </form>

        <div>
          <span className="admin-label">기간</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => quickRange(0)} className="admin-btn">
              오늘
            </button>
            <button type="button" onClick={() => quickRange(6)} className="admin-btn">
              7일
            </button>
            <button type="button" onClick={() => quickRange(29)} className="admin-btn">
              30일
            </button>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="시작일"
              className="admin-input w-[150px]"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              aria-label="종료일"
              className="admin-input w-[150px]"
            />
            <button
              type="button"
              onClick={() => apply({ from, to })}
              className="admin-btn"
            >
              적용
            </button>
          </div>
        </div>

        {params.toString() ? (
          <Link href={pathname} className="admin-btn">
            조건 초기화
          </Link>
        ) : null}
      </div>
    </div>
  );
}
