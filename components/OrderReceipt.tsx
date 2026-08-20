import Link from 'next/link';
import { courierName, trackingUrl } from '@/lib/couriers';
import { orderPaymentText } from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import { paymentMethodDetail } from '@/lib/site-config';
import type { Order } from '@/lib/types';

/**
 * 손님에게 보여 주는 주문 내역.
 * 주문 완료 화면과 주문 조회 화면이 함께 씁니다.
 *
 * ★ 훅을 쓰지 않는 순수 표시용 컴포넌트라 서버·클라이언트 어디서든 쓸 수 있습니다.
 * ★ 계좌 정보(bank)는 이 두 화면에서만 넘겨 줍니다. 다른 곳에 노출하지 마세요.
 */
export type BankInfo = {
  bankName: string;
  accountNo: string;
  accountHolder: string;
  /** 입금 기한 (표시용 문자열) */
  deadline: string;
};

export default function OrderReceipt({
  order,
  bank,
  showStatus = true,
}: {
  order: Order;
  bank?: BankInfo | null;
  showStatus?: boolean;
}) {
  /*
   * ★ 상태 문구는 lib/order-status.ts 한 곳에서만 나옵니다.
   *   완료 화면의 큰 제목도 같은 함수를 씁니다. 그래서 두 곳이 다른 말을 할 수 없습니다.
   *   (예전에는 제목은 결제수단으로, 여기는 status 로 각자 정해서 서로 어긋났습니다)
   */
  const payment = orderPaymentText(order);

  const liveItems = order.items.filter((item) => item.itemStatus === 'normal');
  const cancelledItems = order.items.filter((item) => item.itemStatus === 'cancelled');
  const tracking = trackingUrl(order.courier, order.trackingNo);

  return (
    <div className="flex flex-col gap-10">
      {/* ── 주문 상태 ─────────────────────────────────── */}
      {showStatus ? (
        <section aria-labelledby="status-heading" className="border border-stone p-6 md:p-8">
          <h2 id="status-heading" className="label-xs">
            주문 상태
          </h2>
          <p className="mt-3 font-serif text-[22px] text-ink md:text-[26px]">
            {payment.title}
          </p>
          <p className="mt-2 text-[16px] leading-[1.8] text-ink">{payment.body}</p>

          {/*
            카드 승인 정보 (4-A)
            ★ 손님이 가장 불안해하는 지점입니다. 승인번호가 눈에 보이면 안심합니다.
              카드사에 문의할 때도 이 번호가 필요합니다.
            ★ 무통장입금에는 나오지 않습니다. (승인번호가 없습니다)
          */}
          {payment.view === 'paid' && order.pgAuthNo ? (
            <dl className="mt-6 flex flex-col gap-2.5 border-t border-stone pt-5 text-[16px]">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">결제수단</dt>
                {/* ★ 카드사명까지 보여 줍니다. 손님이 어느 카드로 결제했는지 바로 압니다. */}
                <dd className="text-ink">
                  {paymentMethodDetail(order.paymentMethod, order.pgMessage)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">승인번호</dt>
                <dd className="font-sans font-semibold tabular-nums text-ink">
                  {order.pgAuthNo}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">결제금액</dt>
                <dd className="text-ink">{formatPrice(order.totalAmount)}원</dd>
              </div>
            </dl>
          ) : null}

          {order.trackingNo ? (
            <div className="mt-6 border-t border-stone pt-5">
              <p className="text-[15px] text-ink">
                {courierName(order.courier)} · {order.trackingNo}
              </p>
              {tracking ? (
                <a
                  href={tracking}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary mt-4"
                >
                  배송 조회하기 ↗
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── 입금 계좌 ─────────────────────────────────── */}
      {bank && bank.accountNo ? (
        <section
          aria-labelledby="bank-heading"
          className="border border-ink bg-ink/[0.03] p-6 md:p-8"
        >
          <h2 id="bank-heading" className="label-xs">
            입금 계좌
          </h2>
          <p className="mt-3 font-sans text-[22px] font-semibold leading-snug tabular-nums text-ink md:text-[26px]">
            {bank.bankName} {bank.accountNo}
          </p>
          <p className="mt-1.5 text-[16px] text-ink">예금주 {bank.accountHolder}</p>

          <dl className="mt-6 flex flex-col gap-2.5 border-t border-stone pt-5 text-[16px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">입금 금액</dt>
              <dd className="font-medium text-ink">{formatPrice(order.totalAmount)}원</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">입금자명</dt>
              <dd className="text-ink">{order.depositorName || order.ordererName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">입금 기한</dt>
              <dd className="text-ink">{bank.deadline}</dd>
            </div>
          </dl>

          <p className="mt-5 text-[14px] leading-[1.8] text-muted">
            기한 안에 입금이 확인되지 않으면 주문이 자동으로 취소될 수 있습니다. 입금자명이
            주문자와 다르면 고객센터로 알려 주세요.
          </p>
        </section>
      ) : null}

      {/* ── 주문 상품 ─────────────────────────────────── */}
      <section aria-labelledby="items-heading">
        <h2
          id="items-heading"
          className="border-b border-stone pb-4 font-serif text-[18px] text-ink"
        >
          주문 상품
        </h2>
        <ul>
          {liveItems.map((item) => (
            <li key={item.id} className="flex gap-4 border-b border-stone py-5">
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                {item.brandLabel ? (
                  <p className="text-[12px] tracking-[0.16em] text-muted">
                    {item.brandLabel}
                  </p>
                ) : null}
                <Link
                  href={`/products/${item.productSlug}`}
                  className="mt-1 text-[16px] font-medium leading-snug text-ink"
                >
                  {item.productName}
                </Link>
                <p className="mt-1 text-[14px] text-muted">
                  {item.optionKey || '옵션 없음'} · {item.quantity}개
                </p>
              </div>
              <p className="self-center whitespace-nowrap text-[16px] font-medium tabular-nums text-ink">
                {formatPrice(item.lineTotal)}원
              </p>
            </li>
          ))}

          {cancelledItems.map((item) => (
            <li
              key={item.id}
              className="flex gap-4 border-b border-stone py-5 text-muted line-through"
            >
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="font-serif text-[16px] leading-snug">{item.productName}</p>
                <p className="mt-1 text-[13px]">
                  {item.optionKey || '옵션 없음'} · {item.quantity}개 · 취소됨
                </p>
              </div>
              <p className="self-center whitespace-nowrap text-[15px]">
                {formatPrice(item.lineTotal)}원
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-6 flex flex-col gap-3 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-muted">상품 합계</dt>
            <dd className="text-ink">{formatPrice(order.itemsTotal)}원</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">배송비</dt>
            <dd className="text-ink">
              {order.shippingFee === 0 ? '무료' : `${formatPrice(order.shippingFee)}원`}
            </dd>
          </div>
          {order.extraShippingFee > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">도서산간 추가</dt>
              <dd className="text-ink">{formatPrice(order.extraShippingFee)}원</dd>
            </div>
          ) : null}
          {order.discount > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">할인</dt>
              <dd className="text-ink">− {formatPrice(order.discount)}원</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 flex items-baseline justify-between border-t border-stone pt-5">
          <span className="text-[13px] tracking-[0.14em] text-muted">총 결제금액</span>
          <span className="font-display text-[26px] font-medium tracking-wide text-ink">
            {formatPrice(order.totalAmount)}
            <span className="ml-1 font-sans text-[15px]">원</span>
          </span>
        </div>
      </section>

      {/* ── 배송지 ────────────────────────────────────── */}
      <section aria-labelledby="delivery-heading">
        <h2
          id="delivery-heading"
          className="border-b border-stone pb-4 font-serif text-[18px] text-ink"
        >
          배송 정보
        </h2>
        <dl className="mt-5 flex flex-col gap-3 text-[15px] leading-relaxed">
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-muted">받는 분</dt>
            <dd className="text-ink">
              {order.receiverName} · {order.receiverPhone}
            </dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-muted">주소</dt>
            <dd className="text-ink">
              ({order.postcode}) {order.address1} {order.address2}
            </dd>
          </div>
          {order.deliveryMemo ? (
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-muted">배송 메모</dt>
              <dd className="text-ink">{order.deliveryMemo}</dd>
            </div>
          ) : null}
          {order.cashReceiptType !== 'none' ? (
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-muted">현금영수증</dt>
              <dd className="text-ink">
                {order.cashReceiptType === 'personal' ? '소득공제' : '지출증빙'} 신청
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}

/** 주문 내역을 문자로 보내기 좋은 평문으로 만듭니다. (복사 버튼용) */
export function orderToText(order: Order, storeName: string): string {
  const lines = [
    `[${storeName} 주문 내역]`,
    '',
    `주문번호: ${order.orderNo}`,
    `주문일시: ${order.createdAt ? new Date(order.createdAt).toLocaleString('ko-KR') : '-'}`,
    // ★ 화면과 같은 문구를 씁니다. 복사한 글과 화면이 다른 말을 하면 안 됩니다.
    `주문상태: ${orderPaymentText(order).title}`,
    '',
    ...order.items
      .filter((item) => item.itemStatus === 'normal')
      .map(
        (item) =>
          `· ${item.productName}${item.optionKey ? ` (${item.optionKey})` : ''} — ${item.quantity}개 — ${formatPrice(item.lineTotal)}원`
      ),
    '',
    `상품 합계: ${formatPrice(order.itemsTotal)}원`,
    `배송비: ${order.shippingFee === 0 ? '무료' : `${formatPrice(order.shippingFee)}원`}`,
    ...(order.extraShippingFee > 0
      ? [`도서산간 추가: ${formatPrice(order.extraShippingFee)}원`]
      : []),
    `총 결제금액: ${formatPrice(order.totalAmount)}원`,
    '',
    `받는 분: ${order.receiverName} (${order.receiverPhone})`,
    `주소: (${order.postcode}) ${order.address1} ${order.address2}`,
    ...(order.deliveryMemo ? [`배송 메모: ${order.deliveryMemo}`] : []),
    ...(order.trackingNo
      ? ['', `송장: ${courierName(order.courier)} ${order.trackingNo}`]
      : []),
  ];
  return lines.join('\n');
}
