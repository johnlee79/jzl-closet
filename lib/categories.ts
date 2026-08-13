/**
 * ============================================================
 * 카테고리 데이터 — 이 파일 하나만 고치면 메뉴·라우트·사이트맵이 전부 바뀝니다.
 * ============================================================
 *
 * ★ label 은 화면에 보이는 글자입니다. 한글·영문 자유롭게 바꿔도 됩니다.
 *   slug 는 주소에 쓰이므로 절대 바꾸지 마세요. 바꾸면 검색 순위가 초기화됩니다.
 *
 * 필드 역할
 *   slug      URL 전용. /category/clothing 의 clothing 부분입니다. 고정값으로 두세요.
 *   label     화면에 실제로 출력되는 글자. 메뉴·필터 칩·목록에 이 값이 나옵니다.
 *   nameKo    h1 제목과 메타데이터(검색 결과 제목·설명) 전용입니다.
 *   order     정렬 순서. 오름차순이며 배열에 적힌 순서는 무시됩니다.
 *   isVisible false 면 메뉴·사이트맵·라우트 생성에서 제외됩니다. 데이터는 남습니다.
 *
 * [1] 대분류 추가하는 법
 *   아래 categories 배열에 객체를 하나 추가하면 끝입니다.
 *     { slug: 'home', label: 'HOME', nameKo: '홈웨어', order: 45, isVisible: true,
 *       description: '...', children: [] }
 *   - 헤더 메뉴, 모바일 메뉴, 푸터, 카테고리 페이지(정적 생성), 사이트맵,
 *     상품 목록의 필터가 자동으로 따라옵니다. 다른 파일은 손대지 않습니다.
 *   - 상품을 넣으려면 lib/products.ts 에서 category: 'home' 으로 지정합니다.
 *
 * [2] 소분류 추가하는 법
 *   해당 대분류의 children 배열에 추가하세요.
 *     { slug: 'pajama', label: 'PAJAMA', nameKo: '파자마', order: 10, isVisible: true }
 *   - 헤더 드롭다운과 목록 상단의 소분류 필터 칩이 자동 생성됩니다.
 *   - children 이 없거나 비어 있으면 드롭다운과 소분류 필터 줄을 아예 그리지 않습니다.
 *   - 상품과 연결하려면 lib/products.ts 에서 subCategory: 'pajama' 로 지정합니다.
 *
 * [3] 숨기는 법
 *   isVisible: false 로 바꾸세요. 데이터는 그대로 남고 메뉴·사이트맵·카테고리
 *   페이지 생성에서만 제외됩니다. 나중에 true 로 되돌리면 그대로 되살아납니다.
 *   (삭제하지 마세요. 삭제하면 되살릴 수 없습니다.)
 *
 * [4] 순서 바꾸는 법
 *   order 값을 고치세요. 오름차순으로 정렬됩니다.
 *   중간에 끼워 넣기 쉽도록 10 단위로 띄워 두었습니다. (10, 20, 30 ...)
 *
 * [5] 화면 글자만 바꾸는 법
 *   label 만 고치세요. 예: label: 'OUTER' → label: '아우터'
 *   주소(/category/clothing/outer)와 검색 색인은 그대로 유지됩니다.
 *
 * ------------------------------------------------------------
 * matchType — 이 카테고리가 어떤 상품을 보여줄지 정합니다.
 *   생략   : 상품의 category 값이 이 카테고리 slug 와 같은 상품 (기본값)
 *   'all'  : 전체 상품
 *   'flag' : matchFlag 로 지정한 상품 상태값이 true 인 상품 (isSale / isOutlet)
 * ------------------------------------------------------------
 */

export type SubCategory = {
  slug: string; // URL 전용 — 바꾸지 마세요
  label: string; // 화면 출력용 — 자유롭게 바꿔도 됩니다
  nameKo: string; // h1·메타데이터 전용
  order: number;
  isVisible: boolean;
};

export type Category = {
  slug: string; // URL 전용 — 바꾸지 마세요
  label: string; // 화면 출력용 — 자유롭게 바꿔도 됩니다
  nameKo: string; // h1·메타데이터 전용
  order: number;
  isVisible: boolean;
  description: string;
  children?: SubCategory[];
  matchType?: 'all' | 'flag';
  matchFlag?: 'isSale' | 'isOutlet';
};

export const categories: Category[] = [
  {
    slug: 'all',
    label: 'ALL',
    nameKo: '전체',
    order: 10,
    isVisible: true,
    matchType: 'all',
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
    description:
      '가격을 조정한 상품입니다. 수량이 한정되어 있어 사이즈와 색상이 먼저 마감될 수 있습니다.',
  },

  // ─── 아래는 숨김 상태입니다. 삭제하지 말고 isVisible 만 true 로 바꾸면 되살아납니다. ───
  {
    slug: 'brand',
    label: 'BRAND',
    nameKo: '브랜드',
    order: 70,
    isVisible: false,
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

function byOrder<T extends { order: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/** 메뉴·사이트맵·라우트에 노출되는 대분류 (order 오름차순). */
export function getVisibleCategories(): Category[] {
  return byOrder(categories.filter((category) => category.isVisible));
}

/** 숨김 항목을 포함한 전체 대분류 (order 오름차순). */
export function getAllCategories(): Category[] {
  return byOrder(categories);
}

/** 상품이 실제로 속할 수 있는 대분류만 (전체/세일 같은 모음 카테고리 제외). */
export function getFilterableCategories(): Category[] {
  return getVisibleCategories().filter((category) => !category.matchType);
}

/** 숨김 여부와 관계없이 slug 로 찾습니다. */
export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

/** 노출 중인 카테고리만 slug 로 찾습니다. (라우트 생성에 사용) */
export function getVisibleCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug && category.isVisible);
}

/** 노출 중인 소분류 (order 오름차순). 메뉴·필터·라우트는 이 함수를 씁니다. */
export function getVisibleSubCategories(categorySlug: string): SubCategory[] {
  const children = getCategoryBySlug(categorySlug)?.children ?? [];
  return byOrder(children.filter((child) => child.isVisible));
}

/** 숨김 여부와 관계없이 소분류를 찾습니다. */
export function getSubCategory(
  categorySlug: string,
  subSlug: string
): SubCategory | undefined {
  return (getCategoryBySlug(categorySlug)?.children ?? []).find(
    (child) => child.slug === subSlug
  );
}

/** 노출 중인 소분류가 하나라도 있는지. 없으면 소분류 필터 줄을 그리지 않습니다. */
export function hasChildren(category: Category): boolean {
  return getVisibleSubCategories(category.slug).length > 0;
}
