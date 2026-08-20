'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import PhonePrompt from '@/components/PhonePrompt';
import { onProfileUpdated } from '@/lib/profile-events';

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

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = (await response.json()) as { needsPhone?: boolean };
      setNeedsPhone(Boolean(data.needsPhone));
    } catch {
      setNeedsPhone(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [pathname, load]);

  /*
   * ★ 회원정보에서 연락처를 저장하면 곧바로 다시 물어봅니다.
   *
   *   이 배너는 클라이언트 컴포넌트라 router.refresh() 로는 갱신되지 않습니다.
   *   주소가 바뀔 때만 다시 조회하도록 되어 있어서, 연락처를 저장해도
   *   배너는 예전 답(연락처 없음)을 그대로 들고 계속 떠 있었습니다.
   *   저장은 됐는데 배너가 남아 있으니 손님은 저장이 안 된 줄 알았습니다.
   *
   * ★ 다른 탭에서 고쳤을 수도 있으니 화면으로 돌아올 때도 다시 물어봅니다.
   */
  useEffect(() => onProfileUpdated(() => void load()), [load]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('visibilitychange', onFocus);
    return () => window.removeEventListener('visibilitychange', onFocus);
  }, [load]);

  // 연락처를 넣는 화면에서는 굳이 다시 안내하지 않습니다.
  if (!needsPhone || pathname === '/mypage/profile') return null;

  return <PhonePrompt />;
}
