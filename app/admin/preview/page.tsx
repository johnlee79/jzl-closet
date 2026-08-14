'use client';

import { useEffect, useState } from 'react';
import DetailBlocks from '@/components/DetailBlocks';
import MeasurementTable from '@/components/MeasurementTable';
import ProductGallery from '@/components/ProductGallery';
import { getBrandLabel, getBrandName } from '@/lib/brands';
import { getCategoryBySlug, getSubCategory } from '@/lib/categories';
import { PREVIEW_STORAGE_KEY } from '@/components/admin/ProductForm';
import {
  formatPrice,
  getDiscountRate,
  isCombinationAvailable,
} from '@/lib/product-utils';
import { store } from '@/lib/store';
import type { ProductInput } from '@/lib/types';

/**
 * 저장하지 않은 상태를 새 탭에서 확인하는 화면입니다.
 * 편집 화면이 localStorage 에 임시 저장한 내용을 그대로 그립니다.
 */
export default function AdminPreviewPage() {
  const [draft, setDraft] = useState<ProductInput | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (raw) setDraft(JSON.parse(raw) as ProductInput);
    } catch {
      setDraft(null);
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!draft) {
    return (
      <div className="shell py-20">
        <p className="text-[16px] text-ink">
          미리볼 내용이 없습니다. 관리자 편집 화면에서 [미리보기]를 눌러 주세요.
        </p>
      </div>
    );
  }

  const brandName = draft.brandSlug ? getBrandName(draft.brandSlug) : store.name;
  const brandLabel = draft.brandSlug ? getBrandLabel(draft.brandSlug) : '';
  const category = getCategoryBySlug(draft.categorySlug);
  const sub = draft.subCategorySlug
    ? getSubCategory(draft.categorySlug, draft.subCategorySlug)
    : undefined;
  const discount = getDiscountRate(draft);

  return (
    <article className="shell py-10 md:py-14">
      <p className="mb-6 rounded-sm border border-wine px-4 py-3 text-[14px] text-wine">
        미리보기 — 아직 저장되지 않은 내용입니다. 실제 페이지 주소는 /products/
        {draft.slug || '(slug 미정)'} 가 됩니다.
      </p>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        <ProductGallery
          images={draft.thumbnails.length > 0 ? draft.thumbnails : ['']}
          productName={draft.name || '상품명 미입력'}
          brand={brandName}
        />

        <section aria-label="상품 정보" className="lg:pt-4">
          {brandLabel ? (
            <p className="text-[13px] tracking-[0.16em] text-muted">{brandLabel}</p>
          ) : null}
          <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[32px]">
            {draft.name || '상품명 미입력'}
          </h1>
          <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
            {draft.summary}
          </p>

          <div className="mt-8 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-[32px] font-medium tracking-wide text-ink md:text-[38px]">
              {formatPrice(draft.price)}
              <span className="ml-1 font-sans text-[16px]">원</span>
            </span>
            {draft.originalPrice ? (
              <span className="text-[16px] text-muted line-through">
                {formatPrice(draft.originalPrice)}원
              </span>
            ) : null}
            {discount > 0 ? (
              <span className="border border-wine px-2 py-1 text-[13px] tracking-[0.14em] text-wine">
                {discount}% OFF
              </span>
            ) : null}
          </div>

          <dl className="mt-8 flex flex-col gap-2 border-t border-stone pt-6 text-[13px]">
            <div className="flex gap-4">
              <dt className="w-20 shrink-0 text-muted">카테고리</dt>
              <dd className="text-ink">
                {[category?.nameKo, sub?.nameKo].filter(Boolean).join(' · ') || '미선택'}
              </dd>
            </div>
            {draft.origin ? (
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 text-muted">원산지</dt>
                <dd className="text-ink">{draft.origin}</dd>
              </div>
            ) : null}
            <div className="flex gap-4">
              <dt className="w-20 shrink-0 text-muted">배송</dt>
              <dd className="text-ink">
                {draft.freeShipping ? '무료배송' : '주문 확인 후 안내'}
              </dd>
            </div>
          </dl>

          {draft.optionGroups.length > 0 ? (
            <div className="mt-8 flex flex-col gap-1.5 border-t border-stone pt-6">
              {draft.optionGroups.map((group) => (
                <p key={group.name} className="text-[14px] text-ink">
                  <span className="text-muted">{group.name}</span> —{' '}
                  {group.values.join(' / ')}
                </p>
              ))}
              {draft.optionCombinations.length > 0 ? (
                <p className="mt-2 text-[13px] text-muted">
                  조합 {draft.optionCombinations.length}개 · 판매 가능{' '}
                  {draft.optionCombinations.filter(isCombinationAvailable).length}개
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <section className="section border-t border-stone">
        <DetailBlocks blocks={draft.detail} productName={draft.name} />

        {draft.measurements.length > 0 ? (
          <div className="mx-auto mt-16 w-full max-w-[860px] md:mt-24">
            <MeasurementTable measurements={draft.measurements} productName={draft.name} />
          </div>
        ) : null}
      </section>
    </article>
  );
}
