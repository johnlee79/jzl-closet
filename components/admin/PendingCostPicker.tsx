'use client';

import { useEffect, useState, useTransition } from 'react';
import ZoomImage from '@/components/admin/ZoomImage';
import {
  getPickerEntriesByBrandAction,
  type PickerEntry,
} from '@/app/admin/cost-sheet-actions';
import { formatPrice } from '@/lib/product-utils';

/**
 * **아직 저장되지 않은 상품**(상품 가져오기 화면) 용 단가표 picker.
 *
 * ★ 상품 저장 전이라 productId 가 없어 brandSlug 로 조회만 합니다. 사장님이 고른
 *   entryId 는 **state 로만** 보관하고, 상품 등록 때 payload 에 담겨 서버에서 적용됩니다
 *   (lib/product-costs.ts applyCostSheetEntryToProduct).
 */

export type PendingCostSelection = {
  entryId: string;
  rawName: string;
  costPrice: number | null;
};

export default function PendingCostPicker({
  brandSlug,
  productName,
  value,
  onChange,
}: {
  brandSlug: string | null;
  productName: string;
  value: PendingCostSelection | null;
  onChange: (next: PendingCostSelection | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<PickerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    startTransition(async () => {
      const result = await getPickerEntriesByBrandAction(brandSlug, search);
      if (!result.ok) {
        setError(result.error);
        setEntries([]);
        return;
      }
      setEntries(result.data.entries);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, brandSlug]);

  const choose = (entry: PickerEntry) => {
    onChange({
      entryId: entry.entryId,
      rawName: entry.rawName,
      costPrice: entry.costPrice,
    });
    setOpen(false);
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      {value ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] text-slate-700">
            단가표: <strong>{value.rawName}</strong>
            {value.costPrice != null ? (
              <> · <strong>{formatPrice(value.costPrice)}원</strong></>
            ) : null}
            <span className="ml-2 text-[12px] text-emerald-700">
              등록 시 함께 저장됩니다
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="admin-btn min-h-0 px-2 py-1 text-[13px]"
            >
              {open ? '닫기' : '다른 걸로 바꾸기'}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="admin-btn-danger min-h-0 px-2 py-1 text-[13px]"
            >
              빼기
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] text-slate-500">
            뉴욕트렌딕 단가표에서 이 상품의 원가를 미리 짝지어 둘 수 있습니다.
            상품 등록 때 함께 저장됩니다.
          </p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="admin-btn-primary min-h-0 px-3 py-1.5 text-[14px]"
          >
            {open ? '닫기' : '단가표에서 원가 찾기'}
          </button>
        </div>
      )}

      {open ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`상품명 검색 (예: ${productName.split(' ').slice(0, 2).join(' ')})`}
            className="admin-input w-full"
          />
          <p className="mt-1 text-[12px] text-slate-500">
            같은 브랜드 단가표 상품만 보입니다. 50개까지.
          </p>
          {error ? (
            <p className="mt-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p>
          ) : null}

          <ul className="mt-3 max-h-[360px] overflow-y-auto">
            {pending && entries.length === 0 ? (
              <li className="py-6 text-center text-[14px] text-slate-500">불러오는 중…</li>
            ) : entries.length === 0 ? (
              <li className="py-6 text-center text-[14px] text-slate-500">
                조건에 맞는 단가표 상품이 없습니다. 단가표 엑셀을 먼저 올려 두세요.
              </li>
            ) : (
              entries.map((e) => (
                <li key={e.entryId} className="border-b border-slate-100 last:border-b-0">
                  <div className="flex items-center gap-3 py-2">
                    <ZoomImage
                      src={e.imageUrl}
                      alt={e.rawName}
                      className="h-14 w-14 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-50 cursor-zoom-in"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-slate-900">{e.rawName}</p>
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        위탁가{' '}
                        {e.costPrice != null ? `${formatPrice(e.costPrice)}원` : '없음'}
                        {e.skus.length > 0 ? ` · 품번 ${e.skus.join(', ')}` : ''}
                        {e.matchedProductId ? (
                          <span className="ml-2 inline-flex items-center bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
                            이미 다른 상품에 짝지어짐
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => choose(e)}
                      className="admin-btn-primary shrink-0 min-h-0 px-3 py-1.5 text-[13px]"
                    >
                      이걸로
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
