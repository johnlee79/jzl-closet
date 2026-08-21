'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import OrderEarnNote from '@/components/OrderEarnNote';
import OrderProgress from '@/components/OrderProgress';
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
/** 배송이 끝난 주문에만 후기를 쓸 수 있습니다. */
const REVIEWABLE = ['delivered', 'confirmed'];

/** '8월 15일 14:30' — 한국시간 기준 */
function deadlineLabel(createdAt: string | null, hours: number): string {
  if (!createdAt || hours < 1) return '';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '';

  return new Date(created.getTime() + hours * 60 * 60 * 1000).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function MemberOrderList({
  orders,
  status,
  reviewedKeys,
  depositHours,
}: {
  orders: Order[];
  status: string;
  /** 이미 후기를 쓴 "주문id:상품id" 조합 */
  reviewedKeys: string[];
  /** 입금 기한(시간). 0 이면 기한 안내를 하지 않습니다. */
  depositHours: number;
}) {
  const reviewed = new Set(reviewedKeys);
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
    'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

  return (
    <div>
      {/* ── 상태 필터 ─────────────────────────────────── */}
      <nav aria-label="주문 상태" className="overflow-x-auto border-b border-stone pb-4">
        <ul className="flex min-w-max gap-x-4 gap-y-2">
          <li>
            <Link
              href="/mypage/orders"
              aria-current={status === 'all' ? 'page' : undefined}
              className={`text-[16px] tracking-[0.1em] transition-colors ${
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
                className={`whitespace-nowrap text-[16px] tracking-[0.1em] transition-colors ${
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
          <p className="text-[17px] leading-relaxed text-ink">
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
                    className="text-[17px] font-semibold tabular-nums tracking-[0.02em] text-ink"
                  >
                    {order.orderNo}
                  </Link>
                  <span className="text-[14px] text-muted">
                    {formatDate(order.createdAt)}
                  </span>
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {live.map((item) => {
                    // ★ 배송이 끝났고 아직 안 쓴 상품에만 버튼을 보여 줍니다.
                    const canReview =
                      REVIEWABLE.includes(order.status) &&
                      Boolean(item.productId) &&
                      !reviewed.has(`${order.id}:${item.productId}`);

                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="text-[16px] leading-snug text-ink">
                          {item.productName}
                          {item.optionKey ? (
                            <span className="text-muted"> ({item.optionKey})</span>
                          ) : null}
                          <span className="text-muted"> · {item.quantity}개</span>
                        </span>

                        {canReview ? (
                          <Link
                            href={`/mypage/reviews/new?order=${order.id}&product=${item.productSlug}`}
                            className="inline-flex min-h-[36px] shrink-0 items-center border border-ink px-3.5 text-[14px] text-ink transition-colors hover:bg-ink hover:text-paper"
                          >
                            리뷰 쓰기
                          </Link>
                        ) : REVIEWABLE.includes(order.status) && item.productId ? (
                          <span className="shrink-0 text-[14px] text-muted">
                            후기 작성 완료
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                  {live.length === 0 ? (
                    <li className="text-[16px] text-muted">전체 취소된 주문입니다.</li>
                  ) : null}
                </ul>

                {/*
                  진행 단계 — 목록에서는 작은 형태로 넣습니다.
                  ★ 아래 상태 이름 바로 위에 둡니다. 위아래로 떨어뜨려 놓으면
                    같은 것을 말하는 두 표시가 따로 노는 것처럼 보입니다.
                */}
                <OrderProgress status={order.status} compact className="mt-5 max-w-[420px]" />

                <OrderEarnNote order={order} className="mt-4" />

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-[16px] font-medium text-ink">
                    {statusLabel(order.status)}
                    {/* ★ 입금대기 주문에는 기한을 함께 보여 줍니다. */}
                    {order.status === 'pending_payment' && depositHours > 0
                      ? ` · ${deadlineLabel(order.createdAt, depositHours)}까지`
                      : ''}
                  </span>
                  <span className="text-[16px] text-ink">
                    {formatPrice(order.totalAmount)}원
                  </span>
                  <Link
                    href={`/mypage/orders/${order.id}`}
                    className="text-[15px] text-muted underline underline-offset-4"
                  >
                    상세 보기
                  </Link>
                  {tracking ? (
                    <a
                      href={tracking}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[15px] text-muted underline underline-offset-4"
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
          <h2 id="claim-heading" className="font-serif text-[18px] text-ink">
            비회원 주문 불러오기
          </h2>
          <button
            type="button"
            onClick={() => setClaimOpen((prev) => !prev)}
            className="text-[15px] text-muted underline underline-offset-4"
          >
            {claimOpen ? '닫기' : '열기'}
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
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
                className={`mt-4 text-[15px] leading-relaxed ${
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
