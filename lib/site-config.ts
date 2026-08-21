/**
 * ============================================================
 * 사이트 설정 — 타입과 기본값
 * ============================================================
 *
 * 실제 값은 site_settings 테이블에 key 하나씩 저장됩니다.
 *   store      스토어 정보 (브랜드명·슬로건·소개·고객센터·사업자 정보)
 *   shipping   배송·반품
 *   design     메인 배너 · 자동 슬라이드 간격
 *   copy       사이트 문구 (약관·개인정보·안내 등)
 *   analytics  GA4 측정 ID
 *   branding   파비콘·로고
 *
 * 여기 있는 값은 "아직 아무것도 저장하지 않았을 때" 쓰이는 기본값이자,
 * 관리자 화면의 [기본값으로 되돌리기] 가 되돌아가는 자리입니다.
 *
 * 클라이언트 컴포넌트도 타입을 가져다 쓰므로 'server-only' 를 넣지 않습니다.
 * DB 를 읽고 쓰는 코드는 lib/settings.ts 에 있습니다.
 */

/* ── 스토어 정보 ──────────────────────────────────────────── */

export type BusinessInfo = {
  company: string; // 상호
  ceo: string; // 대표자
  regNumber: string; // 사업자등록번호
  mailOrder: string; // 통신판매업신고번호
  address: string; // 사업장 주소
};

export type StoreSettings = {
  name: string; // 브랜드명 (영문 로고)
  nameKo: string;
  slogan: string;
  intro: string; // 한 줄 소개
  story: string[]; // 브랜드 소개 3문장
  category: string; // 검색용 분류 문구
  phone: string; // 고객센터
  kakao: string; // 카카오톡 채널 링크
  email: string;
  hours: string; // 운영시간 안내
  business: BusinessInfo;
};

export const DEFAULT_STORE: StoreSettings = {
  name: 'JZL CLOSET',
  nameKo: '제이진엘 클로젯',
  slogan: '편안함에 감성을 더하다',
  intro: '매일 입기 좋은 데일리룩과 감각적인 패션잡화를 소개합니다.',
  story: [
    '하루를 함께 보내는 물건일수록 편안해야 한다고 믿습니다. 아침에 무심코 집어 드는 가방, 계산대 앞에서 꺼내는 지갑, 목에 두르는 스카프처럼 자주 손이 닿는 것들은 결국 그 사람의 하루를 닮습니다.',
    '손에 익는 무게와 오래 봐도 질리지 않는 형태를 기준으로 고릅니다. 어깨에 걸었을 때 흘러내리지 않는지, 한 손으로 여닫을 수 있는지, 반년이 지나도 처음의 선이 남아 있는지를 먼저 확인합니다.',
    '유행보다 오래 쓰는 쪽을 택합니다. 계절마다 새로 사야 하는 물건 대신, 몇 해를 함께 지나며 자기 자리를 찾는 물건을 소개합니다.',
  ],
  category: '브랜드 편집숍 — 의류, 가방·지갑, 슈즈, 액세서리',
  // ★ 화면에 나가는 번호는 전부 이 설정값을 읽습니다. 코드에 번호를 박아 두지 않습니다.
  //   여기 값은 site_settings 에 아무것도 저장되지 않았을 때만 쓰이는 마지막 기본값입니다.
  phone: '010-3602-7122',
  kakao: '',
  email: '',
  hours: '평일 10:00 — 17:00 (점심 12:30 — 13:30, 주말·공휴일 휴무)',
  business: {
    company: '제이진엘(JZL)',
    ceo: '김연',
    regNumber: '650-40-01042',
    mailOrder: '제2025-인천부평-0874호',
    address: '인천광역시 부평구 부일로 38, 1102호 (부개동)',
  },
};

/* ── 배송·반품 ────────────────────────────────────────────── */

export type ShippingSettings = {
  /** 기본 배송비 (원) */
  baseFee: number;
  /** 무료배송 기준 금액. 이 금액 이상이면 무료. 0 이면 기능을 끕니다. */
  freeThreshold: number;
  /** 제주·도서산간 추가배송비 */
  islandFee: number;
  /** 반품 주소 — 사업장 주소와 다를 수 있습니다. */
  returnAddress: string;
  /** 평균 배송 소요일 안내 문구 */
  leadTime: string;
  /**
   * 상품 상세 구매 영역에만 쓰는 짧은 한 줄.
   *
   * ★ 왜 따로 두는가
   *   구매 영역은 값·옵션·버튼이 모여 있는 좁은 자리입니다.
   *   여기에 배송 안내를 통째로 넣으면 두세 줄로 늘어나 오른쪽만 길어집니다.
   *   그렇다고 leadTime 을 줄이면 배송 안내 페이지와 판매정보 탭까지 같이 짧아집니다.
   *   한 문구를 여러 화면이 나눠 쓰던 것을 여기서 끊습니다.
   *
   *   예) "무료배송" · "3,000원 · 50,000원 이상 무료"
   *   비워 두면 배송비 설정으로 알아서 한 줄을 만듭니다.
   */
  productLine: string;
};

export const DEFAULT_SHIPPING: ShippingSettings = {
  baseFee: 3000,
  freeThreshold: 50000,
  islandFee: 3000,
  returnAddress: '인천광역시 부평구 부일로 38, 1102호 (부개동)',
  leadTime: '주문 확인 후 1~3영업일 내 출고되며, 출고 후 1~3일 내 도착합니다.',
  productLine: '',
};

/** 구매 영역 한 줄이 넘어가면 안 되는 길이 */
const PRODUCT_LINE_MAX = 34;

/**
 * 상품 상세 구매 영역에 쓸 배송 한 줄.
 *
 * 순서대로 시도합니다.
 *   1) 관리자가 적어 둔 전용 문구 (productLine)
 *   2) 배송비 설정으로 만든 짧은 문구
 *   3) 그래도 길면 잘라 냅니다
 *
 * ★ 여기서는 leadTime(출고·도착 소요일)을 붙이지 않습니다.
 *   그 안내는 [판매정보] 탭과 배송 안내 페이지에 이미 자세히 있습니다.
 *   같은 말을 구매 버튼 옆에 또 적을 이유가 없습니다.
 */
export function productShippingLine(
  freeShipping: boolean,
  settings: Pick<ShippingSettings, 'baseFee' | 'freeThreshold' | 'productLine'>
): string {
  const custom = settings.productLine.trim();
  if (custom) return cutToOneLine(custom);

  if (freeShipping) return '무료배송';

  const fee = `${formatNumber(settings.baseFee)}원`;
  if (settings.freeThreshold > 0) {
    return cutToOneLine(`${fee} · ${formatNumber(settings.freeThreshold)}원 이상 무료`);
  }
  return fee;
}

/** 한 줄에 안 들어가면 잘라 냅니다. 말줄임표까지 넣어 길이를 맞춥니다. */
function cutToOneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= PRODUCT_LINE_MAX) return flat;
  return `${flat.slice(0, PRODUCT_LINE_MAX - 1).trimEnd()}…`;
}

/** 천 단위 쉼표. formatPrice 는 상품 모듈에 있어 여기서는 따로 씁니다. */
function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR');
}

/* ── 메인 배너 ────────────────────────────────────────────── */

export type Banner = {
  id: string;
  imageUrl: string; // PC 1920x800 권장
  mobileImageUrl: string; // 모바일 1080x1350 권장. 비우면 PC 이미지를 씁니다.
  title: string;
  subtitle: string;
  buttonText: string;
  link: string;
  isVisible: boolean;
};

/**
 * 메인 화면 섹션 노출 (3-K)
 *
 * ★ 왜 필요한가
 *   준비가 덜 된 섹션을 잠시 감추고 싶을 때가 있습니다. (예: 분류 이미지를 아직 못 만듦)
 *   지금까지는 코드를 고쳐야만 가능했습니다.
 * ★ 끄면 그 섹션이 통째로 사라집니다. 빈 여백이 남지 않도록 section 태그째 그리지 않습니다.
 * ★ 새 키를 넣을 때는 MAIN_SECTIONS 에도 한 줄 넣어 주세요.
 *   관리자 화면은 그 목록을 돌면서 그리므로 화면을 따로 고칠 필요가 없습니다.
 */
export type MainSectionKey =
  | 'banner'
  | 'hero'
  | 'newArrival'
  | 'selection'
  | 'category'
  | 'brands';

export type MainSections = Record<MainSectionKey, boolean>;

/**
 * 관리자 화면에 그대로 쓰는 목록.
 * ★ where 는 그 섹션이 화면 어디에 있는지입니다. 이름만으로는 어느 섹션인지
 *   운영자가 알 수 없어 자리 설명을 반드시 붙입니다.
 */
export const MAIN_SECTIONS: {
  key: MainSectionKey;
  label: string;
  where: string;
}[] = [
  {
    key: 'banner',
    label: '메인 배너',
    where: '맨 위, 슬라이드로 넘어가는 큰 사진. 등록한 배너가 없으면 원래도 나오지 않습니다',
  },
  {
    key: 'hero',
    label: '히어로 (브랜드명·소개·버튼)',
    where:
      '배너 바로 아래, 브랜드명 큰 글씨와 버튼 두 개가 있는 자리. 글은 사이트 문구 > “메인 히어로 문구”, 버튼은 “메인 히어로 버튼” 에서 고칩니다',
  },
  {
    key: 'newArrival',
    label: 'NEW ARRIVAL (새로 들어온 상품)',
    where:
      '메인 위쪽, 새로 등록한 상품 카드가 나오는 자리. 상품을 고르는 것이 아니라 최근 등록순으로 자동입니다',
  },
  {
    key: 'selection',
    label: 'OUR STORY (브랜드 스토리)',
    where:
      '메인 중간, OUR STORY 라벨이 붙은 두 칸짜리 소개 글 자리. 글은 사이트 문구 > “메인 · 브랜드 스토리” 에서 고칩니다',
  },
  {
    key: 'category',
    label: 'CATEGORY (분류 바로가기)',
    where:
      '메인 중간, 분류 칸이 나오는 자리. 그 위의 제목·설명은 사이트 문구 > “메인 · CATEGORY 섹션 머리말” 에서 고칩니다 (지금은 비어 있어 제목이 안 나옵니다)',
  },
  {
    key: 'brands',
    label: 'BRANDS (취급 브랜드)',
    where:
      '메인 아래쪽, 브랜드 이름이 격자로 늘어선 자리. 어떤 브랜드가 나올지는 브랜드 관리의 노출·순서를 따릅니다',
  },
];

export const DEFAULT_MAIN_SECTIONS: MainSections = {
  banner: true,
  hero: true,
  newArrival: true,
  selection: true,
  category: true,
  brands: true,
};

export type DesignSettings = {
  banners: Banner[];
  /** 자동 슬라이드 간격(ms). 배너는 천천히 넘어가야 합니다. */
  interval: number;
  /** 메인 섹션 노출 (3-K). 기존 design 설정을 확장했습니다. */
  sections: MainSections;
  /**
   * 공유 미리보기 이미지 (og:image).
   *
   * ★ 카카오톡·메신저에 주소를 붙여 넣었을 때 뜨는 그림입니다.
   * ★ 비워 두면 app/opengraph-image.tsx 가 그려 주는 자동 생성 이미지를 씁니다.
   *   올려 두면 그 이미지가 대신 나갑니다.
   * ★ 상품 상세·브랜드·소개처럼 제 대표 이미지가 있는 페이지는 그대로 자기 사진을
   *   씁니다. 이 값은 내세울 이미지가 없는 페이지에만 쓰입니다.
   */
  ogImageUrl: string;
};

/** 공유 미리보기 권장 크기 — 카카오톡·페이스북·트위터가 모두 이 비율을 씁니다. */
export const OG_IMAGE_SIZE = '1200 × 630';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** 배너 최대 개수 */
export const MAX_BANNERS = 5;

/** 자동 슬라이드 기본 간격 — 배너는 상품 이미지와 달리 천천히 넘깁니다. */
export const DEFAULT_BANNER_INTERVAL = 5000;
export const MIN_BANNER_INTERVAL = 3000;
export const MAX_BANNER_INTERVAL = 15000;

/** 권장 이미지 크기 — 관리자 화면에 그대로 표시합니다. */
export const BANNER_SIZE_PC = '1920 × 800';
export const BANNER_SIZE_MOBILE = '1080 × 1350';

export const DEFAULT_DESIGN: DesignSettings = {
  banners: [],
  interval: DEFAULT_BANNER_INTERVAL,
  sections: DEFAULT_MAIN_SECTIONS,
  ogImageUrl: '',
};

export function emptyBanner(id: string): Banner {
  return {
    id,
    imageUrl: '',
    mobileImageUrl: '',
    title: '',
    subtitle: '',
    buttonText: '',
    link: '',
    isVisible: true,
  };
}

/* ── 결제·주문 (2-A) ──────────────────────────────────────── */

/**
 * 결제 수단 (4-A).
 *
 * ★ key 는 orders.payment_method 에 그대로 저장됩니다. 절대 바꾸지 마세요.
 *   이미 저장된 주문의 결제수단이 통째로 "알 수 없음" 이 됩니다.
 * ★ 한 주문은 결제수단 하나입니다.
 *   KSNET 결제창은 여러 수단을 한 번에 열 수도 있지만, 그러면 손님이 창 안에서
 *   무엇을 골랐는지 우리가 알 수 없습니다. 정산·현금영수증·분쟁 처리에 전부
 *   필요한 값이라, 주문서에서 미리 고르게 하고 그 수단 하나만 열어 줍니다.
 * ★ ready 는 "코드가 준비되었는지" 입니다. 실제로 손님에게 보일지는
 *   관리자 설정(PaymentSettings.methods)이 정합니다.
 */
export const PAYMENT_METHODS = [
  { key: 'card', label: '신용카드', ready: true },
  { key: 'kakaopay', label: '카카오페이', ready: true },
  { key: 'naverpay', label: '네이버페이', ready: true },
  { key: 'pg_banktransfer', label: '계좌이체 (실시간)', ready: true },
  { key: 'bank_transfer', label: '무통장입금', ready: true },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['key'];

export function paymentMethodLabel(key: string): string {
  return PAYMENT_METHODS.find((method) => method.key === key)?.label ?? key;
}

/**
 * 승인 응답 메시지에서 카드사(또는 간편결제사) 이름을 뽑습니다.
 *
 * ★ KSNET 은 카드사명을 따로 된 항목으로 주지 않습니다.
 *   응답 메시지(msg1)에 섞여 옵니다. 실제로 들어온 값:
 *     "현대카드 OK: 00007641"   → 현대카드
 *   그래서 "…카드 / …페이 / …은행" 으로 끝나는 낱말을 찾아 씁니다.
 *
 * ★ 못 찾으면 빈 문자열을 돌려줍니다. 화면은 그냥 결제수단 이름만 보여 줍니다.
 *   억지로 짜맞추지 않습니다. 틀린 카드사명을 보여 주는 것이 안 보여 주는 것보다 나쁩니다.
 */
export function cardIssuerFromMessage(message: string): string {
  const found = /([가-힣A-Za-z]{2,10}(?:카드|페이|은행))/.exec(message ?? '');
  return found ? found[1] : '';
}

/**
 * 손님·관리자 화면에 보여 줄 결제수단.
 *   신용카드 + "현대카드 OK: …"  →  "신용카드 (현대카드)"
 *   카카오페이 + "카카오페이 …"   →  "카카오페이"      (같은 말을 두 번 쓰지 않습니다)
 *   무통장입금                    →  "무통장입금"      (승인 메시지가 없습니다)
 */
export function paymentMethodDetail(key: string, pgMessage: string): string {
  const label = paymentMethodLabel(key);
  const issuer = cardIssuerFromMessage(pgMessage);
  if (!issuer || issuer === label || label.includes(issuer)) return label;
  return `${label} (${issuer})`;
}

/**
 * PG(KSNET)를 거치는 결제수단인지.
 * ★ 무통장입금만 PG 를 안 탑니다. 사장님이 통장을 직접 확인합니다.
 */
export function isPgMethod(key: string): boolean {
  return key !== 'bank_transfer' && PAYMENT_METHODS.some((method) => method.key === key);
}

/** 현금영수증을 신청받는 결제수단인지 — 무통장입금뿐입니다. */
export function acceptsCashReceipt(key: string): boolean {
  return key === 'bank_transfer';
}

/** 결제수단 켜고 끄기의 기본값. 계좌이체만 꺼 둡니다. */
export const DEFAULT_PAYMENT_METHOD_FLAGS: Record<PaymentMethod, boolean> = {
  card: true,
  kakaopay: true,
  naverpay: true,
  // ★ KSNET 오픈이 확인되지 않았습니다. 확인 후 관리자에서 켜세요.
  pg_banktransfer: false,
  bank_transfer: true,
};

/** 관리자 설정 화면에 함께 보여 줄 한 줄 설명 */
export const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  card: '국내 신용카드. KSNET 에 오픈되어 있습니다.',
  kakaopay: '카카오페이. KSNET 에 오픈되어 있습니다.',
  naverpay: '네이버페이. KSNET 에 오픈되어 있습니다.',
  pg_banktransfer: '계좌이체 — KSNET 오픈 확인 후 켜세요. 확인 전에는 결제창이 열리지 않습니다.',
  bank_transfer: '무통장입금. PG 를 거치지 않고 통장으로 직접 확인합니다. 현금영수증 신청도 이 수단에서만 받습니다.',
};

/**
 * 지금 손님에게 보여 줄 결제수단.
 * ★ 전부 꺼 버리면 주문 자체가 불가능해집니다.
 *   저장 단계에서 막지만, 혹시 예전 데이터가 전부 꺼져 있어도
 *   무통장입금 하나는 남도록 여기서 한 번 더 받칩니다.
 */
export function enabledPaymentMethods(
  flags: Record<string, boolean>
): { key: PaymentMethod; label: string }[] {
  const list = PAYMENT_METHODS.filter(
    (method) => method.ready && flags[method.key] === true
  ).map((method) => ({ key: method.key, label: method.label }));

  if (list.length > 0) return list;
  return [{ key: 'bank_transfer', label: '무통장입금' }];
}

export type PaymentSettings = {
  /** 입금 계좌 — ★ 주문 완료·주문 조회 화면에서만 보여 줍니다. */
  bankName: string;
  accountNo: string;
  accountHolder: string;
  /** 입금 기한 (시간). 주문 완료 화면에 "언제까지" 로 환산해 보여 줍니다. */
  depositHours: number;
  /**
   * 도서산간 추가배송비를 적용할 우편번호 규칙.
   * 한 줄에 하나씩. 세 가지 형태를 지원합니다.
   *   63000-63644  범위
   *   63*          앞자리 일치
   *   40200        정확히 일치
   */
  remoteAreaRules: string[];
  /**
   * 입금 기한이 지난 주문을 자동으로 취소할지.
   * ★ 기한은 depositHours 를 그대로 씁니다. (주문 완료 화면 안내와 같은 값)
   * ★ 무통장입금 주문에만 적용됩니다. 카드 주문은 아래 cardPendingMinutes 가 맡습니다.
   */
  autoCancelEnabled: boolean;
  /**
   * 결제대기로 남은 카드·간편결제 주문을 정리하기까지 기다리는 시간(분).
   *
   * ★★ 무통장입금(depositHours)과 다른 값이어야 합니다.
   *   무통장입금은 손님이 은행에 다녀와야 하니 하루를 줍니다.
   *   카드는 결제창을 닫으면 그걸로 끝이라 그렇게 오래 잡아 둘 이유가 없습니다.
   *   그동안 재고가 묶여 팔 수 있는 물건이 품절로 보입니다.
   *
   * ★ 그렇다고 너무 짧으면 안 됩니다. 카드번호를 찾아 입력하고,
   *   은행 앱으로 넘어가 인증하고 돌아오는 데 시간이 걸립니다.
   *   결제 중인 손님의 주문을 우리가 먼저 정리해 버리면 안 됩니다.
   *   기본 40분은 그 왕복을 넉넉히 잡은 값입니다.
   *
   * ★ 시간이 지났다고 바로 지우지 않습니다. KSNET 에 승인 여부를 먼저 묻습니다.
   *   (lib/card-sweep.ts)
   */
  cardPendingMinutes: number;
  /** 새 주문이 들어오면 텔레그램으로 알릴지 */
  telegramEnabled: boolean;
  /** 새 1:1 문의가 들어오면 텔레그램으로 알릴지 */
  inquiryTelegramEnabled: boolean;
  /** 구매안전(에스크로) 서비스 안내 문구. 비어 있으면 표시하지 않습니다. */
  escrowNotice: string;
  /** 구매안전 서비스 인증 이미지 주소. 비어 있으면 표시하지 않습니다. */
  escrowImageUrl: string;
  /** 인증 이미지를 눌렀을 때 열리는 확인 페이지 주소 (선택) */
  escrowLinkUrl: string;

  /* ── 4-A · 카드결제 ───────────────────────────────────── */

  /**
   * 결제수단 켜고 끄기. key 는 PAYMENT_METHODS 의 key 입니다.
   * ★ 꺼진 수단은 주문서에 아예 나오지 않고, 서버도 그 수단의 주문을 받지 않습니다.
   *   화면에서 숨기기만 하면 요청을 직접 만들어 보내는 것을 막지 못합니다.
   */
  methods: Record<string, boolean>;

  /**
   * KSNET 노티(거래내역통보)를 받았을 때 주문을 결제완료로 바꿀지.
   *
   * ★ 기본값은 끔입니다. 반드시 끈 채로 시작하세요.
   *   노티에는 인증이 없습니다. 주소만 알면 누구나 보낼 수 있습니다.
   *   주문번호와 금액만 맞추면 입금하지 않은 주문을 결제완료로 만들 수 있습니다.
   *   KSNET 에서 노티 규격과 발신 IP 를 확인받은 뒤에 켜세요.
   *   꺼 두어도 노티는 원문 그대로 저장되고 텔레그램으로 알려 드립니다.
   */
  ksnetNotifyAutoComplete: boolean;
};

/**
 * 도서산간 기본 규칙.
 * 제주 전역, 울릉군, 인천 옹진군 일부를 기본으로 넣어 두었습니다.
 * 실제 택배사 계약에 맞게 관리자 화면에서 고치세요.
 */
export const DEFAULT_REMOTE_AREA_RULES = [
  '63000-63644', // 제주특별자치도 전역
  '40200-40240', // 경상북도 울릉군
  '23004', // 인천 옹진군 백령면
  '23100-23116', // 인천 옹진군 (연평·대청 등)
  '22386-22388', // 인천 중구 도서 지역
  '53031-53033', // 경남 통영 한산·욕지 등
  '59790-59791', // 전남 신안 흑산 등
];

export const DEFAULT_PAYMENT: PaymentSettings = {
  bankName: '',
  accountNo: '',
  accountHolder: '',
  depositHours: 24,
  autoCancelEnabled: true,
  cardPendingMinutes: 40,
  remoteAreaRules: DEFAULT_REMOTE_AREA_RULES,
  telegramEnabled: true,
  inquiryTelegramEnabled: true,
  escrowNotice: '',
  escrowImageUrl: '',
  escrowLinkUrl: '',
  methods: DEFAULT_PAYMENT_METHOD_FLAGS,
  ksnetNotifyAutoComplete: false,
};

/** 입금 계좌를 다 채웠는지 — 안 채웠으면 주문을 받을 수 없습니다. */
export function hasBankAccount(payment: PaymentSettings): boolean {
  return Boolean(
    payment.bankName.trim() && payment.accountNo.trim() && payment.accountHolder.trim()
  );
}

/**
 * 우편번호가 도서산간에 해당하는지.
 * 규칙이 하나라도 맞으면 추가배송비를 더합니다.
 */
export function isRemoteArea(postcode: string, rules: string[]): boolean {
  const code = postcode.replace(/[^0-9]/g, '');
  if (code.length < 5) return false;

  return rules.some((raw) => {
    const rule = raw.trim();
    if (!rule) return false;

    // 63000-63644 — 범위
    const range = /^(\d{5})\s*-\s*(\d{5})$/.exec(rule);
    if (range) {
      const value = Number(code);
      return value >= Number(range[1]) && value <= Number(range[2]);
    }

    // 63* — 앞자리 일치
    if (rule.endsWith('*')) {
      return code.startsWith(rule.slice(0, -1));
    }

    // 40200 — 정확히 일치
    return code === rule.replace(/[^0-9]/g, '');
  });
}


/* ── 리뷰 (3-A) ───────────────────────────────────────────── */

export type ReviewSettings = {
  /** 리뷰 작성 화면에 보여 줄 긍정 태그 목록 */
  tags: string[];
  /** 새 리뷰가 등록되면 텔레그램으로 알릴지 */
  telegramEnabled: boolean;
};

export const DEFAULT_REVIEW_TAGS = [
  '빠른배송',
  '포장이 꼼꼼해요',
  '품질이 좋아요',
  '사진과 같아요',
  '가성비 좋아요',
  '재구매할게요',
];

export const DEFAULT_REVIEW: ReviewSettings = {
  tags: DEFAULT_REVIEW_TAGS,
  telegramEnabled: true,
};

/** 리뷰 첨부 최대 개수 */
export const MAX_REVIEW_ATTACHMENTS = 5;

/** 리뷰 본문 최대 글자수 */
export const MAX_REVIEW_LENGTH = 500;

/**
 * ★ 체험단·무상제공 후기에 반드시 붙는 문구입니다.
 *   표시광고법상 요구되는 표시이므로 숨기거나 흐리게 만들지 마세요.
 */
export const SPONSORED_NOTICE = '※ 제품을 무상으로 제공받아 작성된 후기입니다';

/* ── 포인트 (3-A) ─────────────────────────────────────────── */

/** 적립 규칙 한 줄 — 켜고 끌 수 있고 금액을 정합니다. */
export type PointRule = {
  enabled: boolean;
  amount: number;
};

export type PointSettings = {
  /** 회원가입 축하 포인트 (가입 즉시 1회) */
  signup: PointRule;
  /** 글만 있는 리뷰 */
  reviewText: PointRule;
  /** 사진·동영상이 하나라도 있는 리뷰 */
  reviewPhoto: PointRule;
  /**
   * 구매 적립. amount 는 금액이 아니라 결제금액 대비 % 입니다.
   * ★ 주문 즉시가 아니라 배송완료·구매확정 시점에 지급합니다.
   *   주문 직후에 주면 취소·반품 때 회수가 복잡해집니다.
   */
  purchase: PointRule;
  /** 생일 축하. 연 1회만 지급합니다. */
  birthday: PointRule;
  /** 이 금액 이상부터 쓸 수 있습니다. */
  minUse: number;
  /** 상품금액 대비 최대 사용 비율 (%) */
  maxUseRate: number;
  /** 포인트 유효기간 (개월). 0 이면 소멸하지 않습니다. */
  expireMonths: number;
  /** 보유 포인트 알림 팝업을 띄울지 */
  popupEnabled: boolean;
  /** 팝업 재표시 간격 (시간) */
  popupIntervalHours: number;
};

export const DEFAULT_POINTS: PointSettings = {
  signup: { enabled: true, amount: 3000 },
  reviewText: { enabled: true, amount: 500 },
  reviewPhoto: { enabled: true, amount: 2000 },
  purchase: { enabled: true, amount: 2 },
  birthday: { enabled: true, amount: 5000 },
  minUse: 1000,
  maxUseRate: 100,
  expireMonths: 12,
  popupEnabled: true,
  popupIntervalHours: 1,
};

/**
 * 구매 적립 예상 금액. 원 단위 아래는 버립니다.
 * ★ DB 조회 없이 화면에서 그대로 계산합니다.
 */
export function expectedPurchasePoints(
  amount: number,
  settings: Pick<PointSettings, 'purchase'>
): number {
  if (!settings.purchase.enabled || settings.purchase.amount <= 0) return 0;
  return Math.floor((Math.max(0, amount) * settings.purchase.amount) / 100);
}

/** 리뷰 한 건에 지급될 포인트 (사진이 있으면 포토 리뷰 금액) */
export function expectedReviewPoints(
  hasAttachment: boolean,
  settings: Pick<PointSettings, 'reviewText' | 'reviewPhoto'>
): number {
  const rule = hasAttachment ? settings.reviewPhoto : settings.reviewText;
  return rule.enabled ? rule.amount : 0;
}

/** 포인트 적립·사용 사유 — 내역 화면에 한글로 보여 줍니다. */
export const POINT_REASON_LABEL: Record<string, string> = {
  signup: '회원가입 축하',
  review_text: '리뷰 작성',
  review_photo: '포토 리뷰 작성',
  purchase: '구매 적립',
  birthday: '생일 축하',
  order_use: '주문 사용',
  admin: '관리자 조정',
  cancel: '주문 취소 반환',
  expire: '유효기간 만료',
  withdraw: '탈퇴 소멸',
  referral: '친구 초대 목표 달성',
};

export function pointReasonLabel(reason: string): string {
  return POINT_REASON_LABEL[reason] ?? reason;
}

/**
 * 주문에서 실제로 쓸 수 있는 포인트 상한.
 * ★ 화면 표시용이자 서버 검증용입니다. 같은 함수를 양쪽에서 씁니다.
 */
export function maxUsablePoints(
  itemsTotal: number,
  balance: number,
  // 비율만 있으면 됩니다. 주문서 화면은 적립 규칙까지 알 필요가 없습니다.
  settings: Pick<PointSettings, 'maxUseRate'>
): number {
  if (balance <= 0) return 0;
  const byRate = Math.floor((itemsTotal * settings.maxUseRate) / 100);
  return Math.max(0, Math.min(balance, byRate, itemsTotal));
}

/* ── 판매정보 (3-B) ───────────────────────────────────────── */

/**
 * 상품 상세 [판매정보] 탭에 그대로 실리는 안내입니다.
 * 전 상품 공통이라 상품마다 따로 적을 필요가 없습니다.
 *
 * ★ 판매자 정보(상호·사업자등록번호·대표자·연락처)는 여기에 두지 않습니다.
 *   설정 > 스토어 정보에 이미 있는 값을 그대로 가져다 씁니다. (중복 입력 금지)
 * ★ 배송비와 반품 주소도 비워 두면 설정 > 배송·반품 값을 그대로 씁니다.
 */
export type SalesSettings = {
  /** 비워 두면 배송 설정의 기본배송비·무료배송 기준으로 문장을 만들어 씁니다. */
  shippingNote: string;
  deliveryPeriod: string;
  exchangePolicy: string;
  exchangeCost: string;
  notAllowed: string;
  /** 비워 두면 배송 설정의 반품 주소를 씁니다. */
  returnAddress: string;
  asInfo: string;
};

export const DEFAULT_SALES: SalesSettings = {
  shippingNote: '',
  deliveryPeriod: [
    '결제(입금) 확인 후 2~5일 이내에 발송됩니다.',
    '주말·공휴일은 발송이 되지 않으며, 연휴나 기상 상황에 따라 하루이틀 늦어질 수 있습니다.',
  ].join('\n'),
  exchangePolicy: [
    '상품을 받으신 날부터 7일 이내에 교환·반품을 신청하실 수 있습니다.',
    '상품에 하자가 있거나 표시와 다른 경우에는 받으신 날부터 3개월 이내, 그 사실을 안 날부터 30일 이내에 신청하실 수 있습니다.',
    '신청은 고객센터 또는 1:1 문의로 접수해 주세요.',
  ].join('\n'),
  exchangeCost: [
    '단순 변심으로 교환·반품하실 때는 왕복 배송비를 부담해 주셔야 합니다.',
    '상품 불량이나 오배송일 때는 저희가 부담합니다.',
  ].join('\n'),
  notAllowed: [
    '· 사용하셨거나 세탁하신 경우',
    '· 택(TAG)을 떼거나 상품 포장을 훼손하신 경우',
    '· 향수·화장품 냄새, 오염, 애완동물 털 등이 묻은 경우',
    '· 시간이 지나 재판매가 어려워진 경우',
  ].join('\n'),
  returnAddress: '',
  asInfo: [
    '착용 중 발생한 하자는 구입일로부터 1년 이내에 무상으로 확인해 드립니다.',
    '수선이 필요한 경우 고객센터로 먼저 연락 주세요.',
  ].join('\n'),
};

/* ── 문구 · 이벤트 (3-B) ──────────────────────────────────── */

/** 화면 맨 위에 한 줄로 걸리는 띠배너 */
export type RibbonSettings = {
  enabled: boolean;
  text: string;
  linkUrl: string;
  /** 디자인 토큰만 씁니다. */
  tone: 'ink' | 'wine' | 'stone';
  /** YYYY-MM-DD. 비워 두면 제한 없음 */
  startsAt: string;
  endsAt: string;
};

export type EventSettings = {
  /** 가입 완료 화면 문구. {points} 자리에 지급 포인트가 들어갑니다. */
  signupComplete: string;
  /** 마이페이지 첫 방문 시 보여 줄 가입 축하 안내 */
  mypageWelcome: string;
  /** 상품 목록·상세의 적립 안내. {points} 자리에 계산된 적립 포인트가 들어갑니다. */
  earnNotice: string;
  ribbon: RibbonSettings;
};

export const DEFAULT_EVENT: EventSettings = {
  signupComplete:
    '가입해 주셔서 고맙습니다. 축하 포인트 {points}P 를 드렸습니다. 주문하실 때 바로 쓰실 수 있습니다.',
  mypageWelcome:
    '첫 방문을 환영합니다. 가입 축하 포인트가 들어와 있으니 마음에 드는 상품을 찾아보세요.',
  earnNotice: '구매 시 {points}P 적립',
  ribbon: {
    enabled: false,
    text: '',
    linkUrl: '',
    tone: 'ink',
    startsAt: '',
    endsAt: '',
  },
};

/* ── 추천 코드 (3-F) ─────────────────────────────────────── */

/**
 * ★ 여기에는 "방문 몇 P · 가입 몇 P" 같은 항목이 없습니다.
 *   방문·가입 자체로는 포인트를 주지 않기 때문입니다. 숫자만 셉니다.
 *   보상은 관리자가 만든 목표를 달성했을 때만 나갑니다. (referral_goals)
 */
export type ReferralSettings = {
  /** 기능 자체를 끌 수 있게 해 둡니다. 끄면 초대 화면과 공유 코드가 사라집니다. */
  enabled: boolean;
  /**
   * 한 달에 추천 보상으로 나갈 수 있는 포인트 상한.
   * ★ 어뷰징이 터졌을 때 피해를 이 금액에서 멈추게 하는 안전장치입니다.
   *   넘으면 지급하지 않고 보류로 두고 관리자에게 알립니다. 0 이면 상한 없음.
   */
  monthlyPointCap: number;
  /** 초대 화면 맨 위 안내 문구 */
  inviteNotice: string;
  /** 공유할 때 따라붙는 한 줄. {store} 자리에 스토어 이름이 들어갑니다. */
  shareLine: string;
  /**
   * 상품 상세 공유 버튼 아래 안내 — 진행 중인 목표 이벤트가 있을 때 (로그인 회원).
   * ★ 이벤트가 없으면 회원에게는 아무 문구도 보여 주지 않습니다.
   *   받을 것이 없는데 "받아가세요" 라고 적으면 그다음부터 아무도 안 믿습니다.
   */
  shareNoticeEvent: string;
  /**
   * 상품 상세 공유 버튼 아래 안내 — 비회원.
   * 비회원에게는 추천 코드가 없어 공유해도 실적이 쌓이지 않습니다. 그래서 로그인을 권합니다.
   */
  shareNoticeGuest: string;
};

export const DEFAULT_REFERRAL: ReferralSettings = {
  enabled: true,
  monthlyPointCap: 500000,
  inviteNotice:
    '친구에게 링크를 보내 주세요. 친구가 가입하거나 첫 주문을 마치면 아래 목표가 채워집니다.',
  shareLine: '{store}에서 확인해 보세요',
  shareNoticeEvent: '이벤트 중! 친구를 초대하고 포인트와 사은품을 받아가세요',
  shareNoticeGuest: '로그인하면 친구 초대 혜택을 받으실 수 있어요',
};

/* ── SNS (3-G) ────────────────────────────────────────────── */

/**
 * 푸터·브랜드 페이지에 나가는 SNS 항목.
 *
 * ★ 나중에 유튜브·페이스북을 붙이려면 세 곳만 고치면 됩니다.
 *     1) SnsKey 에 key 추가
 *     2) SNS_ITEMS 에 한 줄 추가 (관리자 입력칸이 저절로 생깁니다)
 *     3) components/SnsIcons.tsx 의 SNS_ICONS 에 아이콘 추가
 *   화면과 관리자 폼은 모두 SNS_ITEMS 를 돌면서 그리므로 손댈 필요가 없습니다.
 *
 * ★ 위챗은 여기에 없습니다. 링크가 아니라 QR 이미지라 동작이 달라
 *   wechatQrUrl 로 따로 둡니다. (눌러도 사이트 밖으로 나가지 않습니다)
 */
export type SnsKey = 'instagram' | 'threads' | 'tiktok';

export const SNS_ITEMS: {
  key: SnsKey;
  label: string;
  placeholder: string;
}[] = [
  { key: 'instagram', label: '인스타그램', placeholder: 'https://www.instagram.com/계정명' },
  { key: 'threads', label: '스레드', placeholder: 'https://www.threads.net/@계정명' },
  { key: 'tiktok', label: '틱톡', placeholder: 'https://www.tiktok.com/@계정명' },
];

export type SnsSettings = {
  /** key 하나에 주소 하나. 비워 두면 화면에서 그 아이콘만 빠집니다. */
  links: Record<SnsKey, string>;
  /** 위챗 QR 이미지 주소. 비워 두면 위챗 아이콘이 나오지 않습니다. */
  wechatQrUrl: string;
};

export const DEFAULT_SNS: SnsSettings = {
  links: { instagram: '', threads: '', tiktok: '' },
  wechatQrUrl: '',
};

/** 지금 그릴 아이콘이 하나라도 있는지. 없으면 SNS 줄 자체를 그리지 않습니다. */
export function hasAnySns(sns: SnsSettings): boolean {
  return (
    SNS_ITEMS.some((item) => sns.links[item.key].trim()) || Boolean(sns.wechatQrUrl.trim())
  );
}

export const RIBBON_TONES = [
  { key: 'ink', label: '먹색 (기본)' },
  { key: 'wine', label: '와인' },
  { key: 'stone', label: '연회색' },
] as const;

/** 문구 안의 {points} 같은 치환자를 채웁니다. */
export function fillTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match
  );
}

/** 띠배너를 지금 보여 줘야 하는지 (YYYY-MM-DD 기준, 한국시간) */
export function isRibbonActive(ribbon: RibbonSettings, today: string): boolean {
  if (!ribbon.enabled || !ribbon.text.trim()) return false;
  if (ribbon.startsAt && today < ribbon.startsAt) return false;
  if (ribbon.endsAt && today > ribbon.endsAt) return false;
  return true;
}

/* ── 상품 가져오기 (3-D) ──────────────────────────────────── */

/**
 * 가져올 때마다 상세페이지 앞뒤에 자동으로 붙는 블록.
 * ★ 매번 손으로 넣던 브랜드 배너·배송 안내를 한 번만 등록해 두고 씁니다.
 *   상품마다 개별로 끌 수 있습니다.
 */
export type ImportBlock = {
  enabled: boolean;
  /** 'image' 면 imageUrl, 'text' 면 body 를 씁니다. */
  kind: 'image' | 'text';
  imageUrl: string;
  body: string;
};

/** 자주 쓰는 SEO 문구. {상품명} 을 넣으면 가져올 때 실제 상품명으로 바뀝니다. */
export type ImportTemplate = {
  id: string;
  title: string;
  body: string;
};

export type ImportSettings = {
  /** 상세페이지 맨 위에 붙습니다. */
  topBlock: ImportBlock;
  /** 상세페이지 맨 아래에 붙습니다. */
  bottomBlock: ImportBlock;
  templates: ImportTemplate[];
};

export function emptyImportBlock(): ImportBlock {
  return { enabled: false, kind: 'image', imageUrl: '', body: '' };
}

export const DEFAULT_IMPORT: ImportSettings = {
  topBlock: emptyImportBlock(),
  bottomBlock: emptyImportBlock(),
  templates: [],
};

/** 템플릿 치환 — 지금은 {상품명} 하나만 씁니다. */
export function fillTemplate(body: string, productName: string): string {
  return body.split('{상품명}').join(productName);
}

/* ── 팝업 (3-A) ───────────────────────────────────────────── */

export const POPUP_POSITIONS = [
  { key: 'left', label: '왼쪽' },
  { key: 'center', label: '가운데' },
  { key: 'right', label: '오른쪽' },
] as const;

export type PopupPosition = (typeof POPUP_POSITIONS)[number]['key'];

export const POPUP_SHOW_ON = [
  { key: 'home', label: '메인 화면에서만' },
  { key: 'all', label: '모든 화면' },
] as const;

/* ── 구글 애널리틱스 ──────────────────────────────────────── */

export type AnalyticsSettings = {
  /** G-XXXXXXXXXX 형태의 GA4 측정 ID. 비어 있으면 스크립트를 넣지 않습니다. */
  ga4Id: string;
};

/**
 * ★ 측정 ID 를 기본값으로 박아 둡니다. (3-M)
 *   비밀이 아니라 어차피 HTML 에 실려 나가는 값이고, 여기 두면 배포하는 순간
 *   집계가 시작됩니다. 관리자가 굳이 한 번 입력하지 않아도 됩니다.
 * ★ 관리자 > 설정 > 구글 애널리틱스 에서 저장하면 그 값이 이깁니다.
 *   측정 ID 를 바꾸거나 잠시 끄고 싶으면(빈 값) 그쪽에서 하세요.
 */
export const DEFAULT_ANALYTICS: AnalyticsSettings = { ga4Id: 'G-H0XVMGX03D' };

export const GA4_ID_PATTERN = /^G-[A-Z0-9]{6,12}$/;

/* ── 메인 히어로 버튼 (3-J) ───────────────────────────────── */

/**
 * 메인 첫 화면의 버튼 두 개.
 *
 * ★ 문구와 링크를 함께 다뤄야 해서 사이트 문구(copy)에 넣지 못했습니다.
 *   copy 는 소제목+본문 두 칸이라 링크를 넣을 자리가 마땅치 않고,
 *   본문 칸은 편집기가 만드는 HTML 이라 주소를 그대로 담기에 맞지 않습니다.
 * ★ 두 번째 버튼은 문구를 비우면 화면에서 사라집니다.
 *   운영자가 원할 때 뺄 수 있어야 합니다.
 */
export type HeroButtonsSettings = {
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

export const DEFAULT_HERO_BUTTONS: HeroButtonsSettings = {
  primaryLabel: '컬렉션 보기',
  primaryHref: '/products',
  secondaryLabel: '편집숍 소개',
  secondaryHref: '/about',
};

/* ── 편집숍 소개 (/about) 대표 이미지 (3-I) ───────────────── */

/**
 * /about 맨 위 대표 이미지.
 *
 * ★ 문구가 아니라 이미지라 사이트 문구(copy)에 넣지 못했습니다.
 *   copy 는 소제목+본문 두 칸짜리 구조라 이미지 주소를 넣을 자리가 없습니다.
 *   그래서 site_settings 에 key 하나(aboutPage)를 따로 둡니다.
 * ★ 비워 두면 /about 은 이미지 영역 자체를 건너뛰고 제목부터 시작합니다.
 *   회색 네모를 띄우는 것보다 없는 편이 낫습니다.
 */
export type AboutPageSettings = {
  imageUrl: string;
};

export const DEFAULT_ABOUT_PAGE: AboutPageSettings = { imageUrl: '' };

/** 권장 이미지 크기 — 관리자 화면에 그대로 표시합니다. (가로로 넓은 배너 비율) */
export const ABOUT_IMAGE_SIZE = '1600 × 700';

/**
 * 분류 대표 이미지 권장 크기. (3-K)
 * ★ 메인 CATEGORY 카드는 3:4 로 잘라 씁니다. 데스크톱 네 칸 기준 한 칸이 약 320px 이라
 *   고해상도 화면(2배)까지 감안해 가로 800 을 잡았습니다. 800 × 1067 이 3:4 입니다.
 */
export const CATEGORY_IMAGE_SIZE = '800 × 1067 (3:4)';

/* ── 사이트 문구 ──────────────────────────────────────────── */

/**
 * 문구 한 덩어리. heading 은 비워 둘 수 있고, body 는 편집기에서 만든 HTML 입니다.
 * (굵게 · 줄바꿈 · 링크 · 정렬만 허용합니다. lib/product-utils.ts 의 sanitizeRichText)
 */
export type CopyBlock = {
  heading: string;
  body: string;
};

export type CopySection = CopyBlock[];

/**
 * 관리자에서 고칠 수 있는 문구 항목.
 *
 * ★ 여기 적힌 순서대로 관리자 화면에 나옵니다. 아래 COPY_GROUPS 로 묶이므로
 *   같은 그룹끼리 붙여 두세요. 그룹이 화면에서 갈라져 보입니다.
 * ★ 이름(키)은 DB 에 그대로 저장됩니다. 이미 저장한 문구가 있으면
 *   이름을 바꾸는 순간 그 문구를 잃습니다. 순서는 바꿔도 안전합니다.
 */
export const COPY_KEYS = [
  // 메인 화면
  'homeHero',
  'homeStory',
  'homeCategory',
  'orderSteps',
  // 편집숍 소개 (/about) — 3-I 에서 항목으로 쪼갰습니다
  'aboutHero',
  'aboutChoose',
  'about',
  'aboutBrands',
  'aboutContact',
  // 주문·배송 안내
  'orderHero',
  'cartEmpty',
  'cartPayment',
  'cartCopyNote',
  'order',
  'guide',
  // 약관·기타
  'terms',
  'privacy',
  'notFound',
] as const;

export type CopyKey = (typeof COPY_KEYS)[number];

export type CopySettings = Record<CopyKey, CopySection>;

/**
 * 문구 안의 치환자를 스토어 정보 값으로 바꿉니다.
 * 사업자 정보를 한 번만 고치면 약관·안내 페이지에 그대로 반영됩니다.
 */
export function applyStoreTokens(text: string, store: StoreSettings): string {
  const table: Record<string, string> = {
    name: store.name,
    nameKo: store.nameKo,
    slogan: store.slogan,
    intro: store.intro,
    phone: store.phone,
    email: store.email,
    hours: store.hours,
    company: store.business.company,
    ceo: store.business.ceo,
    regNumber: store.business.regNumber,
    mailOrder: store.business.mailOrder,
    address: store.business.address,
  };
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key: string) =>
    key in table ? table[key] : match
  );
}

/** 치환자 목록 — 관리자 편집기 아래에 안내로 보여 줍니다. */
export const STORE_TOKENS: { token: string; label: string }[] = [
  { token: '{{name}}', label: '브랜드명' },
  { token: '{{nameKo}}', label: '한글 브랜드명' },
  { token: '{{slogan}}', label: '슬로건' },
  { token: '{{phone}}', label: '고객센터 번호' },
  { token: '{{email}}', label: '이메일' },
  { token: '{{hours}}', label: '운영시간' },
  { token: '{{company}}', label: '상호' },
  { token: '{{ceo}}', label: '대표자' },
  { token: '{{regNumber}}', label: '사업자등록번호' },
  { token: '{{mailOrder}}', label: '통신판매업신고번호' },
  { token: '{{address}}', label: '주소' },
];

/**
 * 문구 항목을 묶는 그룹. 관리자 화면에서 소제목으로 나옵니다.
 * ★ 항목이 열네 개가 되면서 평면 나열로는 찾기 어려워졌습니다.
 *   운영자가 항목을 못 찾으면 없는 기능과 같습니다.
 */
export const COPY_GROUPS = [
  { key: 'home', label: '메인 화면' },
  { key: 'about', label: '편집숍 소개' },
  { key: 'order', label: '주문·배송 안내' },
  { key: 'legal', label: '약관·기타' },
] as const;

export type CopyGroupKey = (typeof COPY_GROUPS)[number]['key'];

/** 문구 항목 안내 — 관리자 화면에 그대로 씁니다. */
/**
 * 문구 항목별 안내.
 *
 * ★ path 에 #앵커를 넣습니다.
 *   한 페이지에 항목이 여섯 개씩 붙어 있어, "페이지 보기" 가 페이지 맨 위만 열면
 *   운영자가 그 문구를 눈으로 찾아 내려가야 했습니다. 앵커로 그 자리에 바로 세웁니다.
 *   (도착하면 components/AnchorFlash.tsx 가 그 영역을 잠깐 밝힙니다)
 *
 * ★ where 는 "화면 어디" 한 줄입니다. hint 는 그보다 긴 주의사항입니다.
 *   둘을 한 덩어리로 두면 자리 설명이 주의사항에 묻혀 안 읽힙니다.
 *
 * ★ limits 는 "적어도 화면에 안 나오는 칸" 을 미리 알려 줍니다.
 *   편집기는 모든 항목에 소제목 칸과 [문단 추가] 를 똑같이 보여 주는데,
 *   화면이 그것을 다 쓰지는 않습니다. 적어 놓고 왜 안 나오는지 찾게 두면 안 됩니다.
 *   값은 그대로 저장됩니다. 화면이 다시 쓰게 되면 그때 나옵니다.
 */
export const COPY_META: Record<
  CopyKey,
  {
    title: string;
    /** 화면 어디에 나오는지 한 줄 */
    where: string;
    hint: string;
    /** "페이지 보기" 가 열 주소. #앵커까지 붙입니다. */
    path: string;
    blockLabel: string;
    group: CopyGroupKey;
    /** 저장은 되지만 화면이 쓰지 않는 칸이 있으면 여기에 적습니다. */
    limits?: string;
  }
> = {
  homeHero: {
    group: 'home',
    title: '메인 히어로 문구',
    where: '메인 첫 화면 · 배너 바로 아래 브랜드명과 버튼이 있는 자리',
    hint: '소제목이 명조 한 줄(슬로건), 본문이 그 아래 설명입니다. ★ 메인 섹션 노출에서 「히어로」를 끄면 배너만 남고 이 문구는 나오지 않습니다.',
    path: '/#home-hero',
    blockLabel: '문단',
  },
  homeStory: {
    group: 'home',
    title: '메인 · 브랜드 스토리 (화면에는 OUR STORY)',
    where: '메인 중간 · OUR STORY 라벨이 붙은 두 칸짜리 소개 글 자리',
    hint: '첫 소제목이 섹션 제목으로 쓰입니다. ★ 메인 섹션 노출의 「OUR STORY」 스위치가 이 자리를 켜고 끕니다. 스위치 이름이 예전에는 SELECTION 이었습니다.',
    path: '/#home-story',
    blockLabel: '문단',
    limits: '두 번째 문단부터는 소제목이 화면에 나오지 않습니다. 본문만 이어 붙습니다.',
  },
  homeCategory: {
    group: 'home',
    title: '메인 · CATEGORY 섹션 머리말',
    where: '메인 중간 · 분류 네 칸 바로 위',
    hint: '★ 기본값은 비어 있습니다. 바로 아래에 분류 네 칸이 이어져 굳이 물어볼 말이 없다고 보고 3-J 에서 뺐습니다. 여기에 적으면 다시 나옵니다. (영문 라벨 CATEGORY 는 적지 않아도 항상 나옵니다)',
    path: '/#home-category',
    blockLabel: '머리말',
  },
  /*
   * ★ 묶음을 '메인 화면' 에서 '주문·배송 안내' 로 옮겼습니다.
   *   3-J 에서 메인 화면의 HOW TO ORDER 섹션을 뺐는데 항목은 메인 묶음에 남아 있었습니다.
   *   지금 이 문구가 나오는 곳은 /order 한 곳뿐이라, 메인 묶음에 두면 못 찾습니다.
   *   키(orderSteps)와 저장된 값은 그대로입니다. 관리자에서 보이는 자리만 옮겼습니다.
   */
  orderSteps: {
    group: 'order',
    title: 'HOW TO ORDER — 주문 방법 3단계',
    where: '장바구니·주문 페이지 아래 · 「주문 절차」 세 칸',
    hint: '★ 3-J 에서 메인 화면에서는 뺐습니다. 지금은 /order 의 「주문 절차」에만 나옵니다. 메인을 아무리 고쳐도 바뀌지 않습니다. 블록 하나가 한 단계이며 01·02·03 번호는 자동으로 붙습니다.',
    path: '/order#order-steps',
    blockLabel: '단계',
  },
  aboutHero: {
    group: 'about',
    title: '편집숍 소개 · 제목과 부제',
    where: '편집숍 소개 맨 위 · 큰 제목과 그 아래 한 줄',
    hint: '소제목이 큰 제목(비우면 브랜드명), 본문이 그 아래 명조 부제입니다.',
    path: '/about#about-hero',
    blockLabel: '제목',
    limits: '첫 번째 블록만 화면에 나옵니다. 두 번째부터는 저장돼도 보이지 않습니다.',
  },
  aboutChoose: {
    group: 'about',
    title: '편집숍 소개 · 고르는 기준 (섹션 제목)',
    where: '편집숍 소개 중간 · HOW WE CHOOSE 라벨 아래 제목과 머리말',
    hint: '바로 아래 「고르는 기준 항목」 네 칸의 머리말입니다. 소제목을 비우면 “고르는 기준” 이 나옵니다.',
    path: '/about#about-choose',
    blockLabel: '머리말',
    limits: '첫 번째 블록만 화면에 나옵니다. 두 번째부터는 저장돼도 보이지 않습니다.',
  },
  about: {
    group: 'about',
    title: '편집숍 소개 · 고르는 기준 항목',
    where: '편집숍 소개 중간 · 01·02·03… 번호가 붙은 두 칸짜리 목록',
    hint: '블록 하나가 항목 하나입니다. 번호는 자동으로 붙습니다.',
    path: '/about#about-principles',
    blockLabel: '항목',
  },
  aboutBrands: {
    group: 'about',
    title: '편집숍 소개 · 취급 브랜드 (섹션 제목)',
    where: '편집숍 소개 아래 · 브랜드 이름이 늘어선 자리의 제목과 머리말',
    hint: '브랜드 목록 자체는 브랜드 관리에서 옵니다. 여기서는 그 위의 제목과 설명만 고칩니다.',
    path: '/about#about-brands',
    blockLabel: '머리말',
    limits: '첫 번째 블록만 화면에 나옵니다. 두 번째부터는 저장돼도 보이지 않습니다.',
  },
  aboutContact: {
    group: 'about',
    title: '편집숍 소개 · 문의 안내',
    where: '편집숍 소개 맨 아래 · 카카오톡 문의 버튼 위',
    hint: '소제목이 제목(비우면 “문의”), 본문이 그 아래 안내입니다.',
    path: '/about#about-contact',
    blockLabel: '문단',
    limits: '첫 번째 블록만 화면에 나옵니다. 두 번째부터는 저장돼도 보이지 않습니다.',
  },
  orderHero: {
    group: 'order',
    title: '장바구니 · 주문 페이지 머리말',
    where: '장바구니·주문 페이지 맨 위 · 제목과 그 아래 안내',
    hint: '소제목은 페이지 제목이자 검색 결과 제목으로도 쓰입니다. 본문 앞부분이 검색 결과 설명이 됩니다.',
    path: '/order#order-hero',
    blockLabel: '문단',
  },
  cartEmpty: {
    group: 'order',
    title: '장바구니가 비어 있을 때',
    where:
      '장바구니·주문 페이지 왼쪽 · 담은 상품이 하나도 없을 때 그 자리 (장바구니가 비어 있어야 보입니다)',
    hint: '소제목이 굵은 첫 줄, 본문이 그 아래 설명입니다. 아래에 [전체 상품 보기] 버튼과 최근 본 상품이 이어집니다. ★ 장바구니에 상품이 있으면 이 문구는 나오지 않습니다.',
    path: '/order#cart-box',
    blockLabel: '문단',
  },
  cartPayment: {
    group: 'order',
    title: '결제 수단 안내 (주문하기 버튼 아래)',
    where:
      '장바구니·주문 페이지 오른쪽 요약 상자 · [주문하기] 버튼 바로 아래 (장바구니에 상품이 있어야 보입니다)',
    hint: '★ 결제 수단을 알리는 문구는 이 항목 하나뿐입니다. 결제 방식이 바뀌면 여기만 고치면 됩니다. ★ 취소·환불에 걸리는 기간은 KSNET 확인 중이라 기본 문구에 “며칠”로 두었습니다. 정확한 기간을 확인하신 뒤 여기서 고쳐 주세요. 지키지 못할 기간을 적으면 분쟁이 됩니다.',
    path: '/order#payment-notice',
    blockLabel: '문단',
    limits: '소제목은 화면에 나오지 않습니다. 본문만 나갑니다.',
  },
  cartCopyNote: {
    group: 'order',
    title: '주문 내역 복사 안내',
    where:
      '장바구니·주문 페이지 오른쪽 요약 상자 맨 아래 · [주문 내역 복사하기]·[카카오톡 문의] 버튼 밑 한 줄 (장바구니에 상품이 있어야 보입니다)',
    hint: '온라인 주문이 어려운 손님에게 카카오톡으로 보내도록 안내하는 자리입니다.',
    path: '/order#cart-copy-note',
    blockLabel: '문단',
    limits: '소제목은 화면에 나오지 않습니다. 본문만 나갑니다.',
  },
  order: {
    group: 'order',
    title: '주문 절차 아래 상세 안내',
    where: '장바구니·주문 페이지 맨 아래 · 주문 절차 세 칸 밑의 네모 상자 안',
    hint: '★ 결제 수단(무통장입금·카드) 자체는 여기 적지 마세요. 위 “결제 수단 안내” 한 곳에서만 관리합니다. 여기에는 입금 계좌 위치·자동취소·입금자명처럼 절차에 관한 것만 적습니다.',
    path: '/order#order-notes',
    blockLabel: '항목',
  },
  guide: {
    group: 'order',
    title: '배송·교환·반품 안내',
    where: '배송·교환·반품 안내 페이지 본문 전체',
    hint: '블록 하나가 소제목 있는 한 덩어리입니다. 상품 상세의 [판매정보] 탭은 이 문구가 아니라 설정 > 판매정보에서 옵니다.',
    path: '/guide',
    blockLabel: '항목',
  },
  terms: {
    group: 'legal',
    title: '이용약관',
    where: '이용약관 페이지 본문 전체',
    hint: '블록 하나가 조문 하나입니다. {{company}} 같은 치환자를 쓰면 스토어 정보에서 값을 가져옵니다.',
    path: '/terms',
    blockLabel: '조문',
  },
  privacy: {
    group: 'legal',
    title: '개인정보처리방침',
    where: '개인정보처리방침 페이지 본문 전체',
    hint: '블록 하나가 항목 하나입니다. {{company}} 같은 치환자를 쓰면 스토어 정보에서 값을 가져옵니다.',
    path: '/privacy',
    blockLabel: '항목',
  },
  notFound: {
    group: 'legal',
    title: '404 페이지 문구',
    where: '없는 주소로 들어왔을 때 나오는 화면 · 제목과 그 아래 설명',
    hint: '주소가 바뀌었거나 판매가 끝난 상품 주소로 들어온 손님이 봅니다. [페이지 보기] 를 누르면 없는 주소를 열어 실제 404 화면을 보여 줍니다.',
    path: '/404-미리보기',
    blockLabel: '문단',
    limits: '두 번째 문단부터는 소제목이 화면에 나오지 않습니다. 본문만 이어 붙습니다.',
  },
};
