'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { STATUS_TABS } from '@/lib/order-status';
import { PAYMENT_METHODS } from '@/lib/site-config';
import { useNavTransition } from '@/lib/use-nav-transition';

/**
 * 주문 목록 상단 — 상태 탭 · 검색 · 기간 필터.
 * 모두 주소(쿼리스트링)에 담습니다. 새로고침해도 조건이 유지됩니다.
 */
export default function OrderFilters({
  counts,
  activeTotal,
}: {
  /**
   * 탭 뱃지 숫자. 상태 키 말고 'all' · 'needs_check' · 'unshipped' 도 들어 있습니다.
   * ★ 지금 조건(검색·기간·결제수단)을 이미 반영한 값입니다.
   */
  counts: Record<string, number>;
  /**
   * 지금 보고 있는 목록이 스스로 센 건수.
   *
   * ★★ 활성 탭에는 이 값을 씁니다. 목록과 같은 응답에서 나온 값이라
   *   눈앞의 줄 수와 절대 어긋날 수 없습니다.
   *   위 counts 는 다른 조회라, 그 사이에 주문이 하나 들어오면
   *   "탭은 4건인데 목록에는 5줄" 이 됩니다. 실제로 그랬습니다.
   */
  activeTotal: number;
}) {
  // ★ 필터를 바꿔도 새 데이터가 올 때까지 지금 표가 그대로 남습니다.
  const { pending, go } = useNavTransition();
  const pathname = usePathname();
  const params = useSearchParams();

  const status = params.get('status') ?? 'all';
  /** 현금영수증 빠른 보기 (4-A) — '' | 'todo' | 'requested' */
  const receipt = params.get('receipt') ?? '';
  const method = params.get('method') ?? '';
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

  const apply = (patch: Record<string, string>) => go(buildHref(patch));

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
    // ★ 새 데이터를 기다리는 동안 지금 표를 살짝 흐리게만 합니다. 화면이 비지 않습니다.
    <div className={`flex flex-col gap-4 transition-opacity ${pending ? 'opacity-60' : ''}`}>
      {/* 상태 탭 */}
      <nav aria-label="주문 상태" className="overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-slate-200">
          {STATUS_TABS.map((tab) => {
            const active = tab.key === status;
            /*
             * ★ 지금 보고 있는 탭만 목록이 센 값을 씁니다.
             *   나머지는 한 번의 집계에서 온 값입니다. 그 값들끼리는 서로 같은
             *   시점이라 어긋나지 않고, 사람이 목록과 대조할 수 있는 것은
             *   어차피 지금 보고 있는 탭 하나뿐입니다.
             */
            const count = active ? activeTotal : (counts[tab.key] ?? 0);
            return (
              <li key={tab.key}>
                <button
                  type="button"
                  onClick={() => apply({ status: tab.key === 'all' ? '' : tab.key })}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[16px] transition-colors ${
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
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/*
        현금영수증 · 결제수단 필터 (4-A)
        ★ 현금영수증은 PG 가 발급해 주지 않습니다. 운영자가 홈택스에서 직접 발급합니다.
          그래서 "신청은 들어왔는데 아직 발급 안 한 건" 을 모아 보는 자리가 꼭 필요합니다.
          이 필터가 없으면 주문을 한 건씩 열어 보며 찾아야 합니다.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-slate-500">빠른 보기</span>
        {(
          [
            { key: '', label: '전체' },
            { key: 'todo', label: '현금영수증 미발급' },
            { key: 'requested', label: '현금영수증 신청 전체' },
          ] as { key: string; label: string }[]
        ).map((item) => {
          const active = receipt === item.key;
          return (
            <button
              key={item.key || 'all'}
              type="button"
              onClick={() => apply({ receipt: item.key })}
              aria-pressed={active}
              className={`min-h-[36px] rounded-md border px-3 py-1.5 text-[15px] transition-colors ${
                active
                  ? 'border-blue-700 bg-blue-50 font-semibold text-blue-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          );
        })}

        <label className="ml-2 flex items-center gap-2 text-[15px] text-slate-500">
          결제수단
          <select
            value={method}
            onChange={(event) => apply({ method: event.target.value })}
            aria-label="결제수단으로 거르기"
            className="admin-input w-[150px]"
          >
            <option value="">전체</option>
            {PAYMENT_METHODS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

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
          <Link href={pathname} className="admin-btn" prefetch={false}>
            조건 초기화
          </Link>
        ) : null}
      </div>
    </div>
  );
}
