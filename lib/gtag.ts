/**
 * GA4 이벤트 전송 헬퍼. (클라이언트 전용)
 *
 * 측정 ID 는 관리자 > 설정 > 분석(GA4) 에서 넣습니다.
 * 값이 없거나 개발 환경이면 components/GoogleAnalytics.tsx 가 스크립트를 아예
 * 넣지 않으므로, 여기 함수들은 조용히 아무 일도 하지 않습니다.
 */

type GtagParams = Record<string, unknown>;

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** GA4 표준 이벤트를 보냅니다. 스크립트가 없으면 아무 일도 하지 않습니다. */
export function gaEvent(name: string, params: GtagParams = {}): void {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

/** GA4 의 items 배열 한 줄 */
export type GaItem = {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity?: number;
};

/** 상품 상세 조회 */
export function trackViewItem(item: GaItem): void {
  gaEvent('view_item', {
    currency: 'KRW',
    value: item.price,
    items: [item],
  });
}

/** 장바구니 담기 */
export function trackAddToCart(item: GaItem): void {
  const quantity = item.quantity ?? 1;
  gaEvent('add_to_cart', {
    currency: 'KRW',
    value: item.price * quantity,
    items: [{ ...item, quantity }],
  });
}
