'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import BrandMark from '@/components/BrandMark';
import ProductCard from '@/components/ProductCard';
import { useSite } from '@/components/SiteProvider';
import { visibleBrands } from '@/lib/brands';
import { genderFilters } from '@/lib/product-utils';
import type { Gender, Product } from '@/lib/types';

type SortKey = 'new' | 'low' | 'high';

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'new', label: '신상품순' },
  { key: 'low', label: '낮은가격순' },
  { key: 'high', label: '높은가격순' },
];

/** 1행(소분류) 링크형 필터. slug 는 주소, label 은 화면 글자입니다. */
export type SubFilter = {
  items: { slug: string; label: string }[];
  basePath: string; // 예: /category/clothing
  activeSlug?: string; // 없으면 "전체"가 선택된 상태
};

type ProductListProps = {
  products: Product[];
  /**
   * 1행 — 소분류 필터. 대분류에 노출 중인 children 이 없으면 넘기지 마세요.
   * 넘기지 않으면 1행 자체를 그리지 않고 2행(브랜드)만 남습니다.
   */
  subFilter?: SubFilter;
  /** 2행 — 브랜드 필터 */
  showBrandFilter?: boolean;
};

/**
 * 브랜드도 분류도 네모 버튼으로 채우지 않습니다.
 * 고르지 않은 상태는 muted 글자만, 고른 상태는 ink + 밑줄.
 * 배경을 채우는 것보다 밑줄이 훨씬 정제되어 보입니다.
 */
function filterChipClass(active: boolean): string {
  return [
    'inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-1 pb-2 pt-3 transition-colors duration-200',
    active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
  ].join(' ');
}

/**
 * 필터 글자 — 브랜드와 분류가 같은 인상이어야 해서 한 곳에 모아 둡니다.
 * ★ 한글 분류명은 Cormorant Garamond 에 글자가 없어 본문 서체로 떨어집니다.
 *   그래도 자간과 크기가 같으면 한 줄에 섞여도 어색하지 않습니다.
 */
const CHIP_TEXT = 'font-display text-[15px] leading-none tracking-[0.18em] md:text-[16px]';

/**
 * ★ 줄 이름과 첫 항목 사이가 붙어 있으면 이름이 항목처럼 보입니다.
 *   BRAND / CATEGORY 중 긴 쪽에 맞춰 폭을 고정해, 두 줄의 첫 항목이
 *   세로로 정확히 맞아떨어지게 합니다.
 */
function RowLabel({ children }: { children: string }) {
  return (
    <span className="mt-3.5 w-[74px] shrink-0 text-[12px] tracking-[0.2em] text-muted md:w-[84px]">
      {children}
    </span>
  );
}

/** 항목이 늘어서는 줄 — 모바일은 한 줄 가로 스크롤, 데스크탑은 줄바꿈. */
const CHIP_ROW =
  'flex min-w-0 flex-nowrap items-end gap-x-6 gap-y-3 overflow-x-auto pb-1 md:flex-wrap md:gap-x-8 md:overflow-x-visible md:pb-0';

export default function ProductList({
  products,
  subFilter,
  showBrandFilter = true,
}: ProductListProps) {
  const [gender, setGender] = useState<'all' | Gender>('all');
  const [brand, setBrand] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('new');

  const { brands } = useSite();
  const brandChips = visibleBrands(brands);

  const visible = useMemo(() => {
    const filtered = products.filter((product) => {
      if (gender !== 'all' && product.gender !== gender) return false;
      if (brand !== 'all' && product.brandSlug !== brand) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === 'low') {
      sorted.sort((a, b) => a.price - b.price);
    } else if (sort === 'high') {
      sorted.sort((a, b) => b.price - a.price);
    } else {
      sorted.sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)));
    }
    return sorted;
  }, [products, gender, brand, sort]);

  const resetFilters = () => {
    setGender('all');
    setBrand('all');
  };

  return (
    <div>
      <div className="flex flex-col gap-7 border-b border-stone pb-7 md:gap-8">
        {/* 1행 — 브랜드 필터.
         * ★ JZL CLOSET 은 브랜드 편집숍이라 손님이 브랜드로 먼저 찾습니다.
         *   그래서 분류보다 위에 둡니다. */}
        {showBrandFilter && brandChips.length > 0 ? (
          <div className="flex items-start gap-5 md:gap-7">
            <RowLabel>BRAND</RowLabel>
            {/*
              * ★ 브랜드는 셀스타에서 가져오며 계속 늘어납니다. (20개 이상도 예상)
              *   모바일에서는 한 줄로 가로 스크롤 — 20개를 접으면 화면을 다 먹습니다.
              *   데스크탑에서는 줄바꿈 — 가로 스크롤은 마우스로 넘기기 불편하고,
              *   브랜드 편집숍이라 어떤 브랜드가 있는지 한눈에 보이는 편이 낫습니다.
              *   개수에 따라 분기하지 않고 화면 폭으로만 갈라 두면 몇 개가 되든 깨지지 않습니다.
              */}
            {/* ★ min-w-0 이 없으면 가로로 늘어선 브랜드가 부모를 밀어내
              *   스크롤 대신 화면 전체가 옆으로 밀립니다. (모바일에서 특히) */}
            <ul className={CHIP_ROW}>
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setBrand('all')}
                  aria-pressed={brand === 'all'}
                  className={filterChipClass(brand === 'all')}
                >
                  <span className={CHIP_TEXT}>ALL</span>
                </button>
              </li>
              {brandChips.map((item) => (
                <li key={item.slug} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setBrand(item.slug)}
                    aria-pressed={brand === item.slug}
                    aria-label={item.label}
                    className={filterChipClass(brand === item.slug)}
                  >
                    <BrandMark brand={item} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 2행 — 소분류 필터 (링크). 대분류에 children 이 없으면 그리지 않습니다. */}
        {subFilter ? (
          <div className="flex items-start gap-5 md:gap-7">
            <RowLabel>CATEGORY</RowLabel>
            <ul className={CHIP_ROW}>
              <li className="shrink-0">
                <Link
                  href={subFilter.basePath}
                  aria-current={subFilter.activeSlug ? undefined : 'page'}
                  className={filterChipClass(!subFilter.activeSlug)}
                >
                  {/* ★ 브랜드 줄의 ALL 과 글자를 맞춥니다. 두 줄이 한 덩어리로 읽힙니다. */}
                  <span className={CHIP_TEXT}>ALL</span>
                </Link>
              </li>
              {subFilter.items.map((item) => (
                <li key={item.slug} className="shrink-0">
                  <Link
                    href={`${subFilter.basePath}/${item.slug}`}
                    aria-current={subFilter.activeSlug === item.slug ? 'page' : undefined}
                    className={filterChipClass(subFilter.activeSlug === item.slug)}
                  >
                    <span className={CHIP_TEXT}>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {genderFilters.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setGender(item.key)}
                  aria-pressed={gender === item.key}
                  className={`tap-target text-[15px] tracking-[0.12em] transition-colors duration-200 ${
                    gender === item.key
                      ? 'text-ink underline decoration-wine underline-offset-[6px]'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-4">
            <span className="text-[13px] tracking-[0.14em] text-muted">
              {visible.length}개 상품
            </span>
            {sortOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSort(option.key)}
                aria-pressed={sort === option.key}
                className={`tap-target text-[15px] tracking-[0.1em] transition-colors duration-200 ${
                  sort === option.key ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-20">
          <p className="text-[16px] leading-relaxed text-ink">
            조건에 맞는 상품이 없습니다.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink">
            선택하신 조건을 지우면 다시 전체 상품을 보실 수 있습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={resetFilters} className="btn-secondary">
              필터 초기화
            </button>
            {subFilter?.activeSlug ? (
              <Link href={subFilter.basePath} className="btn-secondary">
                카테고리 전체 보기
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-14 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
          {visible.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
