/**
 * ============================================================
 * 카테고리 — 타입 · 폴백 데이터 · 순수 헬퍼
 * ============================================================
 *
 * ★ 1-B 부터 분류는 DB(categories 테이블)에서 읽습니다.
 *   관리자 > 분류 관리 에서 고치세요. 이 파일을 직접 고칠 필요가 없습니다.
 *
 * 이 파일이 남아 있는 이유는 두 가지입니다.
 *   1) 타입 정의 — 서버·클라이언트 어디서나 쓰는 Category / SubCategory
 *   2) 폴백 데이터 — supabase/schema-1b.sql · seed-1b.sql 을 아직 실행하지
 *      않았거나 테이블이 비어 있을 때 사이트가 죽지 않도록 이 값을 씁니다.
 *
 * DB 를 실제로 읽는 코드는 lib/taxonomy.ts (서버 전용) 에 있습니다.
 * 이 파일에는 'server-only' 를 넣지 않습니다. 클라이언트 컴포넌트도 타입과
 * 헬퍼를 가져다 쓰기 때문입니다.
 *
 * ------------------------------------------------------------
 * matchType — 이 카테고리가 어떤 상품을 보여줄지 정합니다.
 *   DB 에는 컬럼을 따로 두지 않고 slug 약속으로 처리합니다.
 *     slug 'all'  → 전체 상품
 *     slug 'sale' → isSale 이 true 인 상품
 *     그 밖       → categorySlug 가 같은 상품 (기본값)
 * ------------------------------------------------------------
 */

export type SubCategory = {
  slug: string; // URL 전용 — 등록 후 바꾸지 않습니다
  label: string; // 화면 출력용
  nameKo: string; // h1·메타데이터 전용
  order: number;
  isVisible: boolean;
  description?: string;
};

export type Category = {
  slug: string; // URL 전용 — 등록 후 바꾸지 않습니다
  label: string; // 화면 출력용
  nameKo: string; // h1·메타데이터 전용
  order: number;
  isVisible: boolean;
  description: string;
  children: SubCategory[];
  matchType?: 'all' | 'flag';
  matchFlag?: 'isSale';
};

/** 모음 카테고리 slug 약속. DB 컬럼 대신 이 규칙으로 판별합니다. */
export const ALL_CATEGORY_SLUG = 'all';
export const SALE_CATEGORY_SLUG = 'sale';

/** slug 로 matchType 을 정합니다. (categories 테이블에는 이 컬럼이 없습니다) */
export function matchTypeOf(slug: string): Pick<Category, 'matchType' | 'matchFlag'> {
  if (slug === ALL_CATEGORY_SLUG) return { matchType: 'all' };
  if (slug === SALE_CATEGORY_SLUG) return { matchType: 'flag', matchFlag: 'isSale' };
  return {};
}

/* ------------------------------------------------------------------
 * 폴백 데이터 — DB 가 비어 있을 때만 쓰입니다.
 * supabase/seed-1b.sql 이 이 값을 그대로 옮겨 담습니다.
 * ------------------------------------------------------------------ */

export const FALLBACK_CATEGORIES: Category[] = [
  {
    slug: 'all',
    label: 'ALL',
    nameKo: '전체',
    order: 10,
    isVisible: true,
    matchType: 'all',
    children: [],
    description:
      '지금 소개하고 있는 모든 상품입니다. 카테고리와 브랜드, 가격 순으로 좁혀 보실 수 있습니다.',
  },
  {
    slug: 'clothing',
    label: 'CLOTHING',
    nameKo: '의류',
    order: 20,
    isVisible: true,
    description:
      '매일 입어도 부담이 없는 옷을 고릅니다. 실측 치수를 모두 표기하니 평소 입는 옷과 비교해 보고 고르세요.',
    children: [
      { slug: 'outer', label: 'OUTER', nameKo: '아우터', order: 10, isVisible: true },
      { slug: 'top', label: 'TOPS', nameKo: '상의', order: 20, isVisible: true },
      { slug: 'knit', label: 'KNIT', nameKo: '니트', order: 30, isVisible: true },
      { slug: 'shirts', label: 'SHIRTS', nameKo: '셔츠', order: 40, isVisible: true },
      { slug: 'tee', label: 'T-SHIRTS', nameKo: '티셔츠', order: 50, isVisible: true },
      { slug: 'denim', label: 'DENIM', nameKo: '데님', order: 60, isVisible: true },
      { slug: 'pants', label: 'PANTS', nameKo: '팬츠', order: 70, isVisible: true },
      { slug: 'dress', label: 'DRESS', nameKo: '원피스', order: 80, isVisible: true },
      { slug: 'active', label: 'ACTIVEWEAR', nameKo: '액티브웨어', order: 90, isVisible: true },
    ],
  },
  {
    slug: 'bags',
    label: 'BAGS',
    nameKo: '가방·지갑',
    order: 30,
    isVisible: true,
    description:
      '하루치 짐이 자연스럽게 들어가는 크기와, 어깨에서 흘러내리지 않는 끈. 매일 드는 가방의 기준을 그 두 가지에 두었습니다.',
    children: [
      { slug: 'tote', label: 'TOTE', nameKo: '토트', order: 10, isVisible: true },
      { slug: 'shoulder', label: 'SHOULDER', nameKo: '숄더', order: 20, isVisible: true },
      { slug: 'cross', label: 'CROSSBODY', nameKo: '크로스백', order: 30, isVisible: true },
      { slug: 'backpack', label: 'BACKPACK', nameKo: '백팩', order: 40, isVisible: true },
      { slug: 'wallet', label: 'WALLET', nameKo: '지갑', order: 50, isVisible: true },
      { slug: 'pouch', label: 'POUCH', nameKo: '파우치', order: 60, isVisible: true },
    ],
  },
  {
    slug: 'shoes',
    label: 'SHOES',
    nameKo: '슈즈',
    order: 40,
    isVisible: true,
    description:
      '하루 종일 신고 걸어도 발이 아프지 않은지를 먼저 봅니다. 굽 높이와 발볼 여유를 상세 페이지에 적어 두었습니다.',
    children: [
      { slug: 'sneakers', label: 'SNEAKERS', nameKo: '스니커즈', order: 10, isVisible: true },
      { slug: 'loafer', label: 'LOAFER', nameKo: '로퍼', order: 20, isVisible: true },
      { slug: 'boots', label: 'BOOTS', nameKo: '부츠', order: 30, isVisible: true },
      { slug: 'sandals', label: 'SANDALS', nameKo: '샌들', order: 40, isVisible: true },
    ],
  },
  {
    slug: 'accessories',
    label: 'ACCESSORIES',
    nameKo: '액세서리',
    order: 50,
    isVisible: true,
    description:
      '가까이서 보면 보이고 멀리서 보면 옷을 방해하지 않는 크기. 하루 종일 착용해도 부담이 없는 무게로 골랐습니다.',
    children: [
      { slug: 'jewelry', label: 'JEWELRY', nameKo: '주얼리', order: 10, isVisible: true },
      { slug: 'hair', label: 'HAIR', nameKo: '헤어', order: 20, isVisible: true },
      { slug: 'scarf', label: 'SCARF', nameKo: '스카프', order: 30, isVisible: true },
      { slug: 'belt', label: 'BELT', nameKo: '벨트', order: 40, isVisible: true },
      { slug: 'cap', label: 'CAP', nameKo: '모자', order: 50, isVisible: true },
      { slug: 'socks', label: 'SOCKS', nameKo: '양말', order: 60, isVisible: true },
    ],
  },
  {
    slug: 'sale',
    label: 'SALE',
    nameKo: '세일',
    order: 60,
    isVisible: true,
    matchType: 'flag',
    matchFlag: 'isSale',
    children: [],
    description:
      '가격을 조정한 상품입니다. 수량이 한정되어 있어 사이즈와 색상이 먼저 마감될 수 있습니다.',
  },
  {
    slug: 'brand',
    label: 'BRAND',
    nameKo: '브랜드',
    order: 70,
    isVisible: false,
    children: [],
    description:
      'JZL CLOSET이 소개하는 브랜드입니다. 브랜드별 소개와 상품은 /brand 에서 계속 보실 수 있습니다.',
  },
  {
    slug: 'beauty',
    label: 'BEAUTY',
    nameKo: '뷰티',
    order: 80,
    isVisible: false,
    description: '향과 피부에 관한 물건입니다. 준비가 끝나는 대로 공개합니다.',
    children: [
      { slug: 'perfume', label: 'PERFUME', nameKo: '향수', order: 10, isVisible: true },
      { slug: 'skincare', label: 'SKINCARE', nameKo: '스킨케어', order: 20, isVisible: true },
      { slug: 'makeup', label: 'MAKEUP', nameKo: '메이크업', order: 30, isVisible: true },
      { slug: 'bodycare', label: 'BODY', nameKo: '바디케어', order: 40, isVisible: true },
    ],
  },
];

/* ------------------------------------------------------------------
 * 순수 헬퍼 — 목록을 넘겨 받아 계산만 합니다. (서버·클라이언트 공용)
 * ------------------------------------------------------------------ */

function byOrder<T extends { order: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/** 메뉴·사이트맵·라우트에 노출되는 대분류 (order 오름차순). */
export function visibleCategories(list: Category[]): Category[] {
  return byOrder(list.filter((category) => category.isVisible));
}

/** 숨김 항목을 포함한 전체 대분류 (order 오름차순). */
export function sortedCategories(list: Category[]): Category[] {
  return byOrder(list);
}

/** 상품이 실제로 속할 수 있는 대분류만 (전체/세일 같은 모음 카테고리 제외). */
export function filterableCategories(list: Category[]): Category[] {
  return visibleCategories(list).filter((category) => !category.matchType);
}

/** 숨김 여부와 관계없이 slug 로 찾습니다. */
export function findCategory(list: Category[], slug: string): Category | undefined {
  return list.find((category) => category.slug === slug);
}

/** 노출 중인 카테고리만 slug 로 찾습니다. (라우트 생성에 사용) */
export function findVisibleCategory(list: Category[], slug: string): Category | undefined {
  return list.find((category) => category.slug === slug && category.isVisible);
}

/** 노출 중인 소분류 (order 오름차순). 메뉴·필터·라우트는 이 함수를 씁니다. */
export function visibleSubCategories(list: Category[], slug: string): SubCategory[] {
  const children = findCategory(list, slug)?.children ?? [];
  return byOrder(children.filter((child) => child.isVisible));
}

/** 숨김 여부와 관계없이 소분류를 찾습니다. */
export function findSubCategory(
  list: Category[],
  categorySlug: string,
  subSlug: string
): SubCategory | undefined {
  return (findCategory(list, categorySlug)?.children ?? []).find(
    (child) => child.slug === subSlug
  );
}

/** 노출 중인 소분류가 하나라도 있는지. 없으면 소분류 줄을 그리지 않습니다. */
export function hasVisibleChildren(category: Category): boolean {
  return category.children.some((child) => child.isVisible);
}

/** 카테고리 이름을 찾습니다. 없으면 slug 를 그대로 돌려줍니다. */
export function categoryNameKo(list: Category[], slug: string | null): string {
  if (!slug) return '';
  return findCategory(list, slug)?.nameKo ?? slug;
}
