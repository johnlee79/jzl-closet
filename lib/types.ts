/**
 * 프로젝트 공용 타입. 프론트·관리자·API 가 모두 여기를 참조합니다.
 * DB 컬럼(snake_case)과 앱 내부(camelCase)를 분리해 두었습니다.
 */

export type Gender = 'women' | 'men' | 'unisex';

/** 상세 본문 블록 — 운영자가 이미지/문구/표를 자유롭게 반복 배치합니다. */
export type DetailBlock =
  /**
   * width·height 는 원본 크기입니다. (올릴 때 서버가 알려 준 값)
   * ★ 상세 이미지는 원본 비율 그대로 나가므로 미리 비율을 알려 주지 않으면
   *   이미지가 늦게 뜰 때 아래 내용이 통째로 밀립니다. 검색 점수에도 좋지 않습니다.
   *   예전에 올린 이미지에는 없을 수 있어 선택 항목으로 둡니다.
   */
  | {
      type: 'image';
      src: string;
      alt: string;
      caption?: string;
      width?: number;
      height?: number;
    }
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
  /**
   * ** 매입 원가(원). 뉴욕 원가 + 택배비 합계입니다. (2026-08-27)
   *   null 이면 "아직 안 넣음" 입니다. 0 과 다릅니다.
   *   0 은 "정말 0원" 이고, null 은 수익 계산에서 빼고 "원가 미입력" 으로 셉니다.
   * * 옵션(색 사이즈)별로 나누지 않습니다. 옷이라 원가가 같습니다.
   * * 손님 화면에는 절대 내보내지 않습니다.
   */
  costPrice: number | null;
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
  /**
   * 셀스타에서 가져온 상품이면 그 상품번호.
   * ★ 중복 확인과 "셀스타에서 다시 불러오기" 에 씁니다.
   *   손으로 등록한 상품은 0 입니다.
   */
  sellstarId: number;
  /** 마지막으로 가져온 시각 */
  sellstarSyncedAt: string | null;
  /** 가져올 당시의 셀스타 정가·판매가 — 마진을 견주어 볼 때 씁니다. */
  sellstarPrice: number;
  sellstarSalePrice: number;
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
  /** 매입 원가. 아직 칸이 없는 환경도 있어 선택 항목입니다. (2026-08-27) */
  cost_price?: number | null;
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
  /** 3-D 에서 추가한 컬럼. 아직 없을 수 있어 선택 항목으로 둡니다. */
  sellstar_id?: number | null;
  sellstar_synced_at?: string | null;
  sellstar_price?: number | null;
  sellstar_sale_price?: number | null;
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
  /**
   * 목록 화면용 — 상세설명(detail_blocks)과 실측(measurements)을 빼고 읽습니다.
   * ★ 상품 카드·관리자 목록은 이 두 컬럼을 쓰지 않는데,
   *   상품 하나에 이미지·문단이 수십 개씩 들어 있어 전송량이 크게 늘어납니다.
   */
  light?: boolean;
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
  /**
   * ** 주문한 그 순간의 개당 원가. (2026-08-27)
   *   products.cost_price 를 복사해 둡니다. 상품 원가를 나중에 고쳐도
   *   지나간 주문의 마진이 안 틀어집니다. unitPrice 와 같은 방식입니다.
   * * null 이면 주문 당시 원가가 없었거나, 아직 칸이 없던 때의 주문입니다.
   */
  unitCost: number | null;
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
  /**
   * 홈택스에서 직접 발급을 마쳤는지 (4-A).
   * ★ PG 가 현금영수증을 지원하지 않아 운영자가 직접 발급합니다.
   *   발급했는지 표시할 자리가 없으면 빠뜨리거나 두 번 발급하게 됩니다.
   */
  cashReceiptIssued: boolean;
  cashReceiptIssuedAt: string | null;

  /** PG 연동 — 무통장입금이면 비어 있습니다. */
  pgProvider: string | null;
  /** ★ KSNET 거래번호(trno). 취소를 대행사에 요청할 때 반드시 필요한 값입니다. */
  pgTid: string | null;
  paidAt: string | null;

  /* ── KSNET 승인 결과 (4-A) ─────────────────────────────
   * 취소·정산·분쟁 처리에 전부 필요합니다. 하나라도 빠지면 나중에 못 찾습니다. */
  /** 승인번호. 실패면 에러코드가 들어옵니다. */
  pgAuthNo: string;
  /** 거래일시 원문 (YYYYMMDDHHMMSS) */
  pgTradeAt: string;
  /** PG 가 알려 준 승인 금액. totalAmount 와 다르면 검토필요입니다. */
  pgAmount: number | null;
  pgIssuerCode: string;
  pgAcquirerCode: string;
  /** 할부개월. 0 이면 일시불 */
  pgInstallment: number | null;
  pgResultCode: string;
  /** 응답 메시지 (EUC-KR → UTF-8) */
  pgMessage: string;

  /* ── 취소 (4-A) ────────────────────────────────────────
   * KSNET 취소 API 를 쓸 수 없어 사람이 대행사를 통해 처리합니다.
   * "요청 접수" 와 "환불 완료" 를 반드시 나눠 기록합니다. */
  cancelRequestedAt: string | null;
  cancelDoneAt: string | null;
  cancelMemo: string;

  courier: string;
  trackingNo: string;
  adminMemo: string;
  /** 켜 두면 입금 기한이 지나도 자동취소하지 않습니다. (공급처에 발송 요청이 나간 건) */
  autoCancelExcluded: boolean;
  /**
   * KSNET 결제 Key(reCommConId).
   * ★ 승인 재조회의 유일한 열쇠입니다. 거래번호(pgTid)와 다릅니다.
   *   결제창이 우리 서버로 돌아오는 순간 저장합니다. 없으면 재조회를 못 합니다.
   */
  pgCommConId: string;
  /** 이 주문 때문에 재고를 되돌린 시각. 채워져 있으면 다시 되돌리지 않습니다. */
  stockReleasedAt: string | null;
  /** 카드 자동정리 알림을 보낸 시각. 같은 주문으로 두 번 알리지 않기 위한 표시입니다. */
  sweepNotifiedAt: string | null;
  /**
   * 이 주문으로 실제 지급된 구매 적립 포인트.
   *
   * ★ 지급 여부를 가리는 표시이기도 합니다. lib/points.ts 의 earnPurchasePoints 가
   *   이 칸을 조건부로 선점한 뒤에 지급해서, 같은 주문에 두 번 나가지 않습니다.
   * ★ 화면에서 "몇 P 가 적립되었습니다" 를 말할 때 이 값을 씁니다.
   *   다시 계산하지 않습니다. 그 사이 적립률이 바뀌었으면 실제와 다른 숫자를 말하게 됩니다.
   */
  pointsEarned: number;

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
  /**
   * 현금영수증 신청 건만 보기 (4-A).
   *   'requested' 신청한 것 전부
   *   'todo'      신청했는데 아직 발급하지 않은 것 — 운영자가 홈택스에서 처리할 목록
   */
  cashReceipt?: 'requested' | 'todo';
  /** 결제수단으로 거르기 (4-A) */
  paymentMethod?: string;
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
  /**
   * 입금·승인 대기 중인 금액 합계. (2026-08-25)
   * ★ 매출에는 안 들어갑니다. 들어올 예정인 돈이라 따로 보여 줍니다.
   */
  pendingPaymentAmount: number;
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
