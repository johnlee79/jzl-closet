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
 *                    ★ 이 중 우리가 실제로 받는 것은 신용카드뿐입니다. (2026-08-25)
 *                      카카오페이·네이버페이는 KSNET 에는 열려 있지만
 *                      lib/site-config.ts 의 PAYMENT_METHODS 에서 닫았습니다.
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
 * 실제로 결제창에 실려 나가는 상점아이디.
 *
 * ★★★ 실제 돈이 오가는지를 정하는 것은 이 값 하나뿐입니다. (2026-08-25)
 *   결제창 주소는 테스트와 운영이 같습니다. 우리가 보내는 sndStoreid 가
 *   운영 아이디면 그 순간부터 손님 카드에서 진짜 돈이 빠져나갑니다.
 *
 * ★★ 그래서 KSNET_MODE 가 live 가 아니면 무조건 테스트 아이디를 씁니다.
 *   예전에는 MID 만 보고 모드를 보지 않았습니다. 그러면 이런 일이 났습니다.
 *
 *     KSNET_MODE=test  +  KSNET_MID=운영아이디
 *       → 실제 결제가 그대로 나가는데
 *         관리자 화면은 "테스트 — 실제 결제가 아닙니다" 라고 말합니다.
 *
 *   운영에서 테스트로 되돌릴 때 MODE 만 바꾸고 MID 를 안 지우면
 *   정확히 이 상태가 됩니다. 되돌렸다고 믿는 동안 진짜 결제가 나갑니다.
 *   가장 위험한 종류의 거짓말이라 모드를 진짜 스위치로 만들었습니다.
 *
 * ★ 이제 되돌리는 방법은 하나입니다 — KSNET_MODE 를 live 가 아닌 값으로.
 *   MID 는 남겨 두어도 쓰이지 않습니다.
 *
 * ★ 반대 방향(MID 만 넣고 MODE 를 안 바꿈)은 테스트로 남습니다.
 *   틀렸을 때 손해가 없는 쪽으로 넘어지게 두는 것이 맞습니다.
 *   그 상태는 관리자 설정 화면이 눈에 띄게 알려 줍니다.
 */
export function ksnetMid(): string {
  if (ksnetMode() !== 'live') return KSNET_TEST_MID;
  return process.env.KSNET_MID?.trim() || KSNET_TEST_MID;
}

/**
 * 운영 모드인데 상점아이디를 안 넣었으면 결제를 열면 안 됩니다.
 *
 * ★ 이 값이 있으면 호출부(buildKsnetForm)가 결제창을 아예 열지 않습니다.
 *   그래서 "테스트로 동작 중" 같은 안내는 여기 넣지 않습니다.
 *   그건 문제가 아니라 상태이고, 여기 넣으면 결제가 통째로 막힙니다.
 */
export function ksnetConfigProblem(): string | null {
  if (ksnetMode() === 'live' && !process.env.KSNET_MID?.trim()) {
    return 'KSNET_MODE 가 live 인데 KSNET_MID 가 비어 있습니다. 운영 상점아이디를 넣어 주세요.';
  }
  return null;
}

/**
 * 운영 상점아이디를 넣어 두었는데 모드가 test 라 안 쓰이고 있는 상태인지.
 *
 * ★ 문제가 아니라 알림입니다. 결제를 막지 않습니다.
 *   "운영 아이디를 넣었는데 왜 테스트로 나가지" 를 헤매지 않도록
 *   관리자 설정 화면에서 이 사실을 그대로 보여 줍니다.
 */
export function ksnetLiveMidIgnored(): boolean {
  return ksnetMode() !== 'live' && Boolean(process.env.KSNET_MID?.trim());
}

/* ------------------------------------------------------------------
 * 결제창 주소
 * ------------------------------------------------------------------
 *
 * ★★ 전부 https 입니다. http 를 쓰지 마세요.
 *   우리 사이트는 https 입니다. https 페이지에서 http 로 폼을 보내면
 *   브라우저가 Mixed Content 로 막습니다. 결제창이 아예 열리지 않습니다.
 *   통합모듈 문서에는 모바일 주소가 http 로 적혀 있지만,
 *   실제로 확인해 보니 세 주소 모두 https 로 정상 응답합니다. (인증서도 정상)
 * ------------------------------------------------------------------ */

/**
 * PC 결제창.
 *
 * ★ 이 주소는 KSNET 의 kspay_web_ssl.js 안에 있는 _KSPAY_URL 과 같은 값입니다.
 *   (그 파일 첫 줄: var _KSPAY_URL = "https://kspay.ksnet.to/store/KSPayWebV1.4/KSPayPWeb.jsp")
 * ★ 모바일 주소(KSPayMobileV1.4)와 경로가 다릅니다. 헷갈리지 마세요.
 *   PC 는 KSPayWebV1.4, 모바일은 KSPayMobileV1.4 입니다.
 */
export const KSPAY_PC_ACTION =
  'https://kspay.ksnet.to/store/KSPayWebV1.4/KSPayPWeb.jsp';

/** 모바일 — 폼 action 으로 두고 target=_self 로 페이지째 이동합니다. */
export const KSPAY_MOBILE_ACTION =
  'https://kspay.ksnet.to/store/KSPayMobileV1.4/KSPayPWeb.jsp';

/** 서버가 최종 승인을 확인하는 곳 */
export const KSPAY_APPROVE_URL =
  'https://kspay.ksnet.to/store/KSPayWebV1.4/web_host/recv_post.jsp';

/**
 * ============================================================
 * ★★ KSNET 의 kspay_web_ssl.js 를 왜 쓰지 않는가
 * ============================================================
 *
 * 통합모듈 안내는 그 스크립트를 불러 _pay(form) 을 부르라고 되어 있습니다.
 * 실제로 붙여 보니 PC 결제창이 열리지 않았고, 원인은 세 가지였습니다.
 *
 *   1) 그 스크립트는 document.writeln 으로 자기 jQuery 를 불러옵니다.
 *      요즘 브라우저는 "비동기로 불러온 스크립트의 document.write" 를 무시합니다.
 *      (Failed to execute 'write' on 'Document')
 *      그래서 jQuery 가 끝내 로드되지 않고, 스크립트 안에서 $ 를 쓰는 순간
 *      ReferenceError: $ is not defined 로 멈춥니다.
 *   2) _pay() 는 문제가 생기면 alert() 을 띄웁니다.
 *      결제 흐름 중에 모달이 뜨면 그 뒤 아무것도 진행되지 않습니다.
 *   3) 창 크기를 822x630 으로 고정합니다. 화면이 작은 노트북에서 잘립니다.
 *
 * 그 스크립트가 실제로 하는 일은 submitI() 하나뿐이고, 내용은 이렇습니다.
 *      오버레이 div + iframe(name=payment-frame) 을 만들고
 *      form.method=post / form.target=payment-frame / form.action=_KSPAY_URL
 *      form.submit()
 * 이게 전부입니다. 그래서 jQuery 108KB 와 document.write 를 끌어들이는 대신
 * components/KsnetPayLauncher.tsx 에서 같은 일을 직접 합니다.
 *
 * ★ 이렇게 해도 되는 근거 (실제로 파일을 열어 확인했습니다)
 *   · 결제창(iframe)은 자기 jQuery 를 따로 불러옵니다. 부모의 jQuery 를 쓰지 않습니다.
 *   · main.js 안의 parent.closeEvent / parent.closeFormEvent 호출은 전부 주석 처리되어
 *     있습니다. 즉 결제창이 부모의 함수를 부르지 않습니다.
 *   · 결제창의 [닫기] 버튼은 payClose() → payForm 을 sndReply(우리 주소)로 POST 합니다.
 *     이때 reCommConId 는 비우고 reCnclType 에 1 을 넣습니다.
 *     그래서 취소도 우리 서버가 받아서 처리합니다.
 *
 * ★ 나중에 KSNET 이 규격을 바꾸면 이 파일의 주소 상수와
 *   KsnetPayLauncher.tsx 두 곳만 보면 됩니다.
 */

/** 결제창(iframe) 이름 — KSNET 문서·스크립트가 쓰는 이름 그대로입니다. */
export const KSPAY_FRAME_NAME = 'payment-frame';

/**
 * 결제창 크기. KSNET 스크립트가 쓰는 값과 같습니다.
 * ★ 결제창은 우리와 다른 도메인이라 스스로 높이를 바꾸지 못합니다.
 *   (main.js 의 update_iframe_height 가 window.parent.document 를 만지는데,
 *    교차 출처라 막힙니다) 그래서 우리가 크기를 정해 줘야 합니다.
 */
export const KSPAY_FRAME_WIDTH = 822;
export const KSPAY_FRAME_HEIGHT = 630;

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
