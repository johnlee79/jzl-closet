'use client';

import { formatPrice } from '@/lib/product-utils';
import type { CartLive } from '@/lib/cart-live';

/**
 * 장바구니에 담아 둔 뒤 달라진 것을 알립니다.
 * 장바구니 화면과 주문서가 같은 문구를 씁니다.
 *
 * ★ 세 가지를 서로 다른 무게로 다룹니다.
 *   값이 오름  — 손님이 [확인했습니다] 를 눌러야 주문으로 넘어갑니다
 *   값이 내림  — 알려만 줍니다
 *   못 삼      — 알려 주고 주문에서만 뺍니다. 장바구니에는 그대로 둡니다
 *
 * ★ 값을 못 받은 경우도 여기서 알립니다. 그때는 주문 버튼이 잠겨 있습니다.
 */
export default function CartChangeNotice({ live }: { live: CartLive }) {
  const { status, raised, lowered, blocked, acknowledge } = live;

  if (status === 'failed') {
    return (
      <div
        role="alert"
        className="mb-8 border border-wine bg-wine/5 px-5 py-4 text-[16px] leading-relaxed text-wine"
      >
        <p className="font-medium">가격을 확인하지 못했습니다.</p>
        <p className="mt-1.5 text-[15px]">
          지금 보이는 금액은 담으실 때의 금액이라 실제와 다를 수 있습니다. 새로고침해
          주세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-secondary mt-4 min-h-[44px] px-5 py-0 text-[15px]"
        >
          새로고침
        </button>
      </div>
    );
  }

  if (raised.length === 0 && lowered.length === 0 && blocked.length === 0) return null;

  return (
    <div className="mb-8 flex flex-col gap-4">
      {/* ── 값이 오른 상품 — 확인해야 넘어갑니다 ────────── */}
      {raised.length > 0 ? (
        <div
          role="alert"
          className="border border-wine bg-wine/5 px-5 py-4 text-[16px] leading-relaxed text-wine"
        >
          <p className="font-medium">담아 두신 뒤 값이 오른 상품이 있습니다.</p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[15px]">
            {raised.map((change) => (
              <li key={change.key}>
                · {change.name} — {formatPrice(change.before)}원에서{' '}
                <strong className="font-semibold">{formatPrice(change.after)}원</strong>으로
                올랐습니다
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[15px]">
            바뀐 금액으로 주문하시려면 아래를 눌러 주세요. 원하지 않으시면 장바구니에서
            빼실 수 있습니다.
          </p>
          <button
            type="button"
            onClick={acknowledge}
            className="btn-primary mt-4 min-h-[44px] px-6 py-0 text-[15px]"
          >
            확인했습니다
          </button>
        </div>
      ) : null}

      {/* ── 값이 내린 상품 — 알림만 ──────────────────── */}
      {lowered.length > 0 ? (
        <div className="border border-stone px-5 py-4 text-[16px] leading-relaxed text-ink">
          <p className="font-medium">담아 두신 뒤 값이 내린 상품이 있습니다.</p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[15px] text-muted">
            {lowered.map((change) => (
              <li key={change.key}>
                · {change.name} — {formatPrice(change.before)}원에서{' '}
                <strong className="font-semibold text-wine">
                  {formatPrice(change.after)}원
                </strong>
                으로 내렸습니다
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── 못 사게 된 상품 ─────────────────────────── */}
      {blocked.length > 0 ? (
        <div className="border border-stone px-5 py-4 text-[16px] leading-relaxed text-ink">
          <p className="font-medium">지금 주문할 수 없는 상품이 있습니다.</p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[15px] text-muted">
            {blocked.map((line) => (
              <li key={line.key}>
                · {line.name} — {line.reason}
              </li>
            ))}
          </ul>
          {/* ★ 장바구니에서 빼지 않습니다. 손님이 담아 둔 것을 우리가 지우지 않습니다. */}
          <p className="mt-3 text-[15px] text-muted">
            장바구니에는 그대로 두었습니다. 이번 주문에서만 빠집니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
