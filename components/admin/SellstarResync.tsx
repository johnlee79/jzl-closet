'use client';

import { useState, useTransition } from 'react';
import { fetchSellstarAction } from '@/app/admin/import-actions';
import { formatDateTime } from '@/lib/format';
import { formatPrice } from '@/lib/product-utils';
import type { OptionCombination } from '@/lib/types';

/**
 * 셀스타에서 다시 불러오기.
 *
 * ★ 전체 덮어쓰기를 하지 않습니다.
 *   우리가 고쳐 둔 상품명·가격·상세페이지가 통째로 날아가면 안 됩니다.
 *   지금 값과 셀스타 값을 나란히 보여 주고, 고를 항목만 반영합니다.
 * ★ 상세 이미지는 여기서 건드리지 않습니다. 구성 편집이 필요하면 가져오기 화면을 씁니다.
 */

type Diff = {
  key: 'price' | 'originalPrice' | 'stock';
  label: string;
  now: string;
  next: string;
  apply: boolean;
};

export default function SellstarResync({
  sellstarId,
  syncedAt,
  currentPrice,
  currentOriginalPrice,
  currentCombinations,
  onApply,
}: {
  sellstarId: number;
  syncedAt: string | null;
  currentPrice: number;
  currentOriginalPrice: number | null;
  currentCombinations: OptionCombination[];
  /** 고른 항목만 폼에 반영합니다. */
  onApply: (patch: {
    price?: number;
    originalPrice?: number | null;
    combinations?: OptionCombination[];
  }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [diffs, setDiffs] = useState<Diff[] | null>(null);
  const [fetched, setFetched] = useState<{
    price: number;
    salePrice: number;
    combinations: OptionCombination[];
    stockSummary: string;
  } | null>(null);

  if (!sellstarId) return null;

  const load = () => {
    setError('');
    setDiffs(null);
    startTransition(async () => {
      const result = await fetchSellstarAction(sellstarId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const product = result.data;
      const combinations: OptionCombination[] = product.variants.map((variant) => ({
        key: variant.key,
        extraPrice: 0,
        stock: variant.stock,
        isActive: !variant.soldOut,
      }));

      const stockNow = currentCombinations
        .map((item) => `${item.key} ${item.stock ?? '미관리'}${item.isActive ? '' : '(품절)'}`)
        .join(' · ');
      const stockNext = combinations
        .map((item) => `${item.key} ${item.stock ?? '미관리'}${item.isActive ? '' : '(품절)'}`)
        .join(' · ');

      const list: Diff[] = [];

      if (product.salePrice !== currentPrice) {
        list.push({
          key: 'price',
          label: '판매가',
          now: `${formatPrice(currentPrice)}원`,
          next: `${formatPrice(product.salePrice)}원 (셀스타 판매가)`,
          apply: false,
        });
      }
      if ((currentOriginalPrice ?? 0) !== product.price) {
        list.push({
          key: 'originalPrice',
          label: '정가',
          now: currentOriginalPrice ? `${formatPrice(currentOriginalPrice)}원` : '없음',
          next: `${formatPrice(product.price)}원`,
          apply: false,
        });
      }
      if (stockNow !== stockNext) {
        list.push({
          key: 'stock',
          label: '옵션 재고',
          now: stockNow || '없음',
          next: stockNext || '없음',
          apply: false,
        });
      }

      setFetched({
        price: product.price,
        salePrice: product.salePrice,
        combinations,
        stockSummary: stockNext,
      });
      setDiffs(list);
    });
  };

  const apply = () => {
    if (!diffs || !fetched) return;
    const patch: Parameters<typeof onApply>[0] = {};

    for (const diff of diffs) {
      if (!diff.apply) continue;
      if (diff.key === 'price') patch.price = fetched.salePrice;
      if (diff.key === 'originalPrice') patch.originalPrice = fetched.price;
      if (diff.key === 'stock') patch.combinations = fetched.combinations;
    }

    onApply(patch);
    setDiffs(null);
    setFetched(null);
  };

  const chosen = diffs?.filter((diff) => diff.apply).length ?? 0;

  return (
    <section className="admin-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">셀스타 연결</h2>
          <p className="mt-1 text-[15px] text-slate-500">
            상품번호 {sellstarId}
            {syncedAt ? ` · 마지막 동기화 ${formatDateTime(syncedAt)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={pending}
          className="admin-btn"
        >
          {pending ? '확인 중…' : '셀스타에서 다시 불러오기'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[15px] text-red-700">
          {error}
        </p>
      ) : null}

      {diffs !== null ? (
        diffs.length === 0 ? (
          <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-[15px] text-green-800">
            셀스타 값과 같습니다. 갱신할 것이 없습니다.
          </p>
        ) : (
          <div className="mt-3">
            <p className="text-[15px] leading-relaxed text-slate-600">
              달라진 항목입니다. <strong>반영할 것만</strong> 골라 주세요. 고르지 않은
              항목은 지금 값을 그대로 둡니다.
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {diffs.map((diff, index) => (
                <li
                  key={diff.key}
                  className="rounded-md border border-slate-200 p-3 text-[15px]"
                >
                  <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-900">
                    <input
                      type="checkbox"
                      checked={diff.apply}
                      onChange={(event) =>
                        setDiffs((prev) =>
                          (prev ?? []).map((item, position) =>
                            position === index
                              ? { ...item, apply: event.target.checked }
                              : item
                          )
                        )
                      }
                      className="h-4 w-4"
                    />
                    {diff.label}
                  </label>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded bg-slate-50 px-2 py-1.5">
                      <span className="block text-[14px] text-slate-500">지금</span>
                      <span className="break-words text-slate-800">{diff.now}</span>
                    </div>
                    <div className="rounded bg-blue-50 px-2 py-1.5">
                      <span className="block text-[14px] text-slate-500">셀스타</span>
                      <span className="break-words text-slate-800">{diff.next}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={apply}
              disabled={chosen === 0}
              className="admin-btn-primary mt-3"
            >
              고른 {chosen}개 반영하기
            </button>
            <p className="mt-2 text-[14px] text-slate-500">
              반영해도 아직 저장된 것은 아닙니다. 아래 <strong>저장</strong>을 눌러야
              적용됩니다.
            </p>
          </div>
        )
      ) : null}
    </section>
  );
}
