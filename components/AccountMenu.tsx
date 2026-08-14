'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { logoutAction } from '@/app/(shop)/auth-actions';

/**
 * 헤더의 로그인·마이페이지 영역.
 *
 * ★ 로그인 여부를 서버 레이아웃이 아니라 여기서 물어봅니다.
 *   레이아웃에서 쿠키를 읽으면 프론트 전 페이지가 동적 렌더링으로 바뀌어
 *   상품·카테고리 페이지의 정적 생성(SEO)이 깨지기 때문입니다.
 *   확인 전에는 아무것도 그리지 않아 화면이 덜컥거리지 않게 합니다.
 */
export default function AccountMenu({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [ready, setReady] = useState(false);

  // 화면을 옮길 때마다 다시 확인합니다. (로그인·로그아웃 직후 바로 반영되도록)
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = (await response.json()) as { name?: string };
        if (alive) setName(data.name ?? '');
      } catch {
        if (alive) setName('');
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pathname]);

  const logout = () => {
    startTransition(async () => {
      await logoutAction();
      setName('');
      router.replace('/');
      router.refresh();
    });
  };

  if (variant === 'mobile') {
    if (!ready) return null;

    return (
      <ul className="mt-4 border-t border-stone">
        {name ? (
          <>
            <li className="border-b border-stone py-4 text-[15px] text-muted">
              <strong className="text-ink">{name}</strong>님
            </li>
            <li className="border-b border-stone">
              <Link href="/mypage" className="block py-4 text-[16px] text-ink">
                마이페이지
              </Link>
            </li>
            <li className="border-b border-stone">
              <button
                type="button"
                onClick={logout}
                disabled={pending}
                className="block w-full py-4 text-left text-[16px] text-ink"
              >
                {pending ? '로그아웃 중…' : '로그아웃'}
              </button>
            </li>
          </>
        ) : (
          <>
            <li className="border-b border-stone">
              <Link href="/login" className="block py-4 text-[16px] text-ink">
                로그인
              </Link>
            </li>
            <li className="border-b border-stone">
              <Link href="/signup" className="block py-4 text-[16px] text-ink">
                회원가입
              </Link>
            </li>
          </>
        )}
      </ul>
    );
  }

  // 확인 전에는 자리만 잡아 둡니다. (레이아웃이 흔들리지 않게)
  if (!ready) {
    return <div aria-hidden="true" className="hidden h-5 w-[110px] lg:block" />;
  }

  if (name) {
    return (
      <div className="hidden items-center gap-4 lg:flex">
        <Link
          href="/mypage"
          className="max-w-[120px] truncate text-[13px] tracking-[0.14em] text-ink transition-opacity duration-200 hover:opacity-60"
        >
          {name}님
        </Link>
        <button
          type="button"
          onClick={logout}
          disabled={pending}
          className="shrink-0 text-[13px] tracking-[0.14em] text-muted transition-opacity duration-200 hover:opacity-60"
        >
          {pending ? '…' : '로그아웃'}
        </button>
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-4 lg:flex">
      <Link
        href="/login"
        className="text-[13px] tracking-[0.14em] text-muted transition-opacity duration-200 hover:opacity-60"
      >
        로그인
      </Link>
      <Link
        href="/signup"
        className="text-[13px] tracking-[0.14em] text-muted transition-opacity duration-200 hover:opacity-60"
      >
        회원가입
      </Link>
    </div>
  );
}
