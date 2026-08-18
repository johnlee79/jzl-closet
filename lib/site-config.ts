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

export type DesignSettings = {
  banners: Banner[];
  /** 자동 슬라이드 간격(ms). 배너는 천천히 넘어가야 합니다. */
  interval: number;
};

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
   */
  autoCancelEnabled: boolean;
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
  remoteAreaRules: DEFAULT_REMOTE_AREA_RULES,
  telegramEnabled: true,
  inquiryTelegramEnabled: true,
  escrowNotice: '',
  escrowImageUrl: '',
  escrowLinkUrl: '',
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

/** 결제 수단 — 지금은 무통장입금만 씁니다. 카드는 자리만 비워 둡니다. */
export const PAYMENT_METHODS = [
  { key: 'bank_transfer', label: '무통장입금 (계좌이체)', ready: true },
  { key: 'card', label: '신용카드 · 간편결제', ready: false },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['key'];

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

export const DEFAULT_ANALYTICS: AnalyticsSettings = { ga4Id: '' };

export const GA4_ID_PATTERN = /^G-[A-Z0-9]{6,12}$/;

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
  'orderSteps',
  // 편집숍 소개 (/about) — 3-I 에서 항목으로 쪼갰습니다
  'aboutHero',
  'aboutChoose',
  'about',
  'aboutBrands',
  'aboutContact',
  // 주문·배송 안내
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
export const COPY_META: Record<
  CopyKey,
  { title: string; hint: string; path: string; blockLabel: string; group: CopyGroupKey }
> = {
  homeHero: {
    group: 'home',
    title: '메인 히어로 문구',
    hint: '첫 화면 큰 이미지 아래에 나오는 문구입니다. 소제목이 명조 한 줄, 본문이 그 아래 설명입니다.',
    path: '/',
    blockLabel: '문단',
  },
  homeStory: {
    group: 'home',
    title: '메인 · 브랜드 스토리 섹션',
    hint: '첫 화면 가운데 OUR STORY 섹션입니다. 첫 소제목이 섹션 제목으로 쓰입니다.',
    path: '/',
    blockLabel: '문단',
  },
  /*
   * ★ 제목에 'HOW TO ORDER' 를 넣어 둡니다.
   *   화면에는 영문 라벨로 나오는데 관리자 항목 이름은 '주문 방법 3스텝 안내' 뿐이라,
   *   운영자가 그 문구를 고치려고 관리자에서 한참 찾지 못한 일이 있었습니다.
   *   화면에 보이는 말과 관리자 항목 이름이 같아야 찾습니다.
   */
  orderSteps: {
    group: 'home',
    title: 'HOW TO ORDER — 주문 방법 3단계',
    hint: '메인 화면 아래쪽과 /order 페이지에 함께 나옵니다. 블록 하나가 한 단계이며 01·02·03 번호는 자동으로 붙습니다. 소제목이 단계 제목, 본문이 그 아래 설명입니다.',
    path: '/',
    blockLabel: '단계',
  },
  aboutHero: {
    group: 'about',
    title: '편집숍 소개 · 제목과 부제',
    hint: '/about 맨 위 제목입니다. 소제목이 큰 제목, 본문이 그 아래 부제 한 줄입니다. 블록 하나만 씁니다.',
    path: '/about',
    blockLabel: '제목',
  },
  aboutChoose: {
    group: 'about',
    title: '편집숍 소개 · 고르는 기준 (섹션 제목)',
    hint: '/about 의 고르는 기준 섹션 머리말입니다. 소제목이 섹션 제목, 본문이 그 아래 안내 한 줄(비우면 안 나옵니다)입니다. 항목 자체는 아래 “고르는 기준 항목” 에서 고칩니다.',
    path: '/about',
    blockLabel: '머리말',
  },
  aboutBrands: {
    group: 'about',
    title: '편집숍 소개 · 취급 브랜드 (섹션 제목)',
    hint: '/about 의 취급 브랜드 섹션 머리말입니다. 브랜드 목록 자체는 브랜드 관리에서 노출을 켠 브랜드가 자동으로 나옵니다. 본문(안내문)은 비우면 나오지 않습니다.',
    path: '/about',
    blockLabel: '머리말',
  },
  aboutContact: {
    group: 'about',
    title: '편집숍 소개 · 문의 안내',
    hint: '/about 맨 아래 문의 섹션입니다. 소제목이 섹션 제목, 본문이 안내 문단입니다. 카카오톡 문의 버튼과 고객센터 번호는 설정 > 스토어 정보의 값을 그대로 씁니다.',
    path: '/about',
    blockLabel: '문단',
  },
  guide: {
    group: 'order',
    title: '배송·교환·반품 안내',
    hint: '/guide 페이지 본문입니다. 소제목이 h2 로 나갑니다.',
    path: '/guide',
    blockLabel: '항목',
  },
  terms: {
    group: 'legal',
    title: '이용약관',
    hint: '/terms 페이지 본문입니다. 소제목에 조문 제목(제1조 …)을 적으세요.',
    path: '/terms',
    blockLabel: '조문',
  },
  privacy: {
    group: 'legal',
    title: '개인정보처리방침',
    hint: '/privacy 페이지 본문입니다.',
    path: '/privacy',
    blockLabel: '항목',
  },
  about: {
    group: 'about',
    title: '편집숍 소개 · 고르는 기준 항목',
    hint: '/about 의 고르는 기준에 번호가 붙어 나열되는 항목들입니다. 번호는 자동으로 붙습니다. 섹션 제목은 위 “고르는 기준 (섹션 제목)” 에서 고칩니다. 소개 본문(브랜드 스토리 3문장)은 설정 > 스토어 정보에서 고칩니다.',
    path: '/about',
    blockLabel: '항목',
  },
  order: {
    group: 'order',
    title: '장바구니·주문 안내 문구',
    hint: '/order 페이지 아래쪽 결제 안내입니다.',
    path: '/order',
    blockLabel: '항목',
  },
  notFound: {
    group: 'legal',
    title: '404 페이지 문구',
    hint: '없는 주소로 들어왔을 때 보이는 문구입니다.',
    path: '/',
    blockLabel: '문단',
  },
};
