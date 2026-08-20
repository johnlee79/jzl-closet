'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Gender } from '@/lib/types';

export type SortKey = 'new' | 'low' | 'high';

export type ProductFilters = {
  brand: string;
  gender: 'all' | Gender;
  sort: SortKey;
};

const DEFAULT_FILTERS: ProductFilters = { brand: 'all', gender: 'all', sort: 'new' };

type FilterContextValue = ProductFilters & {
  /** 필터를 바꿉니다. 넘긴 것만 바뀝니다. */
  apply: (patch: Partial<ProductFilters>) => void;
  /** 다른 화면으로 넘어가는 링크에 붙일 쿼리. 필터가 없으면 빈 문자열입니다. */
  query: string;
};

const FilterContext = createContext<FilterContextValue | null>(null);

/** 기본값은 주소에 넣지 않습니다. 주소가 짧아야 공유하기 좋습니다. */
export function buildQuery(filters: ProductFilters): string {
  const query = new URLSearchParams();
  if (filters.brand !== 'all') query.set('brand', filters.brand);
  if (filters.gender !== 'all') query.set('gender', filters.gender);
  if (filters.sort !== 'new') query.set('sort', filters.sort);
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** 주소에 적힌 필터를 읽습니다. 이상한 값은 기본값으로 떨어뜨립니다. */
function readFilters(): ProductFilters {
  const query = new URLSearchParams(window.location.search);
  const brand = query.get('brand');
  const gender = query.get('gender');
  const sort = query.get('sort');

  return {
    brand: brand || 'all',
    gender: gender === 'women' || gender === 'men' || gender === 'unisex' ? gender : 'all',
    sort: sort === 'low' || sort === 'high' ? sort : 'new',
  };
}

/*
 * ★ 서버에는 화면이 없으니 useLayoutEffect 를 쓸 수 없습니다. 그래서 서버에서는
 *   useEffect 로 바꿔 둡니다. (경고만 피하는 용도이고 서버에서는 어차피 안 돕니다)
 *   화면에서 useLayoutEffect 를 쓰는 이유는 아래 주소 읽기에 적어 두었습니다.
 */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * ============================================================
 * 브랜드·성별·정렬을 담아 두는 곳
 * ============================================================
 *
 * ★★ 왜 목록 밖으로 꺼냈는가 — 밑줄이 깜빡이던 문제
 *   전에는 이 상태가 ProductList 안에 있었습니다. 소분류를 누르면 페이지가
 *   바뀌면서 ProductList 가 새로 뜨고, 상태가 'all' 로 돌아갔다가 주소를 읽고
 *   다시 제 값으로 돌아왔습니다. 그래서 브랜드 밑줄이 GANNI → ALL → GANNI 로
 *   왔다 갔다 했습니다.
 *   이 상태를 /category/[slug]/layout.tsx 로 올려 두면, 소분류를 옮겨도
 *   레이아웃은 그대로 있으므로 상태가 살아 있습니다. 밑줄이 튀지 않습니다.
 *
 * ★★ 왜 useSearchParams 를 쓰지 않는가
 *   이 목록은 상품·분류 페이지에 들어갑니다. 그 페이지들은 SEO 때문에 반드시
 *   정적으로 구워져야 합니다. 클라이언트 컴포넌트에서 useSearchParams 를 쓰면
 *   Next 가 그 자리를 정적 생성에서 빼, 검색엔진이 상품 격자를 못 읽게 됩니다.
 *   그래서 훅 대신 주소를 직접 읽고 씁니다.
 */
export default function ProductFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);

  /*
   * 주소에 적힌 필터를 읽어 옵니다.
   *
   * ★ useEffect 가 아니라 useLayoutEffect 인 이유
   *   대분류를 옮기면(의류 → 가방) 이 상자가 새로 뜹니다. useEffect 로 읽으면
   *   화면을 한 번 그린 뒤에 고치므로 밑줄이 ALL 에 붙었다 옮겨 가는 게 보입니다.
   *   useLayoutEffect 는 그리기 직전에 끝나므로 잘못된 상태가 눈에 띄지 않습니다.
   */
  useBeforePaint(() => {
    setFilters(readFilters());
  }, []);

  /*
   * 뒤로가기·앞으로가기를 눌렀을 때 주소를 다시 읽습니다.
   *
   * ★ 이게 없으면 어긋납니다. 소분류에서 브랜드를 풀고 뒤로가기를 누르면
   *   주소는 brand=ganni 인데 화면은 ALL 인 상태가 됩니다.
   */
  useEffect(() => {
    const onPop = () => setFilters(readFilters());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /* apply 안에서 최신 값을 보기 위한 창구 (의존성 때문에 함수를 다시 만들지 않으려고) */
  const latest = useRef(filters);
  latest.current = filters;

  /**
   * ★ history.replaceState 를 씁니다.
   *   router 를 부르면 페이지를 다시 가져오면서 화면이 깜빡이는데,
   *   걸러 내는 일은 전부 브라우저 안에서 끝나므로 그럴 이유가 없습니다.
   * ★ pushState 가 아닌 이유 — 칩을 누를 때마다 기록이 쌓이면 화면을 벗어나는 데
   *   뒤로가기를 여러 번 눌러야 합니다.
   * ★ 그래도 주소를 맞춰 두는 이유 — 새로고침하거나 링크를 보냈을 때 같은 화면이
   *   나와야 하고, 분류를 누를 때 붙여 보낼 쿼리도 여기서 나옵니다.
   */
  const apply = useCallback((patch: Partial<ProductFilters>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setFilters(next);
    window.history.replaceState(null, '', `${window.location.pathname}${buildQuery(next)}`);
  }, []);

  return (
    <FilterContext.Provider value={{ ...filters, apply, query: buildQuery(filters) }}>
      {children}
    </FilterContext.Provider>
  );
}

/**
 * 필터를 꺼내 씁니다.
 * ★ 상자 밖에서 부르면 조용히 기본값으로 도는 대신 바로 알려 줍니다.
 *   목록만 있고 필터가 안 먹는 화면이 생기면 원인을 찾기 어렵습니다.
 */
export function useProductFilters(): FilterContextValue {
  const value = useContext(FilterContext);
  if (!value) {
    throw new Error('ProductFilterProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}
