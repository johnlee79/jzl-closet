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
  store: StoreSettings,
  /**
   * 스토어 정보 밖에서 오는 치환자. (지금은 반품·교환 배송비뿐입니다)
   * ★ 넘기지 않으면 그 치환자는 글자 그대로 남습니다.
   *   이용약관과 배송·교환·반품 안내에서만 넘겨 줍니다.
   */
  extra: Record<string, string> = {}
): ResolvedBlock[] {
  return section.map((block) => ({
    heading: applyStoreTokens(block.heading, store, extra),
    html: sanitizeRichText(applyStoreTokens(block.body, store, extra)),
  }));
}

/**
 * 배송·반품 설정에서 오는 치환자를 만듭니다.
 * ★ 금액은 관리자 > 설정 > 배송·반품 에서 옵니다. 약관에 숫자를 박지 않습니다.
 */
export function shippingTokens(shipping: {
  returnFee: number;
  exchangeFee: number;
}): Record<string, string> {
  return {
    returnFee: `${shipping.returnFee.toLocaleString('ko-KR')}원`,
    exchangeFee: `${shipping.exchangeFee.toLocaleString('ko-KR')}원`,
  };
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
