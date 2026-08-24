'use client';

import { usePathname } from 'next/navigation';
import PhonePrompt from '@/components/PhonePrompt';
import { useMember } from '@/lib/member';

/**
 * 헤더 아래에 붙는 안내 줄.
 *
 * ★ 로그인 여부를 서버 레이아웃에서 읽지 않습니다.
 *   레이아웃에서 쿠키를 읽으면 프론트 전 페이지가 동적 렌더링으로 바뀌어
 *   상품·카테고리 페이지의 정적 생성(SEO)이 깨지기 때문입니다.
 *
 * ★★ 언제 다시 물어보는지는 여기서 정하지 않습니다.
 *   MemberSync 한 곳에서 정하고 lib/member.ts 가 답을 나눠 줍니다.
 *   예전에는 이 화면이 직접 물었고, 헤더도 따로 물었고, 상품 화면도 따로
 *   물었습니다. 같은 답을 여러 번 받으면서 서로 다른 순간에 갱신됐습니다.
 *
 * ★ 연락처를 저장한 직후에도 바로 사라져야 합니다.
 *   그 신호(profile-updated) 역시 MemberSync 가 받습니다.
 *   저장은 됐는데 배너가 남아 있으면 손님은 저장이 안 된 줄 압니다.
 */
export default function SiteNotices() {
  const pathname = usePathname();
  const member = useMember();

  // 아직 모르는 동안에는 그리지 않습니다. 연락처를 넣는 화면에서도 안 그립니다.
  if (!member?.needsPhone || pathname === '/mypage/profile') return null;

  return <PhonePrompt />;
}
