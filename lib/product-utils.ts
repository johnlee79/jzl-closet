/**
 * 클라이언트·서버 어디서나 쓸 수 있는 순수 헬퍼.
 * DB 접근 코드(lib/products.ts)는 서버 전용이므로 여기와 분리합니다.
 */
import type { Gender, Product, ProductOption } from '@/lib/types';

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

/** 해당 옵션 값이 품절인지 */
export function isValueSoldOut(option: ProductOption, value: string): boolean {
  return option.soldOutValues.includes(value);
}

/** 상품 전체가 품절인지 — 수동 품절이거나 모든 옵션 값이 품절인 경우 */
export function isProductSoldOut(product: Product): boolean {
  if (product.isSoldOut) return true;
  if (product.options.length === 0) return false;
  return product.options.every(
    (option) =>
      option.values.length > 0 &&
      option.values.every((value) => option.soldOutValues.includes(value))
  );
}

/** 선택한 옵션 조합이 구매 가능한지 */
export function isSelectionAvailable(
  product: Product,
  selected: Record<string, string>
): boolean {
  return product.options.every((option) => {
    const value = selected[option.name];
    if (!value) return false;
    return !option.soldOutValues.includes(value);
  });
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
