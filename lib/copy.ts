import { sanitizeRichText } from '@/lib/product-utils';
import { applyStoreTokens, type CopySection, type StoreSettings } from '@/lib/site-config';

/**
 * 저장된 문구를 화면에 그릴 수 있는 형태로 바꿉니다.
 *   1) {{company}} 같은 치환자를 스토어 정보 값으로 바꾸고
 *   2) 허용한 태그(굵게·줄바꿈·링크·정렬)만 남깁니다.
 */
export type ResolvedBlock = {
  heading: string;
  html: string;
};

export function resolveCopy(
  section: CopySection,
  store: StoreSettings
): ResolvedBlock[] {
  return section.map((block) => ({
    heading: applyStoreTokens(block.heading, store),
    html: sanitizeRichText(applyStoreTokens(block.body, store)),
  }));
}

/** 메타데이터·JSON-LD 에 쓸 평문. 태그를 지우고 공백을 정리합니다. */
export function copyToPlainText(section: CopySection, store: StoreSettings): string {
  return resolveCopy(section, store)
    .map((block) => `${block.heading} ${block.html}`)
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
