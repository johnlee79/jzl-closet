/**
 * ============================================================
 * KSNET (KSPay 통합모듈 V1.4) 연동 설정
 * ============================================================
 *
 * ★ 운영 상점아이디를 코드에 박지 마세요.
 *   환경변수로 두고 Vercel 에서 바꿉니다. 기본값은 테스트 아이디입니다.
 *   운영자가 직접 확인한 뒤에만 운영 아이디로 바뀌어야 합니다.
 *
 * 계약 현황 (2026-08 기준)
 *   운영 상점아이디  2074300026
 *   테스트 상점아이디 2999199999
 *   열린 결제수단    국내 신용카드 · 카카오페이 · 네이버페이
 *   계좌이체        오픈 미확인 — 구조만 준비하고 관리자에서 기본 끔
 *   가상계좌·에스크로  사용 안 함
 *   현금영수증(PG)   미지원 — 운영자가 홈택스에서 직접 발급
 *   결제 취소 API    사용 불가 — KSNET 에만 권한이 있습니다
 *
 * 이 파일은 순수 상수·문자열 조립만 합니다. 서버 전용 코드를 넣지 마세요.
 * (승인 확인은 lib/payments/ksnet/approve.ts 가 합니다)
 */

/** 문서에 적힌 테스트 상점아이디. 환경변수가 없으면 이 값을 씁니다. */
export const KSNET_TEST_MID = '2999199999';

export type KsnetMode = 'test' | 'live';

/**
 * 지금 어떤 모드인지.
 * ★ 명시적으로 'live' 라고 적었을 때만 운영입니다.
 *   오타나 빈 값은 전부 테스트로 떨어집니다. 반대로 두면
 *   설정 실수 하나로 손님 카드에서 진짜 돈이 빠져나갑니다.
 */
export function ksnetMode(): KsnetMode {
  return process.env.KSNET_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'test';
}

/**
 * 상점아이디.
 * ★ KSNET_MID 를 넣지 않으면 테스트 아이디로 동작합니다.
 *   운영 모드인데 MID 가 비어 있으면 테스트 아이디로 결제가 되어 버리므로,
 *   호출부(ksnetPaymentFields)가 그 조합을 막습니다.
 */
export function ksnetMid(): string {
  return process.env.KSNET_MID?.trim() || KSNET_TEST_MID;
}

/** 운영 모드인데 상점아이디를 안 넣었으면 결제를 열면 안 됩니다. */
export function ksnetConfigProblem(): string | null {
  if (ksnetMode() === 'live' && !process.env.KSNET_MID?.trim()) {
    return 'KSNET_MODE 가 live 인데 KSNET_MID 가 비어 있습니다. 운영 상점아이디를 넣어 주세요.';
  }
  return null;
}

/* ------------------------------------------------------------------
 * 결제창 주소
 * ------------------------------------------------------------------ */

/** PC — 폼을 만들고 이 스크립트의 _pay(form) 을 부릅니다. (레이어/팝업) */
export const KSPAY_PC_SCRIPT =
  'https://kspay.ksnet.to/store/KSPayWebV1.4/js/kspay_web_ssl.js';

/** 모바일 — 폼 action 으로 두고 target=_self 로 페이지째 이동합니다. */
export const KSPAY_MOBILE_ACTION =
  'http://kspay.ksnet.to/store/KSPayMobileV1.4/KSPayPWeb.jsp';

/** 서버가 최종 승인을 확인하는 곳 */
export const KSPAY_APPROVE_URL =
  'http://kspay.ksnet.to/store/KSPayWebV1.4/web_host/recv_post.jsp';

/** 거래 확인 사이트 — 관리자 화면 안내에 씁니다. */
export const KSNET_ADMIN_URL = 'https://ksta.ksnet.co.kr';

/* ------------------------------------------------------------------
 * 결제수단 코드 (sndPaymethod · 13자리)
 * ------------------------------------------------------------------ */

/**
 * 13자리 중 해당 자리를 1 로 둡니다.
 *   신용카드   1000000000000
 *   계좌이체   0010000000000
 *   카카오페이  0000000010000
 *   네이버페이  0000000000001
 *
 * ★ 우리는 한 주문에 한 수단만 엽니다. (lib/site-config.ts PAYMENT_METHODS 주석)
 *   여러 개를 동시에 열면 손님이 창 안에서 무엇을 골랐는지 알 수 없습니다.
 */
export const KSNET_PAYMETHOD: Record<string, string> = {
  card: '1000000000000',
  pg_banktransfer: '0010000000000',
  kakaopay: '0000000010000',
  naverpay: '0000000000001',
};

export function ksnetPaymethodCode(method: string): string | null {
  return KSNET_PAYMETHOD[method] ?? null;
}

/* ------------------------------------------------------------------
 * 승인 확인 응답 항목
 * ------------------------------------------------------------------ */

/**
 * sndRpyParams 로 요청할 항목 순서.
 *
 * ★ 응답은 백틱(`)으로 이어진 문자열이고, 첫 조각은 버립니다.
 *   두 번째 조각부터 이 순서대로 대응됩니다. (PHP 샘플의 $tmpvals[$i+1])
 * ★ 이 배열의 순서를 바꾸면 값이 통째로 어긋납니다. 손대지 마세요.
 */
export const KSNET_REPLY_PARAMS = [
  'authyn',
  'trno',
  'trddt',
  'trdtm',
  'amt',
  'authno',
  'msg1',
  'msg2',
  'ordno',
  'isscd',
  'aqucd',
  'result',
  'halbu',
  'cbtrno',
  'cbauthno',
] as const;

export type KsnetReplyKey = (typeof KSNET_REPLY_PARAMS)[number];

/** sndRpyParams 에 넣는 문자열 — 백틱으로 이어 붙입니다. */
export const KSNET_REPLY_PARAM_STRING = KSNET_REPLY_PARAMS.join('`');

/* ------------------------------------------------------------------
 * 고정 파라미터
 * ------------------------------------------------------------------ */

/** 전체 카드사 */
export const KSNET_SHOWCARD = 'C';
export const KSNET_CURRENCY = 'WON';
/** 일시불 + 2~12개월 */
export const KSNET_INSTALLMENT = 'ALL(0:2:3:4:5:6:7:8:9:10:11:12)';
/** 가맹점 부담 무이자 없음 */
export const KSNET_INTEREST = 'NONE';

/** 카카오페이가 요구하는 대표자명 — 사업자 정보와 같은 값입니다. */
export const KSNET_STORE_CEO_FALLBACK = '김연';

/** 신용카드 최소 결제금액. 이보다 적으면 카드사가 거절합니다. */
export const CARD_MIN_AMOUNT = 1000;
