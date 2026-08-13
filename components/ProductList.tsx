'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import { getVisibleBrands } from '@/lib/brands';
import { genderFilters, type Gender, type Product } from '@/lib/products';

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

// 모바일 터치 영역 확보를 위해 최소 높이 44px
const chipBase =
  'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-sm px-5 py-3 text-[14px] tracking-[0.1em] transition-colors duration-200';

function chipClass(active: boolean): string {
  return active
    ? `${chipBase} border border-ink bg-ink text-paper`
    : `${chipBase} border border-stone text-ink hover:border-ink`;
}

function RowLabel({ children }: { children: string }) {
  return (
    <span className="mt-3.5 w-[62px] shrink-0 text-[12px] tracking-[0.2em] text-muted">
      {children}
    </span>
  );
}

export default function ProductList({
  products,
  subFilter,
  showBrandFilter = true,
}: ProductListProps) {
  const [gender, setGender] = useState<'all' | Gender>('all');
  const [brand, setBrand] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('new');

  const brandChips = getVisibleBrands();
  /** 브랜드가 8개를 넘으면 가로 스크롤로 처리합니다. (모바일 대응) */
  const brandScroll = brandChips.length > 8;

  const visible = useMemo(() => {
    const filtered = products.filter((product) => {
      if (gender !== 'all' && product.gender !== gender) return false;
      if (brand !== 'all' && product.brand !== brand) return false;
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
      <div className="flex flex-col gap-4 border-b border-stone pb-6">
        {/* 1행 — 소분류 필터 (링크). 대분류에 children 이 없으면 그리지 않습니다. */}
        {subFilter ? (
          <div className="flex items-start gap-3 md:gap-4">
            <RowLabel>CATEGORY</RowLabel>
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={subFilter.basePath}
                  aria-current={subFilter.activeSlug ? undefined : 'page'}
                  className={chipClass(!subFilter.activeSlug)}
                >
                  전체
                </Link>
              </li>
              {subFilter.items.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`${subFilter.basePath}/${item.slug}`}
                    aria-current={subFilter.activeSlug === item.slug ? 'page' : undefined}
                    className={chipClass(subFilter.activeSlug === item.slug)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 2행 — 브랜드 필터. 소분류와 완전히 독립이며 동시에 적용됩니다. */}
        {showBrandFilter && brandChips.length > 0 ? (
          <div className="flex items-start gap-3 md:gap-4">
            <RowLabel>BRAND</RowLabel>
            <ul
              className={
                brandScroll
                  ? 'flex flex-nowrap gap-2 overflow-x-auto pb-1'
                  : 'flex flex-wrap gap-2'
              }
            >
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setBrand('all')}
                  aria-pressed={brand === 'all'}
                  className={chipClass(brand === 'all')}
                >
                  전체
                </button>
              </li>
              {brandChips.map((item) => (
                <li key={item.slug} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setBrand(item.slug)}
                    aria-pressed={brand === item.slug}
                    className={chipClass(brand === item.slug)}
                  >
                    {item.label}
                  </button>
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
