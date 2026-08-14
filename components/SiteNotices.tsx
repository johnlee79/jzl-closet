'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import PhonePrompt from '@/components/PhonePrompt';

/**
 * 헤더 아래에 붙는 안내 줄.
 *
 * ★ 로그인 여부를 서버 레이아웃에서 읽지 않고 여기서 물어봅니다.
 *   레이아웃에서 쿠키를 읽으면 프론트 전 페이지가 동적 렌더링으로 바뀌어
 *   상품·카테고리 페이지의 정적 생성(SEO)이 깨지기 때문입니다.
 */
export default function SiteNotices() {
  const pathname = usePathname();
  const [needsPhone, setNeedsPhone] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = (await response.json()) as { needsPhone?: boolean };
        if (alive) setNeedsPhone(Boolean(data.needsPhone));
      } catch {
        if (alive) setNeedsPhone(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pathname]);

  // 연락처를 넣는 화면에서는 굳이 다시 안내하지 않습니다.
  if (!needsPhone || pathname === '/mypage/profile') return null;

  return <PhonePrompt />;
}
