import type { Metadata } from 'next';
import Link from 'next/link';
import { getCachedStore } from '@/lib/settings';

/**
 * 결제가 이루어지지 않은 경우의 화면.
 *
 * ★ 여기로 오는 경우는 "돈이 빠져나가지 않은 것이 확실한" 경우뿐입니다.
 *     cancelled  손님이 결제창에서 취소를 눌렀습니다
 *     declined   카드사가 승인을 거절했습니다
 *     noorder    주문을 찾지 못했습니다
 *   승인이 났을 수도 있는 상황은 절대 이 화면으로 보내지 마세요.
 *   그런 경우는 /checkout/pending (결제 확인 중) 입니다.
 *
 * ★★ 4-B 부터 주문은 결제대기가 아니라 결제실패로 정리됩니다.
 *   예전에는 결제대기로 남겨 두었는데, 그 주문을 정리하는 코드가 없어서
 *   손님이 취소를 누른 순간부터 재고가 영원히 묶였습니다.
 *   지금은 취소 신호를 받는 즉시 재고와 사용 포인트를 되돌립니다.
 *
 * ★ 장바구니는 비우지 않습니다. 그래서 손님이 곧바로 다시 시도할 수 있습니다.
 *   (장바구니를 비우는 곳은 주문 완료 화면 하나뿐입니다)
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '결제 미완료',
  robots: { index: false, follow: false, nocache: true },
};

const REASONS: Record<string, { title: string; body: string }> = {
  cancelled: {
    title: '결제가 취소되었습니다',
    body:
      '결제창에서 취소하셨거나 창이 닫혔습니다. 결제된 금액은 없습니다. 장바구니는 그대로 있으니 다시 시도하실 수 있습니다.',
  },
  declined: {
    title: '카드 승인이 거절되었습니다',
    body: '카드 한도·유효기간·해외결제 차단 등의 이유일 수 있습니다. 결제된 금액은 없습니다. 다른 카드나 다른 결제수단으로 다시 시도해 주세요.',
  },
  noorder: {
    title: '주문 정보를 찾을 수 없습니다',
    body: '결제 정보를 확인하지 못했습니다. 결제된 금액이 있는지 걱정되시면 고객센터로 연락 주시면 바로 확인해 드리겠습니다.',
  },
};

type PageProps = { searchParams: { no?: string; reason?: string } };

export default async function CheckoutFailedPage({ searchParams }: PageProps) {
  const orderNo = (searchParams.no ?? '').trim();
  const reason = REASONS[(searchParams.reason ?? '').trim()] ?? REASONS.cancelled;
  const store = await getCachedStore();

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">PAYMENT</p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          {reason.title}
        </h1>

        <p className="mt-6 text-[17px] leading-[1.9] text-ink md:text-[18px]">{reason.body}</p>

        {orderNo ? (
          /*
            ★ "결제대기로 저장되어 있다" 고 적지 않습니다.
              4-B 부터 이 주문은 결제실패로 정리되고 재고가 손님에게 돌아갑니다.
              손님이 이 주문번호로 다시 결제할 수 있다고 오해하면 안 됩니다.
              지금 필요한 안내는 "장바구니가 그대로다" 하나뿐입니다.
          */
          <p className="mt-6 border border-stone px-6 py-5 text-[16px] leading-[1.9] text-ink">
            주문번호 <strong className="select-all font-semibold tabular-nums">{orderNo}</strong> 은
            결제가 이루어지지 않아 마무리되지 않았습니다. <strong>장바구니는 그대로</strong>{' '}
            남아 있으니 다시 주문해 주시면 됩니다.
          </p>
        ) : null}

        <p className="mt-6 text-[16px] leading-[1.9] text-muted">
          도움이 필요하시면 고객센터 {store.phone}으로 연락 주세요.
          <br />
          {store.hours}
        </p>
      </header>

      <div className="btn-row mt-12 border-t border-stone pt-10">
        <Link href="/checkout" className="btn-primary">
          다시 주문하기
        </Link>
        <Link href="/order" className="btn-secondary">
          장바구니 보기
        </Link>
      </div>
    </div>
  );
}
