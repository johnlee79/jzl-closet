import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import KsnetPayLauncher from '@/components/KsnetPayLauncher';
import { getOrderByNo } from '@/lib/orders';
import { verifyOrderToken } from '@/lib/order-token';
import { KSPAY_PC_SCRIPT } from '@/lib/payments/ksnet/config';
import { buildKsnetForm, isMobileUserAgent } from '@/lib/payments/ksnet/fields';
import { getCachedStore, getPaymentSettings } from '@/lib/settings';
import { isPgMethod } from '@/lib/site-config';
import { statusLabel } from '@/lib/order-status';

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

  // 이미 결제가 끝났거나 취소된 주문의 결제창을 다시 열면 이중결제가 납니다.
  if (order.status !== 'pending_payment') {
    return (
      <Problem
        message={`이 주문은 이미 "${statusLabel(order.status)}" 상태입니다. 결제창을 다시 열지 않습니다.`}
        orderNo={order.orderNo}
        lookup
      />
    );
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

  const store = await getCachedStore();
  const built = buildKsnetForm(order, store);

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

  const isMobile = isMobileUserAgent(headers().get('user-agent') ?? '');

  return (
    <KsnetPayLauncher
      fields={built.fields}
      mobileAction={built.mobileAction}
      scriptUrl={KSPAY_PC_SCRIPT}
      isMobile={isMobile}
      orderNo={order.orderNo}
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
      <h1 className="font-serif text-[24px] leading-snug text-ink md:text-[30px]">
        결제를 진행할 수 없습니다
      </h1>
      <p className="mt-5 max-w-[560px] text-[16px] leading-[1.9] text-ink">{message}</p>
      {orderNo ? (
        <p className="mt-3 text-[15px] leading-[1.9] text-muted">주문번호 {orderNo}</p>
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
