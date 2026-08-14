'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { claimOrderAction } from '@/app/(shop)/mypage/actions';
import { courierName, trackingUrl } from '@/lib/couriers';
import { formatDate } from '@/lib/format';
import { ORDER_STATUSES, ORDER_STATUS_META, statusLabel } from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import type { Order } from '@/lib/types';

/**
 * 마이페이지 주문 목록.
 * 상태 필터와 "비회원 주문 불러오기"를 함께 둡니다.
 */
export default function MemberOrderList({
  orders,
  status,
}: {
  orders: Order[];
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [claimOpen, setClaimOpen] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const claim = () => {
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await claimOrderAction(orderNo, phone);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '주문을 내 주문 내역으로 가져왔습니다.' });
      setOrderNo('');
      setPhone('');
      router.refresh();
    });
  };

  const inputClass =
    'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

  return (
    <div>
      {/* ── 상태 필터 ─────────────────────────────────── */}
      <nav aria-label="주문 상태" className="overflow-x-auto border-b border-stone pb-4">
        <ul className="flex min-w-max gap-x-4 gap-y-2">
          <li>
            <Link
              href="/mypage/orders"
              aria-current={status === 'all' ? 'page' : undefined}
              className={`text-[15px] tracking-[0.1em] transition-colors ${
                status === 'all'
                  ? 'text-ink underline decoration-wine underline-offset-[6px]'
                  : 'text-muted hover:text-ink'
              }`}
            >
              전체
            </Link>
          </li>
          {ORDER_STATUSES.map((item) => (
            <li key={item}>
              <Link
                href={`/mypage/orders?status=${item}`}
                aria-current={status === item ? 'page' : undefined}
                className={`whitespace-nowrap text-[15px] tracking-[0.1em] transition-colors ${
                  status === item
                    ? 'text-ink underline decoration-wine underline-offset-[6px]'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {ORDER_STATUS_META[item].label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── 목록 ──────────────────────────────────────── */}
      {orders.length === 0 ? (
        <div className="py-14">
          <p className="text-[16px] leading-relaxed text-ink">
            {status === 'all'
              ? '주문 내역이 없습니다.'
              : '이 상태의 주문이 없습니다.'}
          </p>
          <Link href="/products" className="btn-secondary mt-6">
            상품 둘러보기
          </Link>
        </div>
      ) : (
        <ul>
          {orders.map((order) => {
            const live = order.items.filter((item) => item.itemStatus === 'normal');
            const tracking = trackingUrl(order.courier, order.trackingNo);
            return (
              <li key={order.id} className="border-b border-stone py-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/mypage/orders/${order.id}`}
                    className="font-display text-[16px] tracking-[0.1em] text-ink"
                  >
                    {order.orderNo}
                  </Link>
                  <span className="text-[13px] text-muted">
                    {formatDate(order.createdAt)}
                  </span>
                </div>

                <ul className="mt-3">
                  {live.map((item) => (
                    <li key={item.id} className="text-[15px] leading-snug text-ink">
                      {item.productName}
                      {item.optionKey ? (
                        <span className="text-muted"> ({item.optionKey})</span>
                      ) : null}
                      <span className="text-muted"> · {item.quantity}개</span>
                    </li>
                  ))}
                  {live.length === 0 ? (
                    <li className="text-[15px] text-muted">전체 취소된 주문입니다.</li>
                  ) : null}
                </ul>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-[15px] font-medium text-ink">
                    {statusLabel(order.status)}
                  </span>
                  <span className="text-[15px] text-ink">
                    {formatPrice(order.totalAmount)}원
                  </span>
                  <Link
                    href={`/mypage/orders/${order.id}`}
                    className="text-[14px] text-muted underline underline-offset-4"
                  >
                    상세 보기
                  </Link>
                  {tracking ? (
                    <a
                      href={tracking}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[14px] text-muted underline underline-offset-4"
                    >
                      {courierName(order.courier)} 배송 조회 ↗
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── 비회원 주문 불러오기 ──────────────────────── */}
      <section aria-labelledby="claim-heading" className="mt-12 border border-stone p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="claim-heading" className="font-serif text-[17px] text-ink">
            비회원 주문 불러오기
          </h2>
          <button
            type="button"
            onClick={() => setClaimOpen((prev) => !prev)}
            className="text-[14px] text-muted underline underline-offset-4"
          >
            {claimOpen ? '닫기' : '열기'}
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          가입 전에 비회원으로 주문하셨다면 주문번호와 연락처로 내 주문 내역에 가져올 수
          있습니다.
        </p>

        {claimOpen ? (
          <div className="mt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="claim-no" className="label-xs block">
                  주문번호
                </label>
                <input
                  id="claim-no"
                  type="text"
                  value={orderNo}
                  onChange={(event) => setOrderNo(event.target.value.toUpperCase())}
                  placeholder="ORD-20260814-0001"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="claim-phone" className="label-xs block">
                  주문자 연락처
                </label>
                <input
                  id="claim-phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="010-1234-5678"
                  className={inputClass}
                />
              </div>
            </div>

            {message ? (
              <p
                role="status"
                className={`mt-4 text-[14px] leading-relaxed ${
                  message.tone === 'ok' ? 'text-ink' : 'text-wine'
                }`}
              >
                {message.text}
              </p>
            ) : null}

            <button
              type="button"
              onClick={claim}
              disabled={pending}
              className="btn-secondary mt-5"
            >
              {pending ? '불러오는 중…' : '주문 불러오기'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
