'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useNavTransition } from '@/lib/use-nav-transition';
import { useState } from 'react';
import { formatDate } from '@/lib/format';
import {
  INQUIRY_TABS,
  inquiryBadgeClass,
  inquiryCategoryLabel,
  inquiryStatusLabel,
} from '@/lib/inquiry-status';
import type { Inquiry } from '@/lib/inquiries';

export default function InquiryTable({
  inquiries,
  counts,
  total,
}: {
  inquiries: Inquiry[];
  counts: Record<string, number>;
  total: number;
}) {
  const { pending, go } = useNavTransition();
  const pathname = usePathname();
  const params = useSearchParams();

  const status = params.get('status') ?? 'all';
  const [search, setSearch] = useState(params.get('q') ?? '');

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

  return (
    <div>
      <div className="admin-card p-4">
        <nav aria-label="문의 상태" className="overflow-x-auto">
          <ul className="flex min-w-max gap-1 border-b border-slate-200">
            {INQUIRY_TABS.map((tab) => {
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
                  prefetch={false}
                  >
                    {tab.label}
                    <span
                      className={`admin-badge ${
                        count > 0 && tab.key === 'pending'
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

        <form
          onSubmit={(event) => {
            event.preventDefault();
            go(buildHref({ q: search.trim() }));
          }}
          className="mt-4 flex items-end gap-2"
        >
          <div className="min-w-[200px] flex-1">
            <label className="admin-label" htmlFor="inquiry-search">
              검색 — 문의번호 · 제목 · 내용 · 작성자
            </label>
            <input
              id="inquiry-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="사이즈 또는 홍길동"
              className="admin-input"
            />
          </div>
          <button type="submit" className="admin-btn-primary">
            검색
          </button>
          {params.toString() ? (
            <Link href={pathname} className="admin-btn" prefetch={false}>
              초기화
            </Link>
          ) : null}
        </form>
      </div>

      <div className="admin-card mt-5 overflow-x-auto">
        {inquiries.length === 0 ? (
          <p className="px-4 py-16 text-center text-[16px] text-slate-500">
            조건에 맞는 문의가 없습니다.
          </p>
        ) : (
          <table className="w-full min-w-[880px] border-collapse text-[16px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[15px] text-slate-600">
                <th scope="col" className="px-3 py-2 font-medium">문의번호</th>
                <th scope="col" className="px-3 py-2 font-medium">유형</th>
                <th scope="col" className="px-3 py-2 font-medium">제목</th>
                <th scope="col" className="px-3 py-2 font-medium">작성자</th>
                <th scope="col" className="px-3 py-2 font-medium">관련주문</th>
                <th scope="col" className="px-3 py-2 font-medium">상태</th>
                <th scope="col" className="px-3 py-2 font-medium">등록일</th>
                <th scope="col" className="px-3 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inquiry) => (
                <tr
                  key={inquiry.id}
                  className={`border-b border-slate-100 last:border-b-0 ${
                    inquiry.status === 'pending' ? 'bg-amber-50/40' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link
                      href={`/admin/inquiries/${inquiry.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    prefetch={false}
                    >
                      {inquiry.inquiryNo}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {inquiryCategoryLabel(inquiry.category)}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-slate-800">
                    {inquiry.isSecret ? '🔒 ' : ''}
                    {inquiry.title}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {inquiry.writerName}
                    <span className="block text-[14px] text-slate-500">
                      {inquiry.userId ? '회원' : '비회원'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[15px]">
                    {inquiry.orderId ? (
                      <Link
                        href={`/admin/orders/${inquiry.orderId}`}
                        className="text-blue-700 hover:underline"
                      prefetch={false}
                      >
                        주문 보기
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className={`admin-badge ${inquiryBadgeClass(inquiry.status)}`}>
                      {inquiryStatusLabel(inquiry.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[15px] text-slate-600">
                    {formatDate(inquiry.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link href={`/admin/inquiries/${inquiry.id}`} className="admin-btn" prefetch={false}>
                      {inquiry.status === 'pending' ? '답변하기' : '상세'}
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
