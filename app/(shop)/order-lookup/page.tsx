import type { Metadata } from 'next';
import OrderLookup from '@/components/OrderLookup';
import { getCachedStore } from '@/lib/settings';

/**
 * 비회원 주문 조회.
 * ★ 개인정보가 나오는 화면이라 검색에 잡히면 안 됩니다. noindex 로 막습니다.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '주문 조회',
  robots: { index: false, follow: false, nocache: true },
};

export default async function OrderLookupPage() {
  const store = await getCachedStore();

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">ORDER LOOKUP</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          주문 조회
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          회원가입 없이 주문번호와 연락처만으로 주문 상태와 배송 정보를 확인하실 수
          있습니다.
        </p>
      </header>

      <OrderLookup storeName={store.name} storePhone={store.phone} />
    </div>
  );
}
