'use client';

import { useEffect } from 'react';
import { pushRecent } from '@/lib/recently-viewed';
import type { Product } from '@/lib/types';

/**
 * 상품 상세를 열면 브라우저에 기록을 남깁니다. (3-H C-1)
 *
 * ★ 화면에 아무것도 그리지 않습니다. 기록만 남기는 자리입니다.
 *   GA4 를 담당하는 ViewItemTracker 와 굳이 합치지 않았습니다.
 *   한쪽은 통계, 한쪽은 손님 편의라 켜고 끄는 이유가 서로 다릅니다.
 *
 * ★ 상세는 ISR 로 구워 두는 페이지라 이 컴포넌트만 브라우저에서 따로 돕니다.
 *   시각은 여기서 읽습니다. 서버에서 넣으면 구워 둔 시각이 박혀
 *   모든 손님이 같은 시각을 기록하게 됩니다.
 */
export default function RecentlyViewedRecorder({ product }: { product: Product }) {
  useEffect(() => {
    pushRecent(product, Date.now());
    // slug 가 같으면 같은 상품입니다. 객체가 새로 만들어져도 다시 기록하지 않습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.slug]);

  return null;
}
