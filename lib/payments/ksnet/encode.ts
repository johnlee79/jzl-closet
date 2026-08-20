import iconv from 'iconv-lite';

/**
 * ============================================================
 * KSNET 에 넘길 값 다듬기 — EUC-KR 바이트 · 금지 문자
 * ============================================================
 *
 * ★ KSNET 이 정한 제약 (지키지 않으면 오류가 나거나 값이 잘립니다)
 *   · 주문번호·상품명은 EUC-KR 기준 50바이트 (한글 25자)
 *   · 특수문자 금지:  `  ~  '  "
 *   · 금액에 쉼표·단위 금지 (1,004 · 1004원 모두 오류)
 *
 * ★ 왜 EUC-KR 바이트로 세는가
 *   한글 한 글자가 UTF-8 에서는 3바이트, EUC-KR 에서는 2바이트입니다.
 *   JavaScript 의 length 는 글자 수라 셋 다 다릅니다.
 *   "글자 수로 대충 맞췄다" 로 넘기면 어떤 상품명에서는 통과하고
 *   어떤 상품명에서는 결제창이 열리지 않습니다. 그래서 실제로 인코딩해 셉니다.
 *
 * ★ 백틱(`)이 특히 위험합니다.
 *   KSNET 응답이 백틱으로 항목을 나눕니다. 우리가 보낸 값에 백틱이 섞이면
 *   돌아온 응답의 항목 순서가 밀려 금액과 주문번호가 어긋납니다.
 *   그래서 금지 문자는 "잘라 내는" 것이 아니라 "지웁니다".
 */

/** KSNET 이 쓰지 못하게 한 문자 */
const FORBIDDEN = /[`~'"]/g;

/**
 * 제어문자·줄바꿈도 함께 지웁니다.
 * 폼 필드에 줄바꿈이 들어가면 전송 자체가 깨집니다.
 */
const CONTROL = /[\u0000-\u001F\u007F]/g;

/** EUC-KR 로 표현할 수 없는 글자 — 이모지, 일부 기호 등 */
const REPLACEMENT_BYTE = 0x3f; // '?'

/** EUC-KR 기준 바이트 수 */
export function euckrByteLength(value: string): number {
  return iconv.encode(value, 'euc-kr').length;
}

/**
 * EUC-KR 로 옮겼을 때 깨지는 글자가 있는지.
 * ★ 이모지가 들어간 상품명이 실제로 있습니다. 그대로 보내면 '?' 로 바뀌어
 *   손님 카드 명세서에 이상한 이름이 찍힙니다. 미리 지워 두는 편이 낫습니다.
 */
function stripUnencodable(value: string): string {
  let out = '';
  for (const char of value) {
    const bytes = iconv.encode(char, 'euc-kr');
    // '?' 한 글자로 바뀌었는데 원래 '?' 가 아니었다면 표현할 수 없는 글자입니다.
    if (bytes.length === 1 && bytes[0] === REPLACEMENT_BYTE && char !== '?') continue;
    out += char;
  }
  return out;
}

/**
 * KSNET 에 보낼 수 있는 형태로 다듬습니다.
 * 금지 문자·제어문자·표현 불가 문자를 지우고 공백을 정리합니다.
 * ★ 길이는 여기서 자르지 않습니다. 자르는 것은 clampEuckr 의 일입니다.
 */
export function sanitizeKsnetValue(value: string): string {
  return stripUnencodable(
    String(value ?? '')
      .replace(CONTROL, ' ')
      .replace(FORBIDDEN, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * EUC-KR 기준 maxBytes 를 넘지 않게 자릅니다.
 *
 * ★ 바이트로 자르면 한글이 반 토막 납니다. (2바이트 중 1바이트만 남음)
 *   그래서 글자 단위로 하나씩 더해 가며 넘기 직전에서 멈춥니다.
 */
export function clampEuckr(value: string, maxBytes: number): string {
  if (euckrByteLength(value) <= maxBytes) return value;

  let out = '';
  let used = 0;
  for (const char of value) {
    const size = euckrByteLength(char);
    if (used + size > maxBytes) break;
    out += char;
    used += size;
  }
  return out.trim();
}

/** 주문번호·상품명의 상한 (KSNET 규격) */
export const KSNET_MAX_BYTES = 50;

/**
 * 상품명 만들기.
 *
 *   상품 1개      "린넨 셔츠"
 *   상품 여러 개   "린넨 셔츠 외 2건"
 *
 * ★ "외 N건" 은 반드시 남겨야 합니다.
 *   앞 상품명이 길어 통째로 자르면 "린넨 셔츠 블라우스 화이" 처럼 되어
 *   손님이 카드 명세서를 보고 무슨 주문인지 알 수 없게 됩니다.
 *   그래서 꼬리를 먼저 확보하고 남는 만큼만 앞 이름에 씁니다.
 * ★ 이름이 통째로 비면 결제창이 열리지 않으므로 마지막 기본값을 둡니다.
 */
export function buildGoodName(
  firstName: string,
  itemCount: number,
  fallback = '주문상품'
): string {
  const clean = sanitizeKsnetValue(firstName) || fallback;
  const rest = Math.max(0, itemCount - 1);

  if (rest === 0) return clampEuckr(clean, KSNET_MAX_BYTES) || fallback;

  const tail = ` 외 ${rest}건`;
  const room = KSNET_MAX_BYTES - euckrByteLength(tail);
  const head = clampEuckr(clean, Math.max(1, room)) || fallback;
  return `${head}${tail}`;
}

/**
 * 금액 — 숫자만. 쉼표·단위가 섞이면 KSNET 이 거절합니다.
 * ★ 음수·소수는 애초에 있을 수 없지만, 있으면 0 으로 두지 말고 그대로 막습니다.
 *   조용히 0 원 결제가 열리는 것이 훨씬 위험합니다.
 */
export function ksnetAmount(value: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`결제 금액이 올바르지 않습니다: ${value}`);
  }
  return String(value);
}

/** 휴대폰 번호 — '-' 없이 숫자만 */
export function ksnetPhone(value: string): string {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

/**
 * 폼에 넣기 전 마지막 점검.
 * ★ 여기서 걸리면 결제창을 열지 않습니다. 열어 봐야 KSNET 이 거절합니다.
 *   "열렸는데 안 되는" 것보다 "안 열리고 이유가 찍히는" 편이 낫습니다.
 */
export function assertKsnetLimits(fields: Record<string, string>): string[] {
  const problems: string[] = [];

  const limited: [string, number][] = [
    ['sndOrdernumber', KSNET_MAX_BYTES],
    ['sndGoodname', KSNET_MAX_BYTES],
  ];

  for (const [key, max] of limited) {
    const value = fields[key] ?? '';
    const bytes = euckrByteLength(value);
    if (!value) problems.push(`${key} 가 비어 있습니다.`);
    else if (bytes > max) problems.push(`${key} 가 EUC-KR ${bytes}바이트로 ${max}바이트를 넘습니다.`);
  }

  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN.test(value)) {
      problems.push(`${key} 에 쓸 수 없는 특수문자가 남아 있습니다.`);
    }
    // 정규식에 g 플래그가 있어 lastIndex 가 남습니다. 다음 검사를 위해 되돌립니다.
    FORBIDDEN.lastIndex = 0;
  }

  if (!/^[0-9]+$/.test(fields.sndAmount ?? '')) {
    problems.push('sndAmount 에 숫자가 아닌 값이 들어 있습니다.');
  }

  return problems;
}

/**
 * EUC-KR 로 온 응답을 UTF-8 문자열로 바꿉니다.
 * ★ Node 기본 Buffer 는 EUC-KR 을 모릅니다. 그냥 toString('utf8') 하면
 *   msg1·msg2 의 한글이 전부 깨집니다. (실패 사유를 못 읽게 됩니다)
 */
export function decodeEuckr(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return iconv.decode(Buffer.from(bytes), 'euc-kr');
}

/**
 * 폼 값을 EUC-KR 로 인코딩한 application/x-www-form-urlencoded 본문 문자열로 만듭니다.
 *
 * ★ URLSearchParams 를 쓰면 안 됩니다. UTF-8 로 퍼센트 인코딩합니다.
 *   KSNET 은 EUC-KR 을 기대하므로 한글이 들어간 값이 깨집니다.
 *   승인 확인에 보내는 값에는 한글이 없지만, 규격을 맞춰 두는 편이 안전합니다.
 */
export function euckrFormBody(fields: Record<string, string>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(`${percentEuckr(key)}=${percentEuckr(value)}`);
  }
  /*
   * ★ 돌려주는 값은 ASCII 문자열입니다.
   *   한글은 이미 EUC-KR 바이트로 바뀐 뒤 %B1%DB 같은 형태로 인코딩되어 있습니다.
   *   그래서 fetch 가 이 문자열을 UTF-8 로 보내도 바이트가 달라지지 않습니다.
   *   (퍼센트 인코딩을 거치지 않은 한글을 그대로 넘기면 여기서 깨집니다)
   */
  return parts.join('&');
}

/** 한 값을 EUC-KR 바이트로 바꾼 뒤 퍼센트 인코딩합니다. */
function percentEuckr(value: string): string {
  const bytes = iconv.encode(String(value ?? ''), 'euc-kr');
  let out = '';
  // ★ for…of 로 Buffer 를 돌면 tsconfig 의 target 이 낮아 빌드가 막힙니다.
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    // A-Z a-z 0-9 - _ . ~ 는 그대로 둡니다.
    if (
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) ||
      byte === 0x2d ||
      byte === 0x5f ||
      byte === 0x2e
    ) {
      out += String.fromCharCode(byte);
    } else if (byte === 0x20) {
      out += '+';
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}
