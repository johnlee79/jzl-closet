/**
 * 추천 코드 — 서버·클라이언트 공용(순수 함수)입니다.
 *
 * ★ 여기에는 DB 를 건드리는 코드가 하나도 없습니다.
 *   공유 버튼(브라우저)과 가입 처리(서버)가 같은 규칙을 써야 하므로
 *   규칙만 따로 떼어 두었습니다. 한쪽만 고쳐서 어긋나는 일을 막습니다.
 */

/**
 * 코드에 쓰는 글자 — 31개.
 * ★ `0` `O` `1` `I` `L` 을 뺐습니다.
 *   손으로 옮겨 적거나 전화로 불러 줄 때 가장 많이 틀리는 짝입니다.
 *   DB 의 gen_referral_code() 와 같은 글자 목록이어야 합니다.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CODE_LENGTH = 6;

/** 주소에 붙는 이름 — `?ref=A3F9K2` */
export const REF_PARAM = 'ref';

/** 추천 코드를 담아 두는 쿠키. 30일 뒤에 사라집니다. */
export const REF_COOKIE = 'jzl_ref';

/** 같은 사람의 반복 방문을 1회로 세기 위한 방문자 식별 쿠키 */
export const VISITOR_COOKIE = 'jzl_visitor';

/** 추천 코드 유효기간 (일) */
export const REF_COOKIE_DAYS = 30;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * 손님이 적어 넣은 코드를 다듬습니다.
 * 소문자로 적어도, 앞뒤에 공백이나 하이픈이 있어도 받아 줍니다.
 *
 * ★ 글자를 바꿔치기하지는 않습니다.
 *   `0` 을 `O` 로 고쳐 주고 싶어지지만, 코드에는 둘 다 없습니다.
 *   그런 글자가 들어왔다는 것은 다른 글자를 잘못 본 것이고,
 *   무엇을 잘못 봤는지는 알 수 없습니다. 임의로 고치면 남의 코드가 됩니다.
 *   그래서 그대로 두고 "없는 코드"라고 알려 주는 편이 안전합니다.
 */
export function normalizeReferralCode(value: string): string {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

/** 코드 모양이 맞는지 (실제로 있는 코드인지는 서버가 확인합니다) */
export function isReferralCode(value: string): boolean {
  return CODE_PATTERN.test(value ?? '');
}

/**
 * 공유할 주소를 만듭니다.
 * @param path  `/products/item-abc` 처럼 앞에 / 가 붙은 경로
 * @param code  로그인한 회원의 코드. 비어 있으면 코드 없이 만듭니다.
 */
export function buildShareUrl(origin: string, path: string, code?: string): string {
  const base = origin.replace(/\/+$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  // ★ 이미 붙어 있는 다른 조건(?page=2 등)을 지우지 않습니다.
  const url = new URL(`${base}${clean}`);
  if (code && isReferralCode(code)) url.searchParams.set(REF_PARAM, code);
  return url.toString();
}

/**
 * 공유 문구. 카카오톡·문자에 그대로 붙습니다.
 *
 * ★ 주소를 마지막 줄에 두어야 미리보기가 제대로 뜹니다.
 * ★ 가운데 한 줄은 관리자가 설정에서 고칠 수 있습니다. ({store} 자리에 스토어 이름)
 *   못 받아 왔으면 기본 문구를 씁니다. 문구 때문에 공유가 막히면 안 됩니다.
 */
export function buildShareText(
  productName: string,
  url: string,
  storeName = 'JZL CLOSET',
  line = '{store}에서 확인해 보세요'
): string {
  const middle = (line || '{store}에서 확인해 보세요').replace(/\{store\}/g, storeName);
  return [productName, middle, url].filter(Boolean).join('\n');
}
