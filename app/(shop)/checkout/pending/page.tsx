import type { Metadata } from 'next';
import Link from 'next/link';
import { getCachedStore } from '@/lib/settings';

/**
 * "결제 확인 중" 화면.
 *
 * ★★ 이 화면의 문구를 함부로 고치지 마세요.
 *   여기로 오는 손님은 두 경우입니다.
 *     · 우리가 승인 확인을 못 한 경우 (승인은 났을 수 있습니다)
 *     · 금액이 어긋나 사람이 확인해야 하는 경우
 *   두 경우 모두 카드 승인이 이미 났을 수 있습니다.
 *   여기서 "결제에 실패했습니다. 다시 시도해 주세요" 라고 안내하면
 *   손님이 한 번 더 결제해 이중결제가 납니다. 환불도 며칠 걸립니다.
 *   그래서 실패로 단정하지 않고 "확인 중" 으로만 안내합니다.
 *
 * ★ 주문번호는 보여 주지만 주문 내용은 보여 주지 않습니다.
 *   토큰 없이 열리는 화면이라 남의 주문 정보를 노출하면 안 됩니다.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '결제 확인 중',
  robots: { index: false, follow: false, nocache: true },
};

type PageProps = { searchParams: { no?: string } };

export default async function CheckoutPendingPage({ searchParams }: PageProps) {
  const orderNo = (searchParams.no ?? '').trim();
  const store = await getCachedStore();

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">PAYMENT</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          결제 결과를 확인하고 있습니다
        </h1>

        {orderNo ? (
          <p className="mt-6 border border-stone px-6 py-5">
            <span className="text-[13px] tracking-[0.14em] text-muted">주문번호</span>
            <span className="mt-2 block font-display text-[28px] tracking-[0.12em] text-ink md:text-[34px]">
              {orderNo}
            </span>
          </p>
        ) : null}

        <p className="mt-6 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          주문은 정상적으로 접수되었습니다. 결제 승인 결과를 확인하는 데 시간이 조금
          걸리고 있습니다.
        </p>

        {/* ★ 이 상자가 이 화면의 핵심입니다. 이중결제를 막는 안내입니다. */}
        <div className="mt-8 border border-wine px-6 py-5">
          <p className="text-[15px] font-medium leading-[1.9] text-wine">
            다시 결제하지 마세요.
          </p>
          <p className="mt-2 text-[15px] leading-[1.9] text-ink">
            카드 승인이 이미 완료되었을 수 있습니다. 이 상태에서 한 번 더 결제하시면
            두 번 결제될 수 있습니다. 저희가 확인한 뒤 바로 연락드리겠습니다.
          </p>
        </div>

        <p className="mt-6 text-[15px] leading-[1.9] text-muted">
          확인이 끝나면 주문 조회 화면에서 결제완료로 바뀝니다. 급하시면 고객센터{' '}
          {store.phone}으로 연락 주세요.
          <br />
          {store.hours}
        </p>
      </header>

      <div className="btn-row mt-12 border-t border-stone pt-10">
        <Link href="/order-lookup" className="btn-primary">
          주문 조회하기
        </Link>
        <Link href="/products" className="btn-secondary">
          쇼핑 계속하기
        </Link>
      </div>
    </div>
  );
}
