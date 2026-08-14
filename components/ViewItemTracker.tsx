'use client';

import { useEffect } from 'react';
import { trackViewItem, type GaItem } from '@/lib/gtag';

/**
 * 상품 상세를 열면 GA4 view_item 을 한 번 보냅니다.
 * 화면에는 아무것도 그리지 않습니다.
 */
export default function ViewItemTracker({ item }: { item: GaItem }) {
  useEffect(() => {
    trackViewItem(item);
    // 상품이 바뀔 때만 다시 보냅니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.item_id]);

  return null;
}
