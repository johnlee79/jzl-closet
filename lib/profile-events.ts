'use client';

/**
 * 회원 정보가 바뀌었다고 알리는 신호.
 *
 * ★ 왜 필요한가 (실제로 겪은 문제)
 *   "주문을 위해 연락처를 입력해 주세요" 배너는 헤더에 붙어 있고,
 *   /api/auth/me 를 불러 연락처가 비었는지 판단합니다.
 *   그런데 그 조회는 주소(pathname)가 바뀔 때만 다시 돕니다.
 *   그래서 회원정보 화면에서 연락처를 저장해도 배너를 띄운 쪽은 그 사실을
 *   모른 채 예전 답(연락처 없음)을 그대로 들고 있었습니다.
 *   저장은 정상적으로 됐는데 배너만 계속 떠 있어, 손님은 저장이 안 된 줄 압니다.
 *
 *   router.refresh() 로는 해결되지 않습니다. 그건 서버 컴포넌트를 다시 그릴 뿐이고,
 *   배너는 클라이언트 컴포넌트라 자기 상태를 그대로 들고 있습니다.
 *
 * ★ 그래서 저장한 쪽이 "바뀌었다" 고 알리고, 그 신호를 듣고 다시 물어봅니다.
 *   지금은 MemberSync 한 곳이 듣고, lib/member.ts 가 답을 모두에게 나눠 줍니다.
 */

const EVENT = 'jzl:profile-updated';

/** 회원 정보를 저장한 뒤 부릅니다. */
export function notifyProfileUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
}

/** 신호를 듣습니다. 정리 함수를 돌려주므로 useEffect 에서 그대로 반환하세요. */
export function onProfileUpdated(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
