'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import ZoomImage from '@/components/admin/ZoomImage';
import {
  updateCostSheetEntryMatchAction,
  unmatchCostFromProductAction,
} from '@/app/admin/cost-sheet-actions';
import { formatPrice } from '@/lib/product-utils';
import { judgeMargin, marginToneClass } from '@/lib/margin';

/**
 * 단가표 보기 — 전체 행을 한 표로.
 *
 * ★ 짝 바꾸기 — 상품 목록에서 다시 고르는 간단한 셀렉트 (셀렉트 안쪽은 "같은 브랜드"
 *   필터 안 걸고 전체 상품을 둡니다 — 사장님이 자유롭게 고치시게).
 * ★ 짝 풀기 — matched 비우고 product_costs 레코드도 삭제 (lib/product-costs.ts).
 */

type Entry = {
  id: string;
  rawName: string;
  sheetName: string | null;
  costPrice: number | null;
  imageUrl: string | null;
  skus: string[];
  matchedProductId: string | null;
};

type ProductLite = {
  id: string;
  name: string;
  slug: string;
  brandSlug: string | null;
  thumbnail: string | null;
  price: number;
  costPrice: number | null;
};

export default function CostSheetView({
  entries,
  products,
}: {
  entries: Entry[];
  products: ProductLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched' | 'warn'>('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const productById = useMemo(() => {
    const m = new Map<string, ProductLite>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === 'matched' && !e.matchedProductId) return false;
      if (filter === 'unmatched' && e.matchedProductId) return false;
      if (filter === 'warn') {
        const prod = e.matchedProductId ? productById.get(e.matchedProductId) : null;
        if (!prod) return false;
        const j = judgeMargin(prod.price, e.costPrice);
        if (j.kind === 'ok' || j.kind === 'none') return false;
      }
      if (!q) return true;
      if (e.rawName.toLowerCase().includes(q)) return true;
      if (e.skus.some((s) => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [entries, filter, search, productById]);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? '처리하지 못했습니다.' });
      } else {
        setMessage({ tone: 'ok', text: okText });
        router.refresh();
      }
    });
  };

  const changeMatch = (entryId: string, productId: string) => {
    const next = productId || null;
    run(() => updateCostSheetEntryMatchAction(entryId, next), '짝을 바꿨습니다.');
  };

  const unmatch = (entry: Entry) => {
    if (!entry.matchedProductId) return;
    if (
      !window.confirm(
        '짝을 풀면 이 상품에 저장된 원가도 함께 삭제됩니다. 계속할까요?'
      )
    )
      return;
    run(
      () => unmatchCostFromProductAction(entry.matchedProductId!),
      '짝을 풀고 원가를 지웠습니다.'
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="admin-input w-[150px]"
        >
          <option value="all">전체 ({entries.length})</option>
          <option value="matched">
            짝 있음 ({entries.filter((e) => e.matchedProductId).length})
          </option>
          <option value="unmatched">
            짝 없음 ({entries.filter((e) => !e.matchedProductId).length})
          </option>
          <option value="warn">마진 이상</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="상품명·품번으로 검색"
          className="admin-input md:w-[320px]"
        />
      </div>

      {message ? (
        <p
          className={`rounded px-3 py-2 text-[14px] ${
            message.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[14px] text-slate-600">
              <th className="px-3 py-2 font-medium">엑셀 사진</th>
              <th className="px-3 py-2 font-medium">상품명</th>
              <th className="px-3 py-2 font-medium text-right">위탁가</th>
              <th className="px-3 py-2 font-medium">짝지은 우리 상품</th>
              <th className="px-3 py-2 font-medium text-right">판매가</th>
              <th className="px-3 py-2 font-medium text-right">마진</th>
              <th className="px-3 py-2 font-medium">작업</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => {
              const prod = entry.matchedProductId
                ? productById.get(entry.matchedProductId)
                : null;
              const judge = judgeMargin(prod?.price ?? null, entry.costPrice);
              return (
                <tr key={entry.id} className="border-b border-slate-100 align-middle">
                  <td className="px-3 py-2">
                    {entry.imageUrl ? (
                      <ZoomImage
                        src={entry.imageUrl}
                        alt={entry.rawName}
                        className="h-14 w-14 overflow-hidden rounded border border-slate-200 bg-slate-50 cursor-zoom-in"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded border border-dashed border-slate-200 bg-slate-50" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-900">
                    <div>{entry.rawName}</div>
                    {entry.skus.length > 0 ? (
                      <div className="mt-1 text-[12px] text-slate-500">
                        품번: {entry.skus.join(' · ')}
                      </div>
                    ) : null}
                    {entry.sheetName ? (
                      <div className="text-[12px] text-slate-400">{entry.sheetName}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {entry.costPrice != null ? `${formatPrice(entry.costPrice)}원` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={entry.matchedProductId ?? ''}
                      onChange={(e) => changeMatch(entry.id, e.target.value)}
                      disabled={pending}
                      className="admin-input w-full min-w-[220px]"
                    >
                      <option value="">— 짝 없음 —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {prod ? (
                      <Link
                        href={`/admin/products/${prod.id}`}
                        className="mt-1 inline-block text-[12px] text-blue-700 hover:underline"
                        prefetch={false}
                      >
                        상품 수정 →
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {prod ? `${formatPrice(prod.price)}원` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {judge.kind === 'none' ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={marginToneClass(judge)}>
                        {formatPrice(judge.margin)}원
                        <span className="ml-1 text-[12px]">({judge.rate}%)</span>
                        {judge.kind !== 'ok' ? (
                          <span className="ml-1 block text-[11px] text-red-700">
                            잘못 짝지은 것 같습니다
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {entry.matchedProductId ? (
                      <button
                        type="button"
                        onClick={() => unmatch(entry)}
                        disabled={pending}
                        className="admin-btn-danger min-h-0 px-2 py-1 text-[13px]"
                      >
                        짝 풀기
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                  조건에 맞는 행이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
