'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import AuthCard, { authButtonClass, authInputClass } from '@/components/AuthCard';
import CopyOrderButton from '@/components/CopyOrderButton';
import KakaoChatButton from '@/components/KakaoChatButton';
import OrderReceipt, { orderToText } from '@/components/OrderReceipt';
import { lookupOrderAction, requestCancelAction } from '@/app/(shop)/checkout/actions';
import { canRequestCancel } from '@/lib/order-status';
import type { Order } from '@/lib/types';

/**
 * 비회원 주문 조회.
 * 주문번호 + 연락처가 모두 맞아야 열립니다.
 * 연속 시도는 서버에서 같은 IP 분당 10회로 제한합니다. (lib/rate-limit.ts)
 *
 * ★ storePhone 을 더 받지 않습니다. 취소 불가 안내에 걸려 있던 전화 걸기 링크를
 *   카카오톡 문의로 바꾸면서 쓸 곳이 없어졌습니다. (3-G)
 */
export default function OrderLookup({ storeName }: { storeName: string }) {
  const [pending, startTransition] = useTransition();
  const [orderNo, setOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Order | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDone, setCancelDone] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError('');
    setCancelDone(false);
    setCancelOpen(false);
    startTransition(async () => {
      const result = await lookupOrderAction(orderNo, phone);
      if (!result.ok) {
        setOrder(null);
        setError(result.error);
        return;
      }
      setOrder(result.data);
    });
  };

  const submitCancel = () => {
    if (pending || !order) return;
    setError('');
    startTransition(async () => {
      const result = await requestCancelAction(order.orderNo, phone, cancelReason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCancelOpen(false);
      setCancelDone(true);
      // 이력이 하나 늘었으므로 최신 상태를 다시 읽어 옵니다.
      const refreshed = await lookupOrderAction(order.orderNo, phone);
      if (refreshed.ok) setOrder(refreshed.data);
    });
  };

  const inputClass = authInputClass;

  /* 조회 전에는 가운데 카드만 보여 줍니다. 결과가 나오면 아래에서 넓게 그립니다. */
  if (!order) {
    return (
      <AuthCard
        eyebrow="ORDER LOOKUP"
        title="주문 조회"
        description="회원가입 없이 주문번호와 연락처만으로 주문 상태와 배송 정보를 확인하실 수 있습니다."
        footer={
          <p className="text-[14px] leading-relaxed text-muted">
            회원으로 주문하셨다면{' '}
            <Link href="/mypage/orders" className="link-wine">
              마이페이지 &gt; 주문 내역
            </Link>
            에서 확인해 주세요.
          </p>
        }
      >
        <form onSubmit={submit} className="text-left">
          <div>
            <label htmlFor="lookup-no" className="label-xs block">
              주문번호
            </label>
            <input
              id="lookup-no"
              type="text"
              value={orderNo}
              onChange={(event) => setOrderNo(event.target.value.toUpperCase())}
              placeholder="ORD-20260814-0001"
              className={inputClass}
            />
          </div>

          <div className="mt-5">
            <label htmlFor="lookup-phone" className="label-xs block">
              연락처
            </label>
            <input
              id="lookup-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="010-1234-5678"
              className={inputClass}
            />
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-[15px] leading-relaxed text-wine">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className={`${authButtonClass} mt-7`}>
            {pending ? '조회 중…' : '주문 조회'}
          </button>
        </form>
      </AuthCard>
    );
  }

  /* 조회 결과 — 주문 내역은 넓게 보여 줍니다. */
  return (
    <div className="shell py-14 md:py-20">
      {error ? (
        <p role="alert" className="mb-6 text-[15px] leading-relaxed text-wine">
          {error}
        </p>
      ) : null}

      {cancelDone ? (
        <p
          role="status"
          className="mt-8 border border-stone px-5 py-4 text-[16px] leading-relaxed text-ink"
        >
          취소 요청을 접수했습니다. 확인 후 고객센터에서 연락드리겠습니다.
        </p>
      ) : null}

      {order ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-stone pb-4">
            <div>
              <p className="label-xs">주문번호</p>
              <p className="mt-2 select-all text-[26px] font-semibold tabular-nums tracking-[0.02em] text-ink">
                {order.orderNo}
              </p>
            </div>
            <p className="text-[14px] text-muted">
              {order.createdAt ? new Date(order.createdAt).toLocaleString('ko-KR') : ''}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
            <OrderReceipt order={order} />

            <aside className="lg:sticky lg:top-28 lg:self-start">
              <div className="border border-stone p-6 md:p-8">
                <h3 className="font-serif text-[19px] text-ink">주문 내역</h3>
                <div className="mt-5">
                  <CopyOrderButton text={orderToText(order, storeName)} />
                </div>

                {/* 취소 요청 — 입금대기·결제완료일 때만 */}
                {canRequestCancel(order.status) ? (
                  <div className="mt-6 border-t border-stone pt-6">
                    {cancelOpen ? (
                      <>
                        <label htmlFor="cancel-reason" className="label-xs block">
                          취소 사유
                        </label>
                        <textarea
                          id="cancel-reason"
                          value={cancelReason}
                          onChange={(event) => setCancelReason(event.target.value)}
                          rows={3}
                          placeholder="예: 다른 색상으로 다시 주문하려 합니다."
                          className="mt-2 w-full resize-none border border-stone bg-transparent p-3 text-[15px] leading-relaxed text-ink outline-none focus:border-ink"
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={submitCancel}
                            disabled={pending}
                            className="btn-primary flex-1"
                          >
                            {pending ? '접수 중…' : '요청 보내기'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancelOpen(false)}
                            className="btn-secondary flex-1"
                          >
                            닫기
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setCancelOpen(true)}
                          className="btn-secondary w-full"
                        >
                          주문 취소 요청
                        </button>
                        <p className="mt-3 text-[14px] leading-relaxed text-muted">
                          요청을 보내시면 확인 후 취소 처리해 드립니다. 입금하신 금액이
                          있으면 환불해 드립니다.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  /* ★ 전화 걸기 링크를 카카오톡·1:1 문의로 바꿨습니다. */
                  <div className="mt-6 border-t border-stone pt-6">
                    <p className="text-[14px] leading-relaxed text-muted">
                      이미 상품 준비가 시작되어 이 화면에서는 취소할 수 없습니다.
                      카카오톡이나{' '}
                      <Link href="/inquiry/new" className="link-wine">
                        1:1 문의
                      </Link>
                      로 알려 주시면 확인 후 처리해 드립니다.
                    </p>
                    <KakaoChatButton className="mt-3 w-full" />
                  </div>
                )}

                <p className="mt-6 border-t border-stone pt-5 text-[14px] leading-relaxed text-muted">
                  교환·반품 규정은{' '}
                  <Link href="/guide" className="link-wine">
                    배송·교환·반품 안내
                  </Link>
                  에서 확인하실 수 있습니다.
                </p>
              </div>
            </aside>
          </div>

          <div className="mt-12 border-t border-stone pt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setOrder(null);
                setError('');
                setCancelDone(false);
              }}
              className="text-[15px] text-muted underline underline-offset-4"
            >
              다른 주문 조회하기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
