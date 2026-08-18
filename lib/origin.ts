import COUNTRIES from '@/lib/countries.json';

/**
 * ============================================================
 * 원산지 — 국가명 알아보기 · 한글로 맞추기
 * ============================================================
 *
 * ★ 왜 필요한가
 *   원산지와 제조사는 다른 항목입니다.
 *     원산지 — 어느 나라에서 만들었나 (중국, 베트남 …)
 *     제조사 — 어느 회사가 만들었나 (○○어패럴, ○○상사 …)
 *   가져오기에서 이 둘이 섞여, 국가명이 제조사 칸에 들어간 상품이 있었습니다.
 *   전자상거래 표시광고에서 두 항목은 따로 적게 되어 있어 섞이면 안 됩니다.
 *
 * ★ 나라 목록은 lib/countries.json 에 있습니다. 여기 로직과 떨어뜨려 둔 이유는
 *   scripts/check-origin.mjs (기존 상품 점검)도 같은 목록을 봐야 하기 때문입니다.
 *   나라를 하나 더 받아야 하면 JSON 에만 한 줄 넣으면 양쪽이 같이 압니다.
 *
 * ★ 판단은 일부러 보수적입니다. "국가명일 수도 있다" 정도로는 옮기지 않습니다.
 *   값 전체가 나라 이름과 정확히 맞아떨어질 때만 국가로 봅니다.
 *   "중국 ○○어패럴" 은 회사명이므로 제조사에 그대로 둡니다.
 *   회사명을 원산지 칸으로 옮겨 버리면 그것도 똑같이 틀린 표시가 됩니다.
 */

type CountryEntry = { ko: string; aliases: string[] };

/**
 * 견주기 좋게 다듬습니다.
 *
 * ★ 하는 일
 *     앞뒤 공백 제거 · 대문자로 · 점과 괄호 등 문장부호 제거 · 공백 하나로
 *     "MADE IN" 접두사 제거   (MADE IN CHINA → CHINA)
 *     한글 "산" 접미사 제거    (중국산 → 중국)
 * ★ scripts/check-origin.mjs 에도 같은 규칙이 있습니다. 고치면 그쪽도 같이 고쳐 주세요.
 *   (스크립트는 TS 를 못 읽어 이 함수를 가져다 쓸 수 없습니다. 나라 목록만 공유합니다)
 */
export function normalizeCountryText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^\s*MADE\s*IN\s*[:\-]?\s*/i, '')
    .replace(/[.,()[\]{}'"·/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/산$/, '');
}

/** 별칭 → 한글 국가명. 모듈이 처음 불릴 때 한 번만 만듭니다. */
const LOOKUP = new Map<string, string>();
for (const entry of COUNTRIES as CountryEntry[]) {
  for (const alias of entry.aliases) {
    LOOKUP.set(normalizeCountryText(alias), entry.ko);
  }
}

/**
 * 값이 나라 이름이면 한글 국가명을, 아니면 null 을 돌려줍니다.
 *
 *   toKoreanCountry('CHINA')      → '중국'
 *   toKoreanCountry('중국산')      → '중국'
 *   toKoreanCountry('Made in Vietnam') → '베트남'
 *   toKoreanCountry('○○어패럴')   → null
 *   toKoreanCountry('중국 ○○어패럴') → null   ← 회사명이라 옮기지 않습니다
 */
export function toKoreanCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normalizeCountryText(raw);
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

/** 값이 나라 이름으로만 되어 있는지. (제조사 칸에 잘못 들어갔는지 볼 때 씁니다) */
export function looksLikeCountry(raw: string | null | undefined): boolean {
  return toKoreanCountry(raw) !== null;
}

/**
 * 가져오기에서 받은 원산지·제조사 한 쌍을 제자리에 놓습니다.
 *
 * ★ 규칙
 *     1. 제조사 칸의 값이 나라 이름뿐이면 → 원산지로 옮기고 제조사는 비웁니다.
 *        (제조사는 회사명 칸입니다. 나라 이름만 남겨 두면 틀린 표시가 됩니다)
 *     2. 원산지 칸의 값이 영문 나라 이름이면 → 한글로 바꿉니다. (CHINA → 중국)
 *     3. 원산지가 이미 차 있는데 제조사에도 나라 이름이 있으면
 *        제조사만 비웁니다. 원산지를 덮어쓰지 않습니다.
 *        (먼저 들어온 값이 더 정확할 가능성이 큽니다)
 *     4. 나라 이름이 아닌 값은 건드리지 않습니다.
 */
export function splitOriginAndManufacturer(input: {
  origin?: string | null;
  manufacturer?: string | null;
}): { origin: string | null; manufacturer: string | null; moved: boolean } {
  const rawOrigin = input.origin?.trim() || null;
  const rawManufacturer = input.manufacturer?.trim() || null;

  // 원산지는 나라 이름이면 한글로, 아니면 적힌 그대로 둡니다.
  // ("이탈리아 밀라노" 처럼 나라보다 자세히 적어 둔 값을 뭉개지 않으려는 것입니다)
  let origin = rawOrigin ? toKoreanCountry(rawOrigin) ?? rawOrigin : null;
  let manufacturer = rawManufacturer;
  let moved = false;

  const fromManufacturer = toKoreanCountry(rawManufacturer);
  if (fromManufacturer) {
    if (!origin) origin = fromManufacturer;
    manufacturer = null;
    moved = true;
  }

  return { origin, manufacturer, moved };
}
