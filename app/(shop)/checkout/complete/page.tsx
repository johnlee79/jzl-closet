import type { Metadata } from 'next';
import Link from 'next/link';
import CopyOrderButton from '@/components/CopyOrderButton';
import DepositCountdown from '@/components/DepositCountdown';
import OrderReceipt, { orderToText } from '@/components/OrderReceipt';
import { depositDeadline, getOrderByNo } from '@/lib/orders';
import { verifyOrderToken } from '@/lib/order-token';
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
        <h1 className="font-serif text-[24px] leading-snug text-ink md:text-[30px]">
          주문 정보를 확인할 수 없습니다
        </h1>
        <p className="mt-4 max-w-[560px] text-[16px] leading-[1.9] text-ink">
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
      <header className="max-w-[680px]">
        <p className="label-xs">ORDER COMPLETE</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          주문이 접수되었습니다
        </h1>
        <p className="mt-6 border border-stone px-6 py-5">
          <span className="text-[13px] tracking-[0.14em] text-muted">주문번호</span>
          <span className="mt-2 block font-display text-[30px] tracking-[0.12em] text-ink md:text-[38px]">
            {order.orderNo}
          </span>
        </p>
        <p className="mt-5 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          아래 계좌로 <strong>{payment.depositHours}시간</strong> 이내에 입금해 주시면
          확인 후 발송을 시작합니다. 입금이 확인되면 문자로 알려드립니다.
        </p>
      </header>

      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
        <OrderReceipt
          order={order}
          bank={{
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
          }}
        />

        {/* ★ 입금 계좌 바로 아래. 기한을 모르고 취소당하는 일이 없게 합니다. */}
        {payment.autoCancelEnabled ? (
          <DepositCountdown deadline={deadline.toISOString()} label={deadlineLabel} />
        ) : null}

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border border-stone p-6 md:p-8">
            <h2 className="font-serif text-[18px] text-ink">주문 내역 보관</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              주문번호는 조회할 때 필요합니다. 아래 버튼으로 복사해 두세요.
            </p>
            <div className="mt-5">
              <CopyOrderButton text={receiptText} />
            </div>

            <Link href="/order-lookup" className="btn-primary mt-3 w-full">
              주문 조회 페이지
            </Link>

            <p className="mt-6 border-t border-stone pt-5 text-[13px] leading-relaxed text-muted">
              문의는 고객센터 {store.phone}
              <br />
              {store.hours}
            </p>
          </div>

          {/* 구매안전(에스크로) 서비스 안내 — 설정에 값이 있을 때만 나옵니다. */}
          {payment.escrowNotice || payment.escrowImageUrl ? (
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
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
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
