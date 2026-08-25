import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import KsnetPayLauncher from '@/components/KsnetPayLauncher';
import { getOrderByNo } from '@/lib/orders';
import { verifyOrderToken } from '@/lib/order-token';
import { ksnetResultUrl } from '@/lib/payments/ksnet/result-url';
import {
  KSPAY_FRAME_HEIGHT,
  KSPAY_FRAME_NAME,
  KSPAY_FRAME_WIDTH,
} from '@/lib/payments/ksnet/config';
import { buildKsnetForm, isMobileUserAgent } from '@/lib/payments/ksnet/fields';
import { getCachedStore, getPaymentSettings } from '@/lib/settings';
import { isPgMethod } from '@/lib/site-config';

/**
 * 결제창으로 넘어가는 중간 화면.
 *
 * ★ 결제창 파라미터를 여기(서버)에서 만듭니다.
 *   주문서에서 만들어 넘기면 손님 브라우저를 거치게 되어 금액을 바꿔 보낼 수 있습니다.
 *   여기서는 주문번호로 DB 를 다시 읽어 그 주문의 금액을 씁니다.
 *
 * ★ PC·모바일 판단도 여기서 합니다. User-Agent 헤더는 서버에만 있습니다.
 *
 * ★ 개인정보와 결제 정보가 지나가는 화면이라 검색에 잡히면 안 됩니다.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '결제 진행',
  robots: { index: false, follow: false, nocache: true },
};

type PageProps = { searchParams: { no?: string; k?: string } };

export default async function CheckoutPayPage({ searchParams }: PageProps) {
  const orderNo = (searchParams.no ?? '').trim();
  const token = (searchParams.k ?? '').trim();

  /*
   * ★ 주문번호만으로는 열리지 않습니다.
   *   번호를 하나씩 바꿔가며 남의 주문 금액과 이름을 들여다보는 것을 막습니다.
   *   토큰은 주문 직후에만 발급됩니다. (lib/order-token.ts)
   */
  const valid = orderNo ? await verifyOrderToken(orderNo, token) : false;
  const order = valid ? await getOrderByNo(orderNo) : null;

  if (!order) return <Problem message="결제 정보를 확인할 수 없습니다." />;

  if (!isPgMethod(order.paymentMethod)) {
    return <Problem message="이 주문은 카드결제 대상이 아닙니다." orderNo={order.orderNo} />;
  }

  /*
   * ── ★★ 안전망 — 뒤로가기로 여기 돌아온 손님을 결과 화면으로 보냅니다 ──
   *   (2026-08-25)
   *
   * 이미 결제가 끝났거나 취소된 주문의 결제창은 절대 다시 열지 않습니다.
   * 그건 그대로입니다. 바뀐 것은 "그 다음에 무엇을 보여 주는가" 입니다.
   *
   * ★★ 예전에는 "결제를 진행할 수 없습니다 / 이 주문은 이미 결제완료
   *   상태입니다" 라는 막다른 화면을 보여 줬습니다. 이게 위험했습니다.
   *
   *   모바일에서 결제 후 화면이 안 넘어가면 손님이 제일 먼저 하는 것이
   *   뒤로가기입니다. 그러면 이 주소로 돌아옵니다. 결제는 됐는데 화면은
   *   "진행할 수 없습니다" 라고 하니, 손님은 결제가 실패한 줄 압니다.
   *   그대로 다시 결제하면 이중결제입니다.
   *
   * ★ 그래서 상태에 맞는 결과 화면으로 그냥 보냅니다.
   *   결제창 복귀(return 라우트)·상태 확인 창구와 같은 ksnetResultUrl 을 씁니다.
   *   세 곳이 같은 함수를 쓰므로 서로 다른 곳으로 보낼 일이 없습니다.
   *
   * ★ 여기까지 온 사람은 이미 서명(k)을 통과했습니다. 남의 주문이 아닙니다.
   */
  if (order.status !== 'pending_payment') {
    redirect(await ksnetResultUrl(order.status, order.orderNo));
  }

  // 관리자가 그 사이 결제수단을 껐을 수 있습니다.
  const payment = await getPaymentSettings();
  if (payment.methods[order.paymentMethod] !== true) {
    return (
      <Problem
        message="지금은 이 결제수단을 이용할 수 없습니다. 고객센터로 문의해 주세요."
        orderNo={order.orderNo}
      />
    );
  }

  /*
   * ★ PC 인지 모바일인지 여기서 정합니다. User-Agent 헤더는 서버에만 있습니다.
   *   결제창 주소가 기기에 따라 다르기 때문에(경로 자체가 다릅니다)
   *   폼을 만들기 전에 알아야 합니다.
   */
  const isMobile = isMobileUserAgent(headers().get('user-agent') ?? '');

  const store = await getCachedStore();
  const built = buildKsnetForm(order, store, isMobile);

  if (built.problem) {
    // ★ 규격에 안 맞는 값으로 결제창을 열면 KSNET 이 거절합니다.
    //   열어 보고 실패하는 것보다 여기서 멈추고 이유를 남기는 편이 낫습니다.
    console.error('[checkout/pay] 결제창 파라미터 오류:', order.orderNo, built.problem);
    return (
      <Problem
        message="결제창을 여는 데 필요한 정보가 올바르지 않습니다. 고객센터로 연락해 주시면 바로 도와드리겠습니다."
        orderNo={order.orderNo}
      />
    );
  }

  return (
    <KsnetPayLauncher
      fields={built.fields}
      action={built.action}
      frameName={KSPAY_FRAME_NAME}
      frameWidth={KSPAY_FRAME_WIDTH}
      frameHeight={KSPAY_FRAME_HEIGHT}
      isMobile={isMobile}
      orderNo={order.orderNo}
      /*
       * ★ 바깥 창이 스스로 주문 상태를 물어볼 때 함께 보냅니다.
       *   방금 위에서 확인한 그 서명입니다. 새로 만들지 않습니다.
       */
      token={token}
    />
  );
}

function Problem({
  message,
  orderNo,
  lookup = false,
}: {
  message: string;
  orderNo?: string;
  lookup?: boolean;
}) {
  return (
    <div className="shell py-20">
      <h1 className="font-serif text-[26px] leading-snug text-ink md:text-[32px]">
        결제를 진행할 수 없습니다
      </h1>
      <p className="mt-5 max-w-[560px] text-[17px] leading-[1.9] text-ink">{message}</p>
      {orderNo ? (
        <p className="mt-3 text-[16px] leading-[1.9] text-muted">주문번호 {orderNo}</p>
      ) : null}
      <div className="btn-row mt-8">
        {lookup ? (
          <Link href="/order-lookup" className="btn-primary">
            주문 조회하기
          </Link>
        ) : (
          <Link href="/order" className="btn-primary">
            장바구니로 돌아가기
          </Link>
        )}
        <Link href="/products" className="btn-secondary">
          전체 상품 보기
        </Link>
      </div>
    </div>
  );
}
