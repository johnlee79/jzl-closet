'use client';

import Link from 'next/link';
import { useSite } from '@/components/SiteProvider';
import { formatPrice } from '@/lib/product-utils';

/**
 * 가입하고 N P 받기 — 가입 유도 배지.
 *
 * ★ 금액은 관리자 설정(가입 축하 포인트)을 그대로 씁니다. 하드코딩하지 않습니다.
 *   설정에서 껐거나 0원이면 배지 자체가 나오지 않습니다.
 * ★ 2.5초 주기로 밝기가 서서히 오르내립니다. 깜박임이 아니라 숨쉬기입니다.
 *   급하게 점멸시키면 브랜드 톤이 무너집니다.
 * ★ prefers-reduced-motion 을 켠 분에게는 움직이지 않습니다. (globals.css)
 */
export default function SignupPointBadge({
  href = '/signup',
  className = '',
}: {
  href?: string;
  className?: string;
}) {
  const { points } = useSite();

  const rule = points.signup;
  if (!rule.enabled || rule.amount <= 0) return null;

  return (
    <Link
      href={href}
      className={`jzl-breathe inline-flex min-h-[36px] items-center rounded-full bg-wine px-4 text-[14px] tracking-[0.04em] text-paper ${className}`}
    >
      가입하고 {formatPrice(rule.amount)}P 받기
    </Link>
  );
}
