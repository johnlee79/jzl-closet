/**
 * 클라이언트·서버 어디서나 쓸 수 있는 순수 헬퍼.
 * DB 접근 코드(lib/products.ts)는 서버 전용이므로 여기와 분리합니다.
 */
import {
  COMBINATION_SEPARATOR,
  type Gender,
  type OptionCombination,
  type OptionGroup,
  type Product,
} from '@/lib/types';

/** 상품 목록 상단 성별 필터 칩 */
export const genderFilters: { key: 'all' | Gender; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'women', label: 'WOMEN' },
  { key: 'men', label: 'MEN' },
  { key: 'unisex', label: 'UNISEX' },
];

export function formatPrice(price: number): string {
  return price.toLocaleString('ko-KR');
}

/** 할인율(%) — 할인 전 가격이 없으면 0 */
export function getDiscountRate(product: {
  price: number;
  originalPrice: number | null;
}): number {
  if (!product.originalPrice || product.originalPrice <= product.price) return 0;
  return Math.round((1 - product.price / product.originalPrice) * 100);
}

/* ------------------------------------------------------------------
 * 옵션 조합
 *
 * 옵션은 "그룹(컬러·사이즈)" 과 "조합(블랙/S)" 두 층으로 나뉩니다.
 * 품절·재고·추가금액은 모두 조합 단위로 관리합니다.
 * ------------------------------------------------------------------ */

/** 조합 개수 상한 — 옵션값을 실수로 많이 넣었을 때 화면이 멈추는 것을 막습니다. */
export const MAX_COMBINATIONS = 1000;

/** 관리자에게 경고를 띄우기 시작하는 조합 개수 (막지는 않습니다) */
export const COMBINATION_WARN_COUNT = 30;

/** 값 배열 → 조합 키. ["블랙", "S"] → "블랙/S" */
export function toCombinationKey(values: string[]): string {
  return values.join(COMBINATION_SEPARATOR);
}

/** 조합 키 → 값 배열 */
export function fromCombinationKey(key: string): string[] {
  return key.split(COMBINATION_SEPARATOR);
}

/** 옵션값에서 구분자를 제거합니다. (조합 키가 깨지지 않게) */
export function cleanOptionValue(value: string): string {
  return value.split(COMBINATION_SEPARATOR).join(' ').trim();
}

/**
 * 모든 그룹의 값을 곱집합으로 조합한 키 목록.
 * 값이 하나도 없는 그룹이 있으면 조합을 만들 수 없으므로 빈 배열입니다.
 */
export function buildCombinationKeys(groups: OptionGroup[]): string[] {
  const usable = groups.filter((group) => group.values.length > 0);
  if (usable.length === 0 || usable.length !== groups.length) return [];

  let keys: string[] = [''];
  for (const group of usable) {
    const next: string[] = [];
    for (const prefix of keys) {
      for (const value of group.values) {
        next.push(prefix ? `${prefix}${COMBINATION_SEPARATOR}${value}` : value);
        if (next.length > MAX_COMBINATIONS) return next.slice(0, MAX_COMBINATIONS);
      }
    }
    keys = next;
  }
  return keys;
}

/** 새 조합 한 줄의 기본값 */
export function defaultCombination(key: string): OptionCombination {
  return { key, isActive: true, stock: null, extraPrice: 0 };
}

/**
 * 그룹 구성이 바뀌었을 때 조합 표를 다시 만듭니다.
 * ★ 같은 이름의 조합이 이미 있으면 판매상태·재고·추가금액을 그대로 살립니다.
 *   (옵션값 하나 추가할 때마다 전부 다시 입력하는 일이 없도록)
 */
export function rebuildCombinations(
  groups: OptionGroup[],
  previous: OptionCombination[]
): OptionCombination[] {
  const kept = new Map(previous.map((item) => [item.key, item]));
  return buildCombinationKeys(groups).map(
    (key) => kept.get(key) ?? defaultCombination(key)
  );
}

/** 이 조합을 지금 살 수 있는지 — 판매중이고, 재고를 관리한다면 1개 이상 남아 있어야 합니다. */
export function isCombinationAvailable(combination: OptionCombination | null): boolean {
  if (!combination) return false;
  if (!combination.isActive) return false;
  return combination.stock === null || combination.stock > 0;
}

/** 선택한 값들(그룹 순서대로)에 해당하는 조합을 찾습니다. */
export function findCombination(
  product: Pick<Product, 'optionGroups' | 'optionCombinations'>,
  selected: Record<string, string>
): OptionCombination | null {
  const values = product.optionGroups.map((group) => selected[group.name] ?? '');
  if (values.some((value) => !value)) return null;
  const key = toCombinationKey(values);
  return product.optionCombinations.find((item) => item.key === key) ?? null;
}

/**
 * 옵션 목록에서 특정 값을 고를 수 있는지.
 * 이미 고른 다른 그룹의 값과 함께 성립하는 조합이 하나라도 살아 있어야 합니다.
 */
export function isValueSelectable(
  product: Pick<Product, 'optionGroups' | 'optionCombinations'>,
  groupIndex: number,
  value: string,
  selected: Record<string, string>
): boolean {
  if (product.optionCombinations.length === 0) return true;

  return product.optionCombinations.some((combination) => {
    const parts = fromCombinationKey(combination.key);
    if (parts[groupIndex] !== value) return false;

    // 이미 고른 다른 그룹의 값과도 맞아떨어져야 합니다.
    const matchesOthers = product.optionGroups.every((group, index) => {
      if (index === groupIndex) return true;
      const chosen = selected[group.name];
      return !chosen || parts[index] === chosen;
    });
    if (!matchesOthers) return false;

    return isCombinationAvailable(combination);
  });
}

/** 상품 전체가 품절인지 — 수동 품절이거나 모든 조합이 품절인 경우 */
export function isProductSoldOut(product: Product): boolean {
  if (product.isSoldOut) return true;
  if (product.optionCombinations.length === 0) return false;
  return !product.optionCombinations.some(isCombinationAvailable);
}

/** 선택한 옵션 조합을 살 수 있는지 */
export function isSelectionAvailable(
  product: Pick<Product, 'optionGroups' | 'optionCombinations'>,
  selected: Record<string, string>
): boolean {
  // 옵션이 없는 상품은 항상 구매 가능합니다.
  if (product.optionGroups.length === 0) return true;
  return isCombinationAvailable(findCombination(product, selected));
}

/** slug 자동 생성 — 영문 소문자와 하이픈만 남깁니다. */
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // 한글이 섞이면 URL 이 지저분해지므로 영문·숫자만 남기고, 남는 게 없으면 빈 문자열
  const ascii = base.replace(/[^a-z0-9-]/g, '');
  return ascii.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * 관리자 편집기에서 저장한 문구 HTML 을 안전한 태그만 남기고 정리합니다.
 * 굵게 · 줄바꿈 · 링크 · 정렬만 허용합니다.
 */
const ALLOWED_TAGS = new Set(['b', 'strong', 'br', 'a', 'p', 'div', 'span', 'em', 'i']);

export function sanitizeRichText(html: string): string {
  if (!html) return '';
  let out = html;
  // script/style 통째로 제거
  out = out.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  // 태그 단위 검사
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;

    const kept: string[] = [];
    if (tag === 'a') {
      const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
      // javascript: 등 위험한 스킴 차단
      if (/^(https?:|mailto:|tel:|\/)/i.test(href)) {
        kept.push(`href="${href}"`, 'target="_blank"', 'rel="noopener noreferrer"');
      }
    }
    const align = /text-align\s*:\s*(left|center|right)/i.exec(attrs)?.[1];
    if (align) kept.push(`style="text-align:${align.toLowerCase()}"`);

    return kept.length > 0 ? `<${tag} ${kept.join(' ')}>` : `<${tag}>`;
  });
  return out;
}

/** 문구 블록이 HTML 인지 (아니면 줄바꿈만 있는 평문으로 처리) */
export function isHtmlBody(body: string): boolean {
  return /<[a-zA-Z][^>]*>/.test(body);
}
