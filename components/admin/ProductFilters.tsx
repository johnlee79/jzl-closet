'use client';

import { useSearchParams } from 'next/navigation';
import { useNavTransition } from '@/lib/use-nav-transition';
import { useEffect, useState } from 'react';

type ProductFiltersProps = {
  categories: { slug: string; label: string }[];
};

/** 검색(상품명·브랜드) + 카테고리·노출·품절 필터. 주소창에 조건을 남겨 새로고침해도 유지됩니다. */
export default function ProductFilters({ categories }: ProductFiltersProps) {
  // ★ 필터를 바꿔도 새 데이터가 올 때까지 지금 목록이 그대로 남습니다.
  const { pending, go } = useNavTransition();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '');

  useEffect(() => {
    setKeyword(searchParams.get('q') ?? '');
  }, [searchParams]);

  const apply = (changes: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page'); // 조건이 바뀌면 1페이지부터
    const query = params.toString();
    go(query ? `/admin/products?${query}` : '/admin/products');
  };

  const category = searchParams.get('category') ?? '';
  const visible = searchParams.get('visible') ?? '';
  const soldOut = searchParams.get('soldOut') ?? '';
  const hasFilter = Boolean(keyword || category || visible || soldOut);

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: keyword.trim() });
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="상품명 또는 브랜드로 검색 (가니 / GANNI 둘 다 됩니다)"
          aria-label="상품 검색"
          className="admin-input"
        />
        <button type="submit" className="admin-btn shrink-0">
          검색
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="filter-category">
          카테고리
        </label>
        <select
          id="filter-category"
          value={category}
          onChange={(event) => apply({ category: event.target.value })}
          className="admin-input w-auto min-w-[130px]"
        >
          <option value="">카테고리 전체</option>
          {categories.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.label}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-visible">
          노출 여부
        </label>
        <select
          id="filter-visible"
          value={visible}
          onChange={(event) => apply({ visible: event.target.value })}
          className="admin-input w-auto min-w-[110px]"
        >
          <option value="">노출 전체</option>
          <option value="true">노출 중</option>
          <option value="false">숨김</option>
        </select>

        <label className="sr-only" htmlFor="filter-soldout">
          품절 여부
        </label>
        <select
          id="filter-soldout"
          value={soldOut}
          onChange={(event) => apply({ soldOut: event.target.value })}
          className="admin-input w-auto min-w-[110px]"
        >
          <option value="">품절 전체</option>
          <option value="true">품절</option>
          <option value="false">판매 중</option>
        </select>

        {hasFilter ? (
          <button
            type="button"
            onClick={() => {
              setKeyword('');
              go('/admin/products');
            }}
            className="admin-btn"
          >
            조건 지우기
          </button>
        ) : null}
      </div>
    </div>
  );
}
