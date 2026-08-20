'use client';

import Link from 'next/link';
import { useProductFilters } from '@/components/ProductFilterProvider';

export type CategoryNavItem = { slug: string; label: string };

/**
 * 대분류 줄 — ALL · CLOTHING · BAGS · SHOES · ACCESSORIES · SALE
 *
 * ★★ 왜 공용 컴포넌트인가
 *   전에는 대분류 화면(/category/clothing)에만 이 줄이 있고 소분류 화면
 *   (/category/clothing/tops)에는 없었습니다. 소분류로 들어가면 다른 대분류로
 *   갈 길이 없어져, 손님이 뒤로가기나 맨 위 헤더 메뉴를 찾아야 했습니다.
 *   두 화면이 같은 줄을 쓰도록 한곳에 모읍니다.
 *
 * ★ 지금 걸린 브랜드·성별·정렬을 쿼리로 물고 갑니다.
 *   GANNI 를 보다가 BAGS 로 넘어가면 GANNI 가방이 보이는 게 자연스럽습니다.
 *   (해당 브랜드에 그 분류 상품이 없으면 "필터 초기화" 안내가 뜹니다)
 *
 * ★ 밑줄을 text-decoration 이 아니라 테두리로 그립니다.
 *   text-decoration 은 색이 부드럽게 변하지 않아 딱딱 끊겨 보입니다.
 */
export default function CategoryNav({
  items,
  activeSlug,
}: {
  items: CategoryNavItem[];
  activeSlug: string;
}) {
  const { query } = useProductFilters();

  return (
    <nav aria-label="카테고리" className="mt-10">
      <ul className="flex flex-wrap items-center gap-x-6">
        {items.map((item) => {
          const active = item.slug === activeSlug;
          return (
            <li key={item.slug}>
              <Link
                href={`/category/${item.slug}${query}`}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex min-h-[44px] items-center border-b-2 pb-2 pt-3',
                  'text-[16px] tracking-[0.1em] transition-colors duration-200',
                  active ? 'border-wine text-ink' : 'border-transparent text-muted hover:text-ink',
                ].join(' ')}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
