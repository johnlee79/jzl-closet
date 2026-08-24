'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { refreshMember } from '@/lib/member';
import { onProfileUpdated } from '@/lib/profile-events';

/**
 * 로그인 상태를 언제 다시 물어볼지 정하는 곳.
 *
 * ★★ 화면마다 따로 정하지 않습니다.
 *   예전에는 헤더는 주소가 바뀔 때, 연락처 안내 띠는 주소가 바뀔 때와
 *   화면으로 돌아올 때, 나머지는 처음 한 번만 물어봤습니다.
 *   그래서 같은 순간에 서로 다른 답을 들고 있는 일이 생겼습니다.
 *   이제 여기 한 곳에서 정하고, 결과는 lib/member.ts 가 모두에게 나눠 줍니다.
 *
 * ★ 아무것도 그리지 않습니다. 언제 다시 묻는지만 정합니다.
 */
export default function MemberSync() {
  const pathname = usePathname();

  /*
   * ★ 화면을 옮길 때마다 다시 확인합니다.
   *   로그인·로그아웃 직후에 바로 반영되어야 합니다.
   *   다시 묻는 동안에도 이전 답을 그대로 들고 있어 깜빡이지 않습니다.
   */
  useEffect(() => {
    refreshMember();
  }, [pathname]);

  /*
   * ★ 회원정보에서 연락처를 저장하면 곧바로 다시 물어봅니다.
   *   저장은 됐는데 "연락처를 입력해 주세요" 배너가 그대로 남아 있으면
   *   손님은 저장이 안 된 줄 압니다. (lib/profile-events.ts 의 긴 설명 참고)
   */
  useEffect(() => onProfileUpdated(() => refreshMember()), []);

  /*
   * ★ 다른 탭에서 로그인하거나 정보를 고쳤을 수 있습니다.
   *   이 탭으로 돌아올 때 한 번 확인합니다.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshMember();
    };
    window.addEventListener('visibilitychange', onVisible);
    return () => window.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
