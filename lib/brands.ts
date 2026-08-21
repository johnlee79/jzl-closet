/**
 * ============================================================
 * 브랜드 — 타입 · 폴백 데이터 · 순수 헬퍼
 * ============================================================
 *
 * ★ 1-B 부터 브랜드는 DB(brands 테이블)에서 읽습니다.
 *   관리자 > 브랜드 관리 에서 고치세요.
 *
 * 이 파일은 타입과 폴백 데이터만 담습니다.
 * DB 를 실제로 읽는 코드는 lib/taxonomy.ts (서버 전용) 에 있습니다.
 * 클라이언트 컴포넌트도 가져다 쓰므로 'server-only' 를 넣지 않습니다.
 */

export type Brand = {
  slug: string; // URL 전용 — 등록 후 바꾸지 않습니다
  label: string; // 화면 출력용
  name: string; // 메타데이터·JSON-LD 전용 정식 명칭
  nameKo: string;
  tagline: string;
  /** 문단 배열. DB 에는 빈 줄로 나뉜 하나의 text 로 저장됩니다. */
  story: string[];
  origin: string;
  since: string;
  /** 브랜드 페이지 상단에 크게 깔리는 대표 사진. 관리자 > 브랜드 관리에서 올립니다(R2). 비우면 이미지 없이 나갑니다. */
  imageUrl: string;
  /**
   * 로고 이미지. 상품 목록 필터와 브랜드 페이지 상단에 씁니다.
   * ★ 비어 있으면 브랜드명을 글자로 보여 줍니다. (기본은 글자입니다)
   *   로고는 각 브랜드사의 등록상표라 쓸 수 있는 것만 골라 올리시면 됩니다.
   */
  logoUrl: string;
  /**
   * 균일화 전 원본 로고 주소.
   * ★ 기준값을 바꿔 다시 구울 때 언제나 여기서 시작합니다.
   *   이미 축소된 logoUrl 을 다시 키우면 화질이 깨집니다.
   */
  logoOriginalUrl: string;
  /**
   * 브랜드별 로고 미세 조정 배율 (0.7~1.5, 기본 1).
   * ★ 잉크 밀도 보정을 자동으로 넣어도 눈으로만 보이는 차이가 남습니다.
   *   그때 처리 로직을 통째로 바꾸지 말고 그 브랜드만 이 값을 올리세요.
   */
  logoScale: number;
  order: number;
  isVisible: boolean;
  isFeatured: boolean;
};

/**
 * 우리 자체 브랜드의 slug.
 *
 * ★ 푸터의 '브랜드 소개' 가 여기로 갑니다. (3-G)
 *   관리자 > 브랜드 관리에 이 slug 로 브랜드를 하나 만들고 노출을 켜 두어야 합니다.
 *   없으면 /brand/{slug} 는 404 이므로, 없을 때는 /about 으로 보냅니다.
 *   (푸터는 전 페이지에 실리는 자리라 죽은 링크를 둘 수 없습니다)
 */
export const OWN_BRAND_SLUG = 'jzl-closet';

/** DB 의 story(text) → 문단 배열. 빈 줄이 문단 구분입니다. */
export function storyToParagraphs(story: string | null | undefined): string[] {
  if (!story) return [];
  return story
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** 문단 배열 → DB 에 저장할 text */
export function paragraphsToStory(paragraphs: string[]): string {
  return paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean).join('\n\n');
}

/**
 * 대표 이미지 주소. 관리자 > 브랜드 관리에서 올린 값(R2)입니다.
 *
 * ★ 예전에는 값이 없으면 `/images/brands/{slug}.jpg` 를 대신 돌려주었습니다. (3-K 에서 뺐습니다)
 *   그런데 public/images/brands 에는 README.txt 뿐이라 그 주소로는 아무것도 나오지 않았습니다.
 *   없는 파일을 가리키고 있으니 브라우저가 한 번 받아 보고 실패하고,
 *   SafeImage 가 그제서야 대체 화면을 그리는 낭비가 매번 일어났습니다.
 *   빈 문자열을 돌려주면 SafeImage 가 곧바로 대체 화면을 그립니다.
 */
export function brandImage(brand: Pick<Brand, 'slug' | 'imageUrl'>): string {
  return brand.imageUrl;
}

/* ------------------------------------------------------------------
 * 폴백 데이터 — DB 가 비어 있을 때만 쓰입니다.
 * ------------------------------------------------------------------ */

/**
 * 표가 아예 없거나 읽기에 실패했을 때 쓰는 값입니다.
 *
 * ★ 일부러 비워 두었습니다.
 *   예전에는 여기에 예시 브랜드(ATELIER JZL · NORD BLANC · MAISON OAT · STITCH LAB)가
 *   박혀 있어서, 운영자가 관리자에서 브랜드를 전부 지워도 화면에 다시 나타났습니다.
 *   브랜드는 관리자에서 등록하는 자료이지 코드가 정할 것이 아닙니다.
 *   비어 있으면 브랜드 필터를 그리지 않고, 상품 카드도 브랜드 줄을 빼고 그립니다.
 */
export const FALLBACK_BRANDS: Brand[] = [
];

/* ------------------------------------------------------------------
 * 순수 헬퍼 — 목록을 넘겨 받아 계산만 합니다.
 * ------------------------------------------------------------------ */

function byOrder(list: Brand[]): Brand[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/** 브랜드 필터 칩·목록에 노출되는 브랜드 (order 오름차순). */
export function visibleBrands(list: Brand[]): Brand[] {
  return byOrder(list.filter((brand) => brand.isVisible));
}

export function sortedBrands(list: Brand[]): Brand[] {
  return byOrder(list);
}

export function findBrand(list: Brand[], slug: string | null): Brand | undefined {
  if (!slug) return undefined;
  return list.find((brand) => brand.slug === slug);
}

/** 화면에 표시할 브랜드 글자. */
export function brandLabel(list: Brand[], slug: string | null): string {
  if (!slug) return '';
  return findBrand(list, slug)?.label ?? slug;
}

/** 메타데이터·JSON-LD·이미지 alt 에 쓰는 정식 명칭. */
export function brandName(list: Brand[], slug: string | null): string {
  if (!slug) return '';
  return findBrand(list, slug)?.name ?? slug;
}
