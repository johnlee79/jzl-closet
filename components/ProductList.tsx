'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
const CHIP_TEXT = 'font-display text-[16px] leading-none tracking-[0.18em] md:text-[17px]';

/**
 * ★ 줄 이름과 첫 항목 사이가 붙어 있으면 이름이 항목처럼 보입니다.
 *   BRAND / CATEGORY 중 긴 쪽에 맞춰 폭을 고정해, 두 줄의 첫 항목이
 *   세로로 정확히 맞아떨어지게 합니다.
 */
function RowLabel({ children }: { children: string }) {
  return (
    <span className="mt-3.5 w-[74px] shrink-0 text-[13px] tracking-[0.2em] text-muted md:w-[84px]">
      {children}
    </span>
  );
}

/** 항목이 늘어서는 줄 — 모바일은 한 줄 가로 스크롤, 데스크탑은 줄바꿈. */
const CHIP_ROW =
  'flex min-w-0 flex-nowrap items-end gap-x-6 gap-y-3 overflow-x-auto pb-1 md:flex-wrap md:gap-x-8 md:overflow-x-visible md:pb-0';

/**
 * ============================================================
 * 필터를 주소(쿼리)에 담습니다
 * ============================================================
 *
 * ★★ 왜 이렇게 하는가 — 브랜드와 분류를 같이 걸 수 없던 문제
 *   브랜드·성별·정렬은 이 컴포넌트의 state 였고, 분류는 진짜 페이지 이동입니다.
 *   (/category/clothing → /category/clothing/outer)
 *   분류를 누르면 페이지가 바뀌면서 컴포넌트가 새로 뜨고, state 로만 들고 있던
 *   브랜드가 통째로 초기화됐습니다. 브랜드 GANNI 를 고른 뒤 OUTER 를 누르면
 *   브랜드가 ALL 로 돌아가 버렸습니다.
 *
 * ★★ 왜 useSearchParams 를 쓰지 않는가
 *   이 목록은 상품·분류 페이지에 들어갑니다. 그 페이지들은 SEO 때문에 반드시
 *   정적으로 구워져야 합니다. 클라이언트 컴포넌트에서 useSearchParams 를 쓰면
 *   Next 가 그 자리를 정적 생성에서 제외해, 상품 격자가 정적 HTML 에서 빠집니다.
 *   (검색엔진이 상품을 못 읽게 됩니다)
 *   그래서 훅 대신 주소를 직접 읽고 씁니다.
 *     읽기 — 처음 뜰 때 window.location.search 를 한 번 봅니다
 *     쓰기 — history.replaceState 로 주소만 바꿉니다 (페이지를 다시 부르지 않습니다)
 *   서버가 내려보내는 첫 HTML 은 늘 "필터 없음" 이라 모든 상품이 그대로 실립니다.
 *
 * ★ 분류 링크에는 지금 필터를 쿼리로 붙여 보냅니다. 그래야 페이지를 옮겨도
 *   브랜드·성별·정렬이 따라갑니다.
 */

/** 기본값은 주소에 넣지 않습니다. 주소가 짧아야 공유하기 좋습니다. */
function buildQuery(next: {
  brand: string;
  gender: 'all' | Gender;
  sort: SortKey;
}): string {
  const query = new URLSearchParams();
  if (next.brand !== 'all') query.set('brand', next.brand);
  if (next.gender !== 'all') query.set('gender', next.gender);
  if (next.sort !== 'new') query.set('sort', next.sort);
  const text = query.toString();
  return text ? `?${text}` : '';
}

export default function ProductList({
  products,
  subFilter,
  showBrandFilter = true,
}: ProductListProps) {
  const [gender, setGender] = useState<'all' | Gender>('all');
  const [brand, setBrand] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('new');

  /*
   * 주소에 적힌 필터를 읽어 옵니다.
   * ★ 처음 뜰 때 한 번만 봅니다. 분류를 눌러 페이지가 바뀌면 이 컴포넌트가
   *   새로 뜨므로 그때 또 읽습니다. 그래서 필터가 따라옵니다.
   */
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const nextBrand = query.get('brand');
    const nextGender = query.get('gender');
    const nextSort = query.get('sort');

    if (nextBrand) setBrand(nextBrand);
    if (nextGender === 'women' || nextGender === 'men' || nextGender === 'unisex') {
      setGender(nextGender);
    }
    if (nextSort === 'low' || nextSort === 'high' || nextSort === 'new') setSort(nextSort);
  }, []);

  /**
   * 필터를 바꿉니다. 상태를 고치고 주소도 같이 맞춰 둡니다.
   *
   * ★ history.replaceState 를 씁니다. router 를 부르면 페이지를 다시 가져오면서
   *   화면이 깜빡이는데, 걸러 내는 일은 전부 브라우저에서 끝나므로 그럴 이유가 없습니다.
   * ★ 주소를 맞춰 두는 이유 — 새로고침하거나 링크를 보냈을 때 같은 화면이 나와야 하고,
   *   분류를 누를 때 붙여 보낼 쿼리도 여기서 나옵니다.
   */
  const applyFilter = (patch: {
    brand?: string;
    gender?: 'all' | Gender;
    sort?: SortKey;
  }) => {
    const next = {
      brand: patch.brand ?? brand,
      gender: patch.gender ?? gender,
      sort: patch.sort ?? sort,
    };
    if (patch.brand !== undefined) setBrand(patch.brand);
    if (patch.gender !== undefined) setGender(patch.gender);
    if (patch.sort !== undefined) setSort(patch.sort);

    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `${window.location.pathname}${buildQuery(next)}`);
    }
  };

  /** 분류 링크에 붙일 쿼리 — 지금 걸린 브랜드·성별·정렬을 그대로 물고 갑니다. */
  const filterQuery = buildQuery({ brand, gender, sort });

  const { brands } = useSite();
  const brandChips = visibleBrands(brands);
  // 지금 고른 브랜드. 'all' 이면 없습니다.
  const selectedBrand = brandChips.find((item) => item.slug === brand);

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
    // 주소에서도 같이 지웁니다. 초기화했는데 주소에 필터가 남아 있으면
    // 새로고침할 때 되살아납니다.
    applyFilter({ gender: 'all', brand: 'all' });
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
                  onClick={() => applyFilter({ brand: 'all' })}
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
                    onClick={() => applyFilter({ brand: item.slug })}
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

        {/*
          고른 브랜드의 소개 페이지로 가는 길.

          ★ 위의 브랜드 칩은 링크가 아니라 이 목록을 걸러 내는 버튼입니다.
            그래서 필터만 있고 브랜드 소개(대표 사진·스토리·원산지)로 갈 방법이 없었습니다.
            칩 자체를 링크로 바꾸면 "이 목록에서 걸러 보기" 를 못 하게 되므로,
            고른 뒤에만 따로 한 줄을 띄웁니다. 아무것도 고르지 않았으면 나오지 않습니다.
        */}
        {showBrandFilter && selectedBrand ? (
          <div className="flex items-start gap-5 md:gap-7">
            <span className="w-[74px] shrink-0 md:w-[84px]" aria-hidden="true" />
            <Link
              href={`/brand/${selectedBrand.slug}`}
              className="tap-target text-[15px] tracking-[0.1em] text-muted underline underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              {selectedBrand.label} 브랜드 소개 보기
            </Link>
          </div>
        ) : null}

        {/* 2행 — 소분류 필터 (링크). 대분류에 children 이 없으면 그리지 않습니다. */}
        {subFilter ? (
          <div className="flex items-start gap-5 md:gap-7">
            <RowLabel>CATEGORY</RowLabel>
            <ul className={CHIP_ROW}>
              <li className="shrink-0">
                <Link
                  // ★ 분류를 옮겨도 브랜드·성별·정렬이 따라가도록 쿼리를 붙입니다.
                  href={`${subFilter.basePath}${filterQuery}`}
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
                    href={`${subFilter.basePath}/${item.slug}${filterQuery}`}
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
                  onClick={() => applyFilter({ gender: item.key })}
                  aria-pressed={gender === item.key}
                  className={`tap-target text-[16px] tracking-[0.12em] transition-colors duration-200 ${
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
            <span className="text-[14px] tracking-[0.14em] text-muted">
              {visible.length}개 상품
            </span>
            {sortOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => applyFilter({ sort: option.key })}
                aria-pressed={sort === option.key}
                className={`tap-target text-[16px] tracking-[0.1em] transition-colors duration-200 ${
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
          <p className="text-[17px] leading-relaxed text-ink">
            조건에 맞는 상품이 없습니다.
          </p>
          <p className="mt-2 text-[16px] leading-relaxed text-ink">
            선택하신 조건을 지우면 다시 전체 상품을 보실 수 있습니다.
          </p>
          <div className="btn-row mt-8">
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
