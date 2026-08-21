import type { Metadata } from 'next';
import Link from 'next/link';
import CartCleanupOnComplete from '@/components/CartCleanupOnComplete';
import PaymentStatusRefresh from '@/components/PaymentStatusRefresh';
import CopyOrderButton from '@/components/CopyOrderButton';
import DepositCountdown from '@/components/DepositCountdown';
import OrderReceipt, { orderToText } from '@/components/OrderReceipt';
import { depositDeadline, getOrderByNo } from '@/lib/orders';
import { verifyOrderToken } from '@/lib/order-token';
import { orderPaymentText } from '@/lib/order-status';
import { getCachedStore, getPaymentSettings } from '@/lib/settings';

/**
 * 주문 완료.
 *
 * ★ 검색에 잡히면 안 됩니다. noindex 로 막습니다.
 * ★ 주문번호만으로는 열리지 않습니다. 주문 직후 발급한 서명(k)이 있어야 합니다.
 *   번호를 하나씩 바꿔가며 남의 주문을 들여다보는 것을 막습니다.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '주문 완료',
  robots: { index: false, follow: false, nocache: true },
};

type PageProps = { searchParams: { no?: string; k?: string } };

export default async function CheckoutCompletePage({ searchParams }: PageProps) {
  const orderNo = (searchParams.no ?? '').trim();
  const token = (searchParams.k ?? '').trim();
  const store = await getCachedStore();

  const valid = orderNo ? await verifyOrderToken(orderNo, token) : false;
  const order = valid ? await getOrderByNo(orderNo) : null;

  if (!order) {
    return (
      <div className="shell py-20">
        <h1 className="font-serif text-[26px] leading-snug text-ink md:text-[32px]">
          주문 정보를 확인할 수 없습니다
        </h1>
        <p className="mt-4 max-w-[560px] text-[18px] leading-[1.9] text-ink">
          주문 완료 화면은 주문 직후에만 열립니다. 이미 지난 주문은 아래에서 주문번호와
          연락처로 조회해 주세요.
        </p>
        <div className="btn-row mt-8">
          <Link href="/order-lookup" className="btn-primary">
            주문 조회하기
          </Link>
          <Link href="/products" className="btn-secondary">
            전체 상품 보기
          </Link>
        </div>
      </div>
    );
  }

  const payment = await getPaymentSettings();

  /*
   * ★★ 이 화면의 모든 문구는 orderPaymentText 하나에서 나옵니다. (4-A)
   *   아래 OrderReceipt 의 상태 카드도 같은 함수를 씁니다.
   *   그래서 큰 제목과 상태 카드가 서로 다른 말을 할 수 없습니다.
   *
   *   예전에는 제목을 결제수단으로, 상태 카드를 status 로 각자 정했습니다.
   *   승인 확인이 끝나기 전 몇 초 사이에 화면이 그려지면
   *     제목  "결제가 완료되었습니다"
   *     상태  "결제대기 — 무통장입금을 고르셨다면 계좌로 입금해 주세요"
   *   가 한 화면에 같이 나왔습니다. 카드 손님에게는 최악의 안내입니다.
   *
   *   view 가 갈리는 기준
   *     paid         결제가 끝남 — 승인번호까지 보여 줍니다
   *     bank_pending 무통장입금, 입금 전 — 계좌와 기한을 안내합니다
   *     checking     카드인데 아직 확인 중 — 실패라고 말하지 않습니다
   */
  const payment_ = orderPaymentText(order);
  const view = payment_.view;

  /** 계좌·입금기한·에스크로는 "무통장입금이고 아직 입금 전" 일 때만 보여 줍니다. */
  const isBank = view === 'bank_pending';

  const deadline =
    depositDeadline(order.createdAt, payment.depositHours) ??
    new Date(Date.now() + payment.depositHours * 60 * 60 * 1000);

  /** '2026년 8월 15일 (금) 오후 2시 30분' — 한국시간으로 고정해 보여 줍니다. */
  const deadlineLabel = deadline.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  const receiptText = orderToText(order, store.name);

  return (
    <div className="shell py-14 md:py-20">
      {/*
        주문이 확정되면 장바구니에서 그 상품을 뺍니다. 화면에는 아무것도 그리지 않습니다.
        ★ 확정된 상태에서만 뺍니다.
            결제완료           → 뺍니다
            무통장 접수        → 뺍니다 (주문은 이미 들어갔습니다)
            결제 확인 중       → 두었다가, 확인이 끝나 결제완료가 되면 그때 뺍니다
            취소 · 결제실패    → 그대로 둡니다 (손님이 다시 시도할 수 있어야 합니다)
      */}
      <CartCleanupOnComplete
        ordered={order.items
          .filter((item) => item.itemStatus === 'normal')
          .map((item) => ({ productSlug: item.productSlug, optionKey: item.optionKey }))}
        confirmed={view === 'paid' || view === 'bank_pending'}
      />

      <header className="max-w-[680px]">
        <p className="label-xs">
          {view === 'paid' ? 'PAYMENT COMPLETE' : 'ORDER COMPLETE'}
        </p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          {payment_.title}
        </h1>
        <p className="mt-6 border border-stone px-6 py-5">
          <span className="text-[15px] tracking-[0.14em] text-muted">주문번호</span>
          <span className="mt-2 block select-all font-sans text-[30px] font-semibold tracking-[0.02em] tabular-nums text-ink md:text-[36px]">
            {order.orderNo}
          </span>
        </p>
        <p className="mt-5 text-[18px] leading-[1.9] text-ink md:text-[19px]">
          {isBank ? (
            <>
              아래 계좌로 <strong>{payment.depositHours}시간</strong> 이내에 입금해 주시면
              확인 후 발송을 시작합니다. 입금이 확인되면 알려드립니다.
            </>
          ) : (
            payment_.body
          )}
        </p>

        {/*
          ★★ 카드 결과를 기다리는 동안에만 다시 읽습니다.
            승인 확인은 보통 1~2초면 끝납니다. 그 사이에 화면이 그려졌을 뿐인데
            손님이 결제가 안 된 줄 알고 다시 결제하는 것을 막습니다.

          ★ checking(승인확인실패·검토필요)에서는 새로고침하지 않습니다.
            그 상태는 사람이 KSNET 거래내역과 대조해야 풀립니다.
            기다린다고 바뀌지 않는데 화면만 깜빡이면 손님이 더 불안해집니다.
        */}
        {view === 'card_pending' ? <PaymentStatusRefresh /> : null}
      </header>

      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
        <OrderReceipt
          order={order}
          bank={
            isBank
              ? {
                  bankName: payment.bankName,
                  accountNo: payment.accountNo,
                  accountHolder: payment.accountHolder,
                  deadline: deadline.toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }
              : null
          }
        />

        {/* ★ 입금 계좌 바로 아래. 기한을 모르고 취소당하는 일이 없게 합니다. */}
        {isBank && payment.autoCancelEnabled ? (
          <DepositCountdown deadline={deadline.toISOString()} label={deadlineLabel} />
        ) : null}

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border border-stone p-6 md:p-8">
            <h2 className="font-serif text-[19px] text-ink">주문 내역 보관</h2>
            <p className="mt-2 text-[15px] leading-[1.8] text-muted">
              주문번호는 조회할 때 필요합니다. 아래 버튼으로 복사해 두세요.
            </p>
            <div className="mt-5">
              <CopyOrderButton text={receiptText} />
            </div>

            <Link href="/order-lookup" className="btn-primary mt-3 w-full">
              주문 조회 페이지
            </Link>

            <p className="mt-6 border-t border-stone pt-5 text-[15px] leading-[1.8] text-muted">
              문의는 고객센터 {store.phone}
              <br />
              {store.hours}
            </p>
          </div>

          {/* 구매안전(에스크로) 서비스 안내 — 설정에 값이 있을 때만 나옵니다. */}
          {isBank && (payment.escrowNotice || payment.escrowImageUrl) ? (
            <div className="mt-6 border border-stone p-6">
              <h2 className="label-xs">구매안전서비스</h2>
              {payment.escrowImageUrl ? (
                <a
                  href={payment.escrowLinkUrl || undefined}
                  target={payment.escrowLinkUrl ? '_blank' : undefined}
                  rel="noreferrer"
                  className="mt-3 block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={payment.escrowImageUrl}
                    alt="구매안전서비스 가입 확인"
                    className="h-auto max-w-[160px]"
                  />
                </a>
              ) : null}
              {payment.escrowNotice ? (
                <p className="mt-3 text-[14px] leading-relaxed text-muted">
                  {payment.escrowNotice}
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      <div className="btn-row mt-14 border-t border-stone pt-10">
        <Link href="/products" className="btn-secondary">
          쇼핑 계속하기
        </Link>
        <Link href="/guide" className="btn-secondary">
          배송·교환·반품 안내
        </Link>
      </div>
    </div>
  );
}
