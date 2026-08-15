'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { REF_PARAM, isReferralCode, normalizeReferralCode } from '@/lib/referral-code';

/**
 * 주소에 `?ref=코드` 가 붙어 들어오면 서버에 한 번 알려 줍니다.
 *
 * ★ 화면에는 아무것도 그리지 않습니다.
 *   이 일을 페이지(서버 컴포넌트)에서 하면 주소의 조건을 읽는 순간
 *   그 페이지가 동적 렌더링이 되어 정적 생성이 깨집니다. SEO 가 최우선이라 그럴 수 없습니다.
 *   그래서 브라우저에서 한 번 부르는 방식으로 떼어 냈습니다.
 *
 * ★ 주소에서 ref 를 지우지 않습니다.
 *   지우면 손님이 새로고침했을 때 추천이 사라지고, 주소를 다시 복사해 공유할 때도
 *   코드가 빠집니다. 쿠키에 담기므로 남아 있어도 문제가 없습니다.
 */
export default function ReferralCapture() {
  const params = useSearchParams();
  const pathname = usePathname();
  // 같은 코드로 여러 번 부르지 않도록 기억해 둡니다.
  const sent = useRef('');

  useEffect(() => {
    const code = normalizeReferralCode(params.get(REF_PARAM) ?? '');
    if (!isReferralCode(code)) return;
    if (sent.current === code) return;
    sent.current = code;

    // 실패해도 손님 화면에는 아무 영향이 없어야 합니다. 조용히 넘어갑니다.
    void fetch('/api/referral/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [params, pathname]);

  return null;
}
