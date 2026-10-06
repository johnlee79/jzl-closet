'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import ZoomImage from '@/components/admin/ZoomImage';
import {
  getPickerEntriesAction,
  pickCostForProductAction,
  unmatchCostFromProductAction,
  type PickerEntry,
} from '@/app/admin/cost-sheet-actions';
import { formatPrice } from '@/lib/product-utils';

/**
 * 상품 쪽에서 "단가표에서 원가 찾기" 를 눌렀을 때 열리는 패널.
 *
 * ★ 흐름 (사장님 지시 2026-10-06)
 *   · 같은 브랜드의 단가표 상품들을 사진·이름·위탁가와 함께 보여줌
 *   · 검색창으로 이름 검색
 *   · 라디오 고르고 「짝지음」 누르면 짝 저장 + 원가 저장 + 매칭 기억
 *   · 이미 짝이 있으면 상단에 보여주고 「다른 걸로 바꾸기」
 */
export default function CostSheetPicker({
  productId,
  productName,
  currentlyMatched,
}: {
  productId: string;
  productName: string;
  /** 이미 짝지어진 단가표 행 — 있으면 상단에 요약 */
  currentlyMatched: {
    rawName: string;
    costPrice: number | null;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<PickerEntry[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 패널이 열리면 바로 조회
  useEffect(() => {
    if (!open) return;
    setError(null);
    startTransition(async () => {
      const result = await getPickerEntriesAction(productId, search);
      if (!result.ok) {
        setError(result.error);
        setEntries([]);
        return;
      }
      setEntries(result.data.entries);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, productId]);

  const pick = () => {
    if (!chosen) return;
    startTransition(async () => {
      const result = await pickCostForProductAction(productId, chosen);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setChosen(null);
      router.refresh();
    });
  };

  const unmatch = () => {
    if (
      !window.confirm(
        '이 상품에 저장된 원가를 지우고 짝을 풉니다. 계속할까요?'
      )
    )
      return;
    startTransition(async () => {
      const result = await unmatchCostFromProductAction(productId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      {currentlyMatched ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] text-slate-700">
            단가표: <strong>{currentlyMatched.rawName}</strong>
            {currentlyMatched.costPrice != null ? (
              <> · <strong>{formatPrice(currentlyMatched.costPrice)}원</strong></>
            ) : null}
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
              onClick={unmatch}
              disabled={pending}
              className="admin-btn-danger min-h-0 px-2 py-1 text-[13px]"
            >
              짝 풀기
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] text-slate-500">
            이 상품에는 아직 단가표가 짝지어지지 않았습니다.
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

          <ul className="mt-3 max-h-[400px] overflow-y-auto">
            {pending && entries.length === 0 ? (
              <li className="py-6 text-center text-[14px] text-slate-500">불러오는 중…</li>
            ) : entries.length === 0 ? (
              <li className="py-6 text-center text-[14px] text-slate-500">
                조건에 맞는 단가표 상품이 없습니다.
              </li>
            ) : (
              entries.map((e) => (
                <li key={e.entryId} className="border-b border-slate-100 last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-3 py-2">
                    <input
                      type="radio"
                      name={`picker-${productId}`}
                      checked={chosen === e.entryId}
                      onChange={() => setChosen(e.entryId)}
                      className="h-4 w-4"
                    />
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
                        {e.matchedProductId && e.matchedProductId !== productId ? (
                          <span className="ml-2 inline-flex items-center bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
                            이미 다른 상품에 짝지어짐
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </label>
                </li>
              ))
            )}
          </ul>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setChosen(null);
              }}
              disabled={pending}
              className="admin-btn"
            >
              취소
            </button>
            <button
              type="button"
              onClick={pick}
              disabled={pending || !chosen}
              className="admin-btn-primary"
            >
              {pending ? '저장 중…' : '짝 지음'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
