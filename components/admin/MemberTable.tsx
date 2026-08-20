'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useNavTransition } from '@/lib/use-nav-transition';
import { useState } from 'react';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatPrice } from '@/lib/product-utils';
import type { Profile } from '@/lib/profiles';

export type MemberRow = Profile & { orderCount: number; totalSpent: number };

const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '활성' },
  { key: 'inactive', label: '비활성' },
  { key: 'withdrawn', label: '탈퇴' },
] as const;

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-amber-100 text-amber-800',
  withdrawn: 'bg-slate-100 text-slate-600',
};

const STATUS_LABEL: Record<string, string> = {
  active: '활성',
  inactive: '비활성',
  withdrawn: '탈퇴',
};

export default function MemberTable({
  members,
  counts,
  total,
}: {
  members: MemberRow[];
  counts: Record<string, number>;
  total: number;
}) {
  const { pending, go } = useNavTransition();
  const pathname = usePathname();
  const params = useSearchParams();

  const status = params.get('status') ?? 'all';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');

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

  const exportHref = (): string => {
    const query = new URLSearchParams();
    for (const key of ['status', 'q', 'from', 'to']) {
      const value = params.get(key);
      if (value) query.set(key, value);
    }
    const text = query.toString();
    return text ? `/api/admin/export/members?${text}` : '/api/admin/export/members';
  };

  return (
    <div>
      {/* ── 상태 탭 ───────────────────────────────────── */}
      <div className="admin-card p-4">
        <nav aria-label="회원 상태" className="overflow-x-auto">
          <ul className="flex min-w-max gap-1 border-b border-slate-200">
            {STATUS_TABS.map((tab) => {
              const active = tab.key === status;
              const count = tab.key === 'all' ? total : (counts[tab.key] ?? 0);
              return (
                <li key={tab.key}>
                  <Link
                    href={buildHref({ status: tab.key === 'all' ? '' : tab.key })}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[16px] transition-colors ${
                      active
                        ? 'border-blue-700 font-semibold text-blue-700'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                    <span className="admin-badge bg-slate-100 text-slate-600">{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              go(buildHref({ q: search.trim() }));
            }}
            className="flex flex-1 items-end gap-2"
          >
            <div className="min-w-[200px] flex-1">
              <label className="admin-label" htmlFor="member-search">
                검색 — 이름 · 이메일 · 연락처
              </label>
              <input
                id="member-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="홍길동 또는 hello@example.com"
                className="admin-input"
              />
            </div>
            <button type="submit" className="admin-btn-primary">
              검색
            </button>
          </form>

          <div>
            <span className="admin-label">가입 기간</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                aria-label="가입 시작일"
                className="admin-input w-[150px]"
              />
              <span className="text-slate-400">—</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                aria-label="가입 종료일"
                className="admin-input w-[150px]"
              />
              <button
                type="button"
                onClick={() => go(buildHref({ from, to }))}
                className="admin-btn"
              >
                적용
              </button>
            </div>
          </div>

          <a href={exportHref()} download className="admin-btn">
            CSV 내보내기
          </a>

          {params.toString() ? (
            <Link href={pathname} className="admin-btn">
              조건 초기화
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── 표 ────────────────────────────────────────── */}
      <div className="admin-card mt-5 overflow-x-auto">
        {members.length === 0 ? (
          <p className="px-4 py-16 text-center text-[16px] text-slate-500">
            조건에 맞는 회원이 없습니다.
          </p>
        ) : (
          <table className="w-full min-w-[900px] border-collapse text-[16px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[15px] text-slate-600">
                <th scope="col" className="px-3 py-2 font-medium">이름</th>
                <th scope="col" className="px-3 py-2 font-medium">이메일</th>
                <th scope="col" className="px-3 py-2 font-medium">연락처</th>
                <th scope="col" className="px-3 py-2 font-medium">상태</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">주문수</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">총 구매금액</th>
                <th scope="col" className="px-3 py-2 font-medium">최근 로그인</th>
                <th scope="col" className="px-3 py-2 font-medium">가입일</th>
                <th scope="col" className="px-3 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link
                      href={`/admin/members/${member.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {member.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {member.email || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {member.phone || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={`admin-badge ${STATUS_BADGE[member.status] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {STATUS_LABEL[member.status] ?? member.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {member.orderCount}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                    {formatPrice(member.totalSpent)}원
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[15px] text-slate-600">
                    {member.lastLoginAt ? formatDateTime(member.lastLoginAt) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[15px] text-slate-600">
                    {formatDate(member.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link href={`/admin/members/${member.id}`} className="admin-btn">
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
