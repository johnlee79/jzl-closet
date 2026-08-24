'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSite } from '@/components/SiteProvider';
import { confirmReceiptAction } from '@/app/(shop)/mypage/actions';
import { formatPrice } from '@/lib/product-utils';
import { expectedPurchasePoints } from '@/lib/site-config';
import type { Order } from '@/lib/types';

/**
 * ============================================================
 * 받으셨나요? — [수령 확인]
 * ============================================================
 *
 * ★★ 왜 손님이 직접 누르게 하는가
 *   구매 적립 포인트는 배송완료 시점에 나갑니다. 그런데 배송이 끝나도
 *   상태를 바꿔 주는 사람이 없으면 주문은 계속 배송중이고 포인트도 안 나갑니다.
 *   자동 전환을 기다리면 최대 일주일입니다. 이미 받으신 분은 그동안
 *   "내 포인트는 언제 들어오나" 를 궁금해합니다. 직접 앞당길 길을 둡니다.
 *
 * ★★ 포인트가 언제 나가는지 반드시 함께 적습니다.
 *   버튼만 두면 왜 눌러야 하는지 알 수 없습니다.
 *   누르면 얼마가 지금 들어오는지, 안 눌러도 어떻게 되는지 둘 다 말합니다.
 *
 * ★ 되돌릴 수 없는 동작이라 한 번 더 묻습니다.
 *   배송완료가 되면 취소 요청 경로가 달라집니다. 실수로 눌리면 안 됩니다.
 *   ★ 브라우저 confirm() 을 쓰지 않습니다. 그건 결제창처럼 화면을 통째로
 *     멈추게 하고, 우리 디자인과도 완전히 다릅니다.
 *
 * ★ 배송중일 때만 그립니다. 그 밖의 상태에서는 아무것도 나오지 않습니다.
 * ★ 이모지·그림자를 쓰지 않습니다.
 */
export default function ReceiptConfirm({
  order,
  className = '',
}: {
  order: Order;
  className?: string;
}) {
  const router = useRouter();
  const { points, shipping } = useSite();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  if (order.status !== 'shipping') return null;

  /*
   * ★ 며칠 뒤 자동으로 처리되는지는 관리자 설정에서 읽습니다.
   *   숫자를 화면에 박으면 설정을 바꿨을 때 안내만 옛날 말을 합니다.
   * ★ 0 이면 자동 전환이 꺼진 것이라 그 문장을 아예 하지 않습니다.
   */
  const autoDays = shipping.autoDeliveredDays;
  const autoLine =
    autoDays > 0 ? ` 누르지 않으셔도 ${autoDays}일 뒤 자동으로 처리됩니다.` : '';

  /*
   * 이번 주문으로 들어올 적립 포인트.
   * ★ 서버가 지급할 때 쓰는 기준과 같습니다 —
   *   살아 있는 상품금액 합계에서 사용한 포인트를 뺀 값. (배송비는 빼고 셉니다)
   * ★ 화면에서 계산합니다. 조회를 늘리지 않습니다.
   */
  const base = Math.max(
    0,
    order.items
      .filter((item) => item.itemStatus !== 'cancelled')
      .reduce((sum, item) => sum + item.lineTotal, 0) - order.discount
  );
  // 비회원 주문에는 적립이 없습니다.
  const earn = order.userId ? expectedPurchasePoints(base, points) : 0;

  const confirm = () => {
    setError('');
    startTransition(async () => {
      const result = await confirmReceiptAction(order.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div className={`border border-stone px-5 py-4 ${className}`}>
      <p className="text-[16px] leading-relaxed text-ink">상품을 받으셨나요?</p>

      {earn > 0 ? (
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          확인하시면{' '}
          <strong className="font-semibold text-wine">{formatPrice(earn)}P</strong> 가 바로
          적립됩니다.{autoLine}
        </p>
      ) : (
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {autoLine.trim() || '확인하시면 배송완료로 바뀝니다.'}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
        className="btn-secondary mt-4 min-h-[46px] w-full px-6 py-0 text-[15px] sm:w-auto"
      >
        수령 확인
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-[15px] leading-relaxed text-wine">
          {error}
        </p>
      ) : null}

      {/* ── 한 번 더 확인 ──────────────────────────────── */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="수령 확인"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4 md:items-center"
        >
          <div className="w-full max-w-[380px] border border-stone bg-paper p-6">
            <p className="text-[17px] leading-relaxed text-ink">
              상품을 받으신 것이 맞습니까?
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              배송완료로 바뀌고 되돌릴 수 없습니다.
              {earn > 0 ? ` ${formatPrice(earn)}P 가 바로 적립됩니다.` : ''}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              아직 받지 않으셨다면 누르지 마시고 고객센터로 알려 주세요.
            </p>

            {error ? (
              <p role="alert" className="mt-3 text-[15px] leading-relaxed text-wine">
                {error}
              </p>
            ) : null}

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="btn-secondary min-h-[48px] px-4 py-0 text-[15px]"
              >
                아직이요
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="btn-primary min-h-[48px] px-4 py-0 text-[15px]"
              >
                {pending ? '처리 중…' : '받았습니다'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
