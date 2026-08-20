'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';

export default function CartBadge() {
  const { count, ready } = useCart();

  return (
    <Link
      href="/order"
      className="relative inline-flex items-center gap-2 text-[14px] tracking-[0.14em] text-ink"
      aria-label={`장바구니 (${ready ? count : 0}개 담김)`}
    >
      <svg
        width="18"
        height="19"
        viewBox="0 0 18 19"
        fill="none"
        stroke="#14141A"
        strokeWidth="1"
        aria-hidden="true"
      >
        <path d="M1 5.5h16l-1.2 12.5H2.2L1 5.5z" />
        <path d="M6 5.5V4a3 3 0 016 0v1.5" />
      </svg>
      <span className="hidden sm:inline">CART</span>
      {ready && count > 0 ? (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-wine px-1 text-[13px] leading-none text-paper">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
