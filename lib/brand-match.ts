import type { Brand } from '@/lib/brands';

/**
 * 외부 쇼핑몰 브랜드명 → 우리 브랜드 slug 자동 매칭.
 *
 * 명세 4-3
 *   · 우리 브랜드의 한글 이름·영문 이름·별칭 중 맞는 게 있으면 자동으로 고르기
 *   · 없으면 비워두고 "브랜드를 골라 주세요"
 *   · 우리가 취급하지 않는 브랜드이면 (등록되어 있지 않으면) 알림만 띄우기
 *
 * 왜 fuzzy 가 아닌가
 *   철자 하나 틀린 브랜드로 매칭이 흘러가면 상품이 엉뚱한 브랜드 아래로 들어가고
 *   그 상태로 손님에게 노출됩니다. 짧은 한국어 이름끼리는 더 쉽게 섞입니다.
 *   정확 일치 (공백·대소문자·특수기호 뺀 비교) 만 자동 매칭합니다.
 *   확신이 없으면 비웁니다. (명세 4-4 와 같은 생각)
 */

/**
 * 비교용으로 글자를 깎습니다. 공백·구두점·대소문자·악센트를 제거합니다.
 *
 * ★ NFKD → 액센트 결합문자 삭제 → NFC 순서로 돌립니다.
 *   NFKD 는 Ü 를 "U + 결합 분음부호" 로, "스" 를 "ㅅ + ㅡ" 로 쪼갭니다.
 *   결합 분음부호(U+0300-U+036F)만 걷어내면 Ü→U 가 됩니다.
 *   그 뒤 NFC 로 다시 합치면 한글 자모가 음절(스투시)로 돌아옵니다.
 *   NFC 를 빼먹으면 한글이 자모로 흩어진 채 아래 체크를 통과하지 못해 통째로
 *   사라져 버립니다. (실제로 그 상태였고 "스투시" 가 뉴욕트렌딕 쪽 "스투시" 와
 *   매칭이 안 됐습니다)
 */
function fold(text: string): string {
  if (!text) return '';
  const normalized = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // 결합 분음부호 (U+0300-U+036F) 제거
    .normalize('NFC'); // 쪼개진 한글을 다시 합칩니다
  // 글자·숫자가 아닌 것 전부 빼기.
  // ★ /u + \p{L} 는 TypeScript target 이 ES2017 라 쓰지 못합니다 (es2018 이상이어야 함).
  //   한글(가-힣)·CJK·라틴·숫자만 명시 유지하는 식으로 돌립니다.
  let out = '';
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    const isLatin = (code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a); // 0-9 · a-z
    const isHangul = code >= 0xac00 && code <= 0xd7a3; // 가-힣
    const isJamo = code >= 0x3131 && code <= 0x318e;
    const isCjk = code >= 0x4e00 && code <= 0x9fff; // 한자
    if (isLatin || isHangul || isJamo || isCjk) out += char;
  }
  return out;
}

/**
 * 자주 쓰는 짧은 꼬리말을 떼어 추가 후보로 만듭니다.
 *   "아미 파리스" → "아미파리스" 와 "아미" 둘 다 비교
 *   "폴로 랄프로렌" → "폴로랄프로렌" 과 "랄프로렌" 둘 다 비교
 */
function expandAliases(name: string): string[] {
  const base = fold(name);
  const out = new Set<string>([base]);

  // 공백 분리 토큰도 각각 넣습니다 (브랜드 label 이 영어·한글 합성인 경우가 많음)
  const tokens = name
    .split(/[\s/·,·]+/)
    .map((part) => fold(part))
    .filter((part) => part.length >= 2); // 두 글자 이상만
  tokens.forEach((token) => out.add(token));

  // 끝에 "파리스" 가 붙은 경우 빼고도 담습니다 (아미 파리스 ↔ 아미)
  const withoutTail = base.replace(/파리스$/, '').replace(/paris$/, '');
  if (withoutTail && withoutTail !== base) out.add(withoutTail);

  return Array.from(out).filter(Boolean);
}

export type BrandMatch =
  | { kind: 'matched'; slug: string }
  | { kind: 'absent'; sourceName: string } // 뉴욕트렌딕에 브랜드명이 비어 있음
  | { kind: 'unsupported'; sourceName: string }; // 우리가 취급하지 않는 브랜드

/**
 * 외부 브랜드명으로 우리 브랜드 slug 를 찾습니다.
 *
 * ★ 일부러 반환이 세 가지입니다.
 *   · matched     — 매칭된 slug 를 돌려줍니다
 *   · absent      — 외부 쪽이 브랜드를 안 보내준 경우. 운영자에게 선택을 맡깁니다.
 *   · unsupported — 외부 브랜드명은 있는데 우리 목록엔 없는 경우. 안내만 띄웁니다.
 */
export function matchBrand(brands: Brand[], sourceName: string | null | undefined): BrandMatch {
  const name = (sourceName ?? '').trim();
  if (!name) return { kind: 'absent', sourceName: '' };

  const needles = new Set(expandAliases(name));

  for (const brand of brands) {
    // 비교 대상: slug · label · name · nameKo
    const candidates = new Set<string>();
    for (const field of [brand.slug, brand.label, brand.name, brand.nameKo]) {
      for (const alias of expandAliases(field ?? '')) candidates.add(alias);
    }
    for (const needle of Array.from(needles)) {
      if (needle && candidates.has(needle)) {
        return { kind: 'matched', slug: brand.slug };
      }
    }
  }

  return { kind: 'unsupported', sourceName: name };
}
