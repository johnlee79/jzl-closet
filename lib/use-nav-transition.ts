'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * 목록 화면의 필터·검색을 옮길 때 쓰는 이동 도우미.
 *
 * ★ startTransition 으로 감싸면 새 데이터가 올 때까지 지금 보고 있는 표가 그대로 남습니다.
 *   그냥 router.push 를 하면 화면이 비었다가 다시 채워져 훨씬 느리게 느껴집니다.
 *   (loading.tsx 스켈레톤은 화면에 처음 들어올 때만 나오면 충분합니다)
 *
 * ★ pending 을 받아 "불러오는 중" 표시를 붙이고 버튼을 잠글 수 있습니다.
 */
export function useNavTransition(): {
  pending: boolean;
  go: (href: string) => void;
} {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return { pending, go };
}
