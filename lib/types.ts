/**
 * 프로젝트 공용 타입. 프론트·관리자·API 가 모두 여기를 참조합니다.
 * DB 컬럼(snake_case)과 앱 내부(camelCase)를 분리해 두었습니다.
 */

export type Gender = 'women' | 'men' | 'unisex';

/** 상세 본문 블록 — 운영자가 이미지/문구/표를 자유롭게 반복 배치합니다. */
export type DetailBlock =
  | { type: 'image'; src: string; alt: string; caption?: string }
  | { type: 'text'; heading?: string; body: string }
  | { type: 'spec'; rows: { label: string; value: string }[] };

/** 옵션 그룹. soldOutValues 에 담긴 값은 선택할 수 없습니다. */
export type ProductOption = {
  name: string;
  values: string[];
  soldOutValues: string[];
};

/** 실측 항목 — 항목명과 값 한 쌍 */
export type Measurement = {
  label: string;
  value: string;
};

/** 앱에서 사용하는 상품 형태 */
export type Product = {
  id: string; // uuid (DB 기본키)
  slug: string; // URL 주소 — 바꾸지 마세요
  name: string;
  brandSlug: string | null;
  categorySlug: string;
  subCategorySlug: string | null;
  price: number;
  originalPrice: number | null;
  summary: string;
  origin: string | null;
  manufacturer: string | null;
  gender: Gender;
  season: string | null;
  thumbnails: string[];
  options: ProductOption[];
  detail: DetailBlock[];
  measurements: Measurement[];
  isNew: boolean;
  isSale: boolean;
  isSoldOut: boolean;
  isVisible: boolean;
  freeShipping: boolean;
  displayOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

/** 상품 저장 시 주고받는 입력 형태 (id 없이 생성 가능) */
export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

/** DB row (snake_case) */
export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  brand_slug: string | null;
  category_slug: string;
  sub_category_slug: string | null;
  price: number;
  original_price: number | null;
  summary: string | null;
  origin: string | null;
  manufacturer: string | null;
  gender: string | null;
  season: string | null;
  thumbnails: unknown;
  options: unknown;
  detail_blocks: unknown;
  measurements: unknown;
  is_new: boolean | null;
  is_sale: boolean | null;
  is_sold_out: boolean | null;
  is_visible: boolean | null;
  free_shipping: boolean | null;
  display_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Template = {
  id: string;
  title: string;
  body: string;
  createdAt: string | null;
};

export type TemplateRow = {
  id: string;
  title: string;
  body: string;
  created_at: string | null;
};

/** 목록 조회 필터 */
export type ProductFilter = {
  categorySlug?: string;
  subCategorySlug?: string;
  brandSlug?: string;
  gender?: Gender;
  search?: string;
  onlySale?: boolean;
  /** 관리자에서는 숨김 상품도 봐야 하므로 true */
  includeHidden?: boolean;
  soldOut?: boolean;
  visible?: boolean;
  limit?: number;
  offset?: number;
};

/** 업로드 API 응답 */
export type UploadedImage = {
  url: string;
  thumbUrl: string;
  key: string;
  thumbKey: string;
  width: number;
  height: number;
  bytes: number;
};
