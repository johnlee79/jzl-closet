/**
 * 택배사 목록과 배송 조회 주소.
 *
 * 관리자가 송장을 입력하면 주문 조회 화면에 아래 주소로 가는 링크를 만듭니다.
 * 택배사를 추가하려면 이 배열에 한 줄만 넣으면 됩니다.
 *
 * ★ 조회 주소 형식은 택배사가 바꾸는 일이 있습니다.
 *   링크가 열리지 않으면 여기 trackingUrl 만 고치면 됩니다.
 */

export type Courier = {
  code: string;
  name: string;
  /** 고객센터 번호 (조회가 막혔을 때 안내용) */
  tel: string;
  /** 송장번호를 넣어 조회 주소를 만듭니다. */
  trackingUrl: (trackingNo: string) => string;
};

export const COURIERS: Courier[] = [
  {
    code: 'cj',
    name: 'CJ대한통운',
    tel: '1588-1255',
    trackingUrl: (no) =>
      `https://trace.cjlogistics.com/next/tracking.html?wblNo=${encodeURIComponent(no)}`,
  },
  {
    code: 'hanjin',
    name: '한진택배',
    tel: '1588-0011',
    trackingUrl: (no) =>
      `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${encodeURIComponent(no)}`,
  },
  {
    code: 'lotte',
    name: '롯데택배',
    tel: '1588-2121',
    trackingUrl: (no) =>
      `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${encodeURIComponent(no)}`,
  },
  {
    code: 'epost',
    name: '우체국택배',
    tel: '1588-1300',
    trackingUrl: (no) =>
      `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${encodeURIComponent(no)}`,
  },
  {
    code: 'logen',
    name: '로젠택배',
    tel: '1588-9988',
    trackingUrl: (no) =>
      `https://www.ilogen.com/web/personal/trace/${encodeURIComponent(no)}`,
  },
  {
    code: 'kdexp',
    name: '경동택배',
    tel: '1899-5368',
    trackingUrl: (no) =>
      `https://kdexp.com/basicNewDelivery.kd?barcode=${encodeURIComponent(no)}`,
  },
  {
    code: 'daesin',
    name: '대신택배',
    tel: '043-222-4582',
    trackingUrl: () => 'https://www.ds3211.co.kr/freight/internalFreightSearch.ds',
  },
  {
    code: 'cvsnet',
    name: 'GS Postbox 택배',
    tel: '1577-1287',
    trackingUrl: (no) =>
      `https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no=${encodeURIComponent(no)}`,
  },
  {
    code: 'direct',
    name: '직접 전달 · 방문 수령',
    tel: '',
    trackingUrl: () => '',
  },
];

export function findCourier(code: string | null | undefined): Courier | undefined {
  if (!code) return undefined;
  return COURIERS.find((courier) => courier.code === code);
}

/* ------------------------------------------------------------------
 * 택배사 별칭
 *
 * 공급처가 회신하는 송장 목록에는 택배사가 제각각으로 적혀 옵니다.
 * ("CJ", "CJ대한통운", "대한통운", "cj" …)
 * 송장 일괄등록에서 이 표를 거쳐 내부 코드로 바꿉니다.
 * ------------------------------------------------------------------ */

const COURIER_ALIASES: Record<string, string> = {
  // CJ대한통운
  cj: 'cj',
  cj대한통운: 'cj',
  대한통운: 'cj',
  cjlogistics: 'cj',
  cj택배: 'cj',
  // 한진
  한진: 'hanjin',
  hanjin: 'hanjin',
  // 롯데
  롯데: 'lotte',
  lotte: 'lotte',
  현대: 'lotte', // 롯데택배의 옛 이름(현대택배)으로 적어 오는 곳이 있습니다
  // 우체국
  우체국: 'epost',
  epost: 'epost',
  우편: 'epost',
  // 로젠
  로젠: 'logen',
  logen: 'logen',
  // 그 밖
  경동: 'kdexp',
  kdexp: 'kdexp',
  대신: 'daesin',
  daesin: 'daesin',
  gs: 'cvsnet',
  gs편의점: 'cvsnet',
  gspostbox: 'cvsnet',
  cvsnet: 'cvsnet',
  편의점: 'cvsnet',
  직접전달: 'direct',
  방문수령: 'direct',
  direct: 'direct',
};

/**
 * 사람이 적어 넣은 택배사 이름을 내부 코드로 바꿉니다.
 * 공백·괄호를 지우고 뒤에 붙은 "택배" 를 떼어 낸 뒤 표에서 찾습니다.
 * 알아볼 수 없으면 null 입니다.
 */
export function resolveCourier(input: string): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[\s()（）·・.-]/g, '');
  if (!cleaned) return null;

  // "한진택배" → "한진" 처럼 꼬리말을 떼어 봅니다.
  const candidates = [cleaned, cleaned.replace(/(택배|로지스|logistics|express)$/, '')];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const code = COURIER_ALIASES[candidate];
    if (code) return code;
    // 코드 자체를 그대로 적어 온 경우
    if (COURIERS.some((courier) => courier.code === candidate)) return candidate;
  }
  return null;
}

/** 관리자 화면에 보여 줄 별칭 안내 — "이렇게 적어도 인식합니다" */
export const COURIER_ALIAS_HINTS: { code: string; name: string; aliases: string[] }[] = [
  { code: 'cj', name: 'CJ대한통운', aliases: ['CJ', 'CJ대한통운', '대한통운'] },
  { code: 'hanjin', name: '한진택배', aliases: ['한진', '한진택배'] },
  { code: 'lotte', name: '롯데택배', aliases: ['롯데', '롯데택배'] },
  { code: 'epost', name: '우체국택배', aliases: ['우체국', '우체국택배'] },
  { code: 'logen', name: '로젠택배', aliases: ['로젠', '로젠택배'] },
  { code: 'kdexp', name: '경동택배', aliases: ['경동', '경동택배'] },
  { code: 'daesin', name: '대신택배', aliases: ['대신', '대신택배'] },
  { code: 'cvsnet', name: 'GS Postbox 택배', aliases: ['GS', 'GS편의점', '편의점'] },
];

export function courierName(code: string | null | undefined): string {
  if (!code) return '';
  return findCourier(code)?.name ?? code;
}

/** 조회 링크. 택배사나 송장번호가 없으면 빈 문자열입니다. */
export function trackingUrl(
  code: string | null | undefined,
  trackingNo: string | null | undefined
): string {
  const courier = findCourier(code);
  if (!courier || !trackingNo) return '';
  return courier.trackingUrl(trackingNo.replace(/[^0-9A-Za-z]/g, ''));
}
