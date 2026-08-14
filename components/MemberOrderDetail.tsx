'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import CopyOrderButton from '@/components/CopyOrderButton';
import OrderReceipt, { orderToText } from '@/components/OrderReceipt';
import { memberCancelRequestAction } from '@/app/(shop)/mypage/actions';
import { canRequestCancel } from '@/lib/order-status';
import type { Order } from '@/lib/types';

/** 마이페이지 주문 상세 — 비회원 주문 조회와 같은 정보를 보여 줍니다. */
export default function MemberOrderDetail({
  order,
  storeName,
  storePhone,
}: {
  order: Order;
  storeName: string;
  storePhone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = () => {
    if (pending) return;
    setError('');
    startTransition(async () => {
      const result = await memberCancelRequestAction(order.id, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setDone(true);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-stone pb-4">
        <div>
          <p className="label-xs">주문번호</p>
          <p className="mt-2 font-display text-[22px] tracking-[0.12em] text-ink">
            {order.orderNo}
          </p>
        </div>
        <Link
          href="/mypage/orders"
          className="text-[14px] text-muted underline underline-offset-4"
        >
          목록으로
        </Link>
      </div>

      {done ? (
        <p
          role="status"
          className="mt-6 border border-stone px-5 py-4 text-[15px] leading-relaxed text-ink"
        >
          취소 요청을 접수했습니다. 확인 후 고객센터에서 연락드리겠습니다.
        </p>
      ) : null}

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_300px] lg:gap-16">
        <OrderReceipt order={order} />

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border border-stone p-6">
            <h2 className="font-serif text-[17px] text-ink">주문 내역</h2>
            <div className="mt-4">
              <CopyOrderButton text={orderToText(order, storeName)} />
            </div>

            {canRequestCancel(order.status) ? (
              <div className="mt-6 border-t border-stone pt-6">
                {open ? (
                  <>
                    <label htmlFor="cancel-reason" className="label-xs block">
                      취소 사유
                    </label>
                    <textarea
                      id="cancel-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      placeholder="예: 다른 색상으로 다시 주문하려 합니다."
                      className="mt-2 w-full resize-none border border-stone bg-transparent p-3 text-[14px] leading-relaxed text-ink outline-none focus:border-ink"
                    />
                    {error ? (
                      <p className="mt-2 text-[13px] text-wine">{error}</p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={submit}
                        disabled={pending}
                        className="btn-primary flex-1"
                      >
                        {pending ? '접수 중…' : '요청 보내기'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
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
                      onClick={() => setOpen(true)}
                      className="btn-secondary w-full"
                    >
                      주문 취소 요청
                    </button>
                    <p className="mt-3 text-[13px] leading-relaxed text-muted">
                      요청을 보내시면 확인 후 취소 처리해 드립니다.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-6 border-t border-stone pt-6 text-[13px] leading-relaxed text-muted">
                이미 상품 준비가 시작되어 이 화면에서는 취소할 수 없습니다. 고객센터{' '}
                <a href={`tel:${storePhone}`} className="link-wine">
                  {storePhone}
                </a>
                로 문의해 주세요.
              </p>
            )}

            <p className="mt-6 border-t border-stone pt-5 text-[13px] leading-relaxed text-muted">
              이 주문에 대해 물어보실 것이 있으면{' '}
              <Link href={`/inquiry/new?order=${order.id}`} className="link-wine">
                1:1 문의
              </Link>
              를 남겨 주세요.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
