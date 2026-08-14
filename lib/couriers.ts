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
