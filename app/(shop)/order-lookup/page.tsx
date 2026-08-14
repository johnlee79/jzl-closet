import type { Metadata } from 'next';
import OrderLookup from '@/components/OrderLookup';
import { getCachedStore } from '@/lib/settings';

/**
 * 비회원 주문 조회.
 * ★ 개인정보가 나오는 화면이라 검색에 잡히면 안 됩니다. noindex 로 막습니다.
 * 조회 폼은 가운데 카드로, 조회 결과는 넓게 보여 줍니다.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '주문 조회',
  robots: { index: false, follow: false, nocache: true },
};

export default async function OrderLookupPage() {
  const store = await getCachedStore();

  return <OrderLookup storeName={store.name} storePhone={store.phone} />;
}
