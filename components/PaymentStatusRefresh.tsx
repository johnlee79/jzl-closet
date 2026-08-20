'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * "결제를 확인하고 있습니다" 상태일 때만 화면을 몇 번 다시 불러옵니다.
 *
 * ★★ 왜 필요한가 (실제로 겪은 일)
 *   카드 결제는 손님이 결제창을 마친 뒤 우리 서버가 KSNET 에 승인을 확인합니다.
 *   그 확인에 1~2초가 걸립니다. 그 사이에 완료 화면이 그려지면 주문이 아직
 *   '결제대기' 라서 손님은 결제가 안 된 줄 압니다.
 *   승인은 이미 났는데 손님이 다시 결제하면 이중결제가 납니다.
 *
 *   그래서 확인 중일 때만 잠깐 기다렸다 다시 읽습니다. 대개 한 번이면 결제완료로 바뀝니다.
 *
 * ★ 몇 번만 시도하고 멈춥니다. 계속 새로고침하면
 *   정말 사람이 확인해야 하는 주문에서 화면이 끝없이 깜빡입니다.
 * ★ 결제완료가 되면 이 컴포넌트는 화면에서 사라지므로 저절로 멈춥니다.
 */
const DELAYS_MS = [2000, 4000, 8000];

export default function PaymentStatusRefresh() {
  const router = useRouter();
  const tries = useRef(0);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    if (tries.current >= DELAYS_MS.length) {
      setWaiting(false);
      return;
    }

    const delay = DELAYS_MS[tries.current];
    tries.current += 1;

    const timer = window.setTimeout(() => {
      // 서버 컴포넌트를 다시 그립니다. 주문 상태를 DB 에서 새로 읽습니다.
      router.refresh();
    }, delay);

    return () => window.clearTimeout(timer);
  });

  return (
    <p className="mt-3 text-[15px] leading-relaxed text-muted">
      {waiting
        ? '결제 결과를 확인하는 중입니다. 이 화면은 자동으로 새로고침됩니다.'
        : '확인이 조금 더 걸리고 있습니다. 주문 조회에서 다시 확인해 주세요.'}
    </p>
  );
}
