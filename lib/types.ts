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

/**
 * 옵션 조합 이름을 잇는 구분자. 예: 컬러 "블랙" + 사이즈 "S" → "블랙/S"
 * 옵션값에는 이 문자를 넣을 수 없습니다. (관리자 입력 단계에서 걸러 냅니다)
 */
export const COMBINATION_SEPARATOR = '/';

/** 옵션 그룹 — 이름과 값 목록만 가집니다. 품절 여부는 조합이 관리합니다. */
export type OptionGroup = {
  name: string;
  values: string[];
};

/**
 * 옵션 조합 하나. 그룹의 값들을 곱집합으로 조합한 결과입니다.
 * key 는 그룹 순서대로 값을 "/" 로 이은 문자열입니다.
 */
export type OptionCombination = {
  key: string; // "블랙/S"
  isActive: boolean; // false 면 이 조합만 품절
  stock: number | null; // null 이면 재고를 관리하지 않음
  extraPrice: number; // 옵션별 추가금액. 기본 0
};

/** DB 의 options(jsonb) 에 저장하는 형태 */
export type StoredOptions = {
  groups: OptionGroup[];
  combinations: OptionCombination[];
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
  optionGroups: OptionGroup[];
  optionCombinations: OptionCombination[];
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

/* ── 사이트 설정 (site_settings 테이블) ────────────────────── */

/** 브라우저 탭·홈 화면에 쓰이는 아이콘 한 벌 */
export type BrandingIcon = {
  url: string;
  type: string; // image/png · image/svg+xml · image/x-icon
  sizes: string; // "32x32"
};

/** site_settings 의 key = 'branding' 에 담기는 값 */
export type Branding = {
  favicon: BrandingIcon | null;
  appleTouchIcon: BrandingIcon | null;
  /** 헤더 로고 이미지. 없으면 텍스트 로고를 씁니다. */
  logo: { url: string } | null;
  /** 관리자가 올린 원본. 미리보기와 재생성에 씁니다. */
  source: { url: string; type: string; name: string } | null;
  /** R2 에 올라간 키들 — 교체·삭제할 때 지웁니다. */
  keys: string[];
  updatedAt: string | null;
};

/* ── 주문 (2-A) ────────────────────────────────────────────
 * 상태값과 헬퍼는 lib/order-status.ts 에 있습니다.
 * DB 접근은 lib/orders.ts (서버 전용) 가 담당합니다.
 * ---------------------------------------------------------- */

/** 현금영수증 신청 구분 */
export type CashReceiptType = 'none' | 'personal' | 'business';

/** 주문 상품 한 줄. 주문 시점의 이름·가격을 그대로 들고 있습니다. */
export type OrderItem = {
  id: string;
  productId: string | null;
  productSlug: string;
  productName: string;
  brandLabel: string;
  optionKey: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  thumbnailUrl: string;
  /** cancelled 면 부분취소된 품목입니다. */
  itemStatus: 'normal' | 'cancelled';
};

export type OrderStatusEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  memo: string;
  createdAt: string | null;
};

export type Order = {
  id: string;
  orderNo: string;
  status: string;
  /** 회원 주문이면 auth.users.id. 비회원 주문은 null */
  userId: string | null;

  ordererName: string;
  ordererPhone: string;
  ordererEmail: string;

  receiverName: string;
  receiverPhone: string;
  postcode: string;
  address1: string;
  address2: string;
  deliveryMemo: string;

  depositorName: string;
  paymentMethod: string;
  itemsTotal: number;
  shippingFee: number;
  extraShippingFee: number;
  discount: number;
  totalAmount: number;

  cashReceiptType: CashReceiptType;
  cashReceiptNo: string;

  /** PG 연동 자리 — 무통장입금이면 비어 있습니다. */
  pgProvider: string | null;
  pgTid: string | null;
  paidAt: string | null;

  courier: string;
  trackingNo: string;
  adminMemo: string;

  createdAt: string | null;
  updatedAt: string | null;

  items: OrderItem[];
  history: OrderStatusEntry[];
};

/** 주문서에서 서버로 보내는 값. 금액은 보내지 않습니다. (서버가 다시 계산합니다) */
export type CheckoutInput = {
  ordererName: string;
  ordererPhone: string;
  ordererEmail: string;
  receiverName: string;
  receiverPhone: string;
  postcode: string;
  address1: string;
  address2: string;
  deliveryMemo: string;
  depositorName: string;
  paymentMethod: string;
  cashReceiptType: CashReceiptType;
  cashReceiptNo: string;
  /** 장바구니에서 넘어온 품목. 가격은 서버가 상품 테이블에서 다시 읽습니다. */
  items: { productSlug: string; optionKey: string; quantity: number }[];
  agreed: boolean;
  /**
   * 회원 주문이면 로그인한 계정 id.
   * ★ 클라이언트가 보내는 값이 아니라 서버가 세션에서 채웁니다.
   */
  userId?: string | null;
  /**
   * 쓰고 싶은 포인트.
   * ★ 이 값은 "요청"일 뿐입니다. 서버가 잔액·최소사용액·최대비율로 다시 깎습니다.
   */
  usePoints?: number;
};

/** 관리자 주문 목록 필터 */
export type OrderFilter = {
  status?: string;
  search?: string;
  /** ISO 날짜 (yyyy-mm-dd). 이 날짜 00:00 부터 */
  from?: string;
  /** ISO 날짜 (yyyy-mm-dd). 이 날짜 23:59 까지 */
  to?: string;
  limit?: number;
  offset?: number;
};

/** 대시보드 숫자 묶음 */
export type DashboardStats = {
  todayAmount: number;
  yesterdayAmount: number;
  monthAmount: number;
  lastMonthAmount: number;
  todayCount: number;
  pendingPaymentCount: number;
  unshippedCount: number;
  countByStatus: Record<string, number>;
  recentOrders: Order[];
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
