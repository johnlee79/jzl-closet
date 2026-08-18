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
 *   확인 전에는 자리만 잡아 두어 화면이 덜컥거리지 않게 합니다.
 *
 * variant
 *   desktop  — 버튼 두 개 (로그인 / 회원가입)
 *   mobile   — 헤더 오른쪽에 버튼 하나만. 좁은 화면이라 회원가입은 넣지 않습니다.
 *   drawer   — 햄버거 메뉴 안쪽
 */
type Variant = 'desktop' | 'mobile' | 'drawer';

/** 사람 모양 아이콘 — 로그인 상태의 모바일 헤더에 씁니다. */
function PersonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <circle cx="9" cy="5.5" r="3.2" />
      <path d="M2.5 16c0-3.2 2.9-5.3 6.5-5.3s6.5 2.1 6.5 5.3" />
    </svg>
  );
}

/** 34px 높이의 테두리 버튼 (로그인·마이페이지) */
const OUTLINE_BUTTON =
  'inline-flex h-[34px] items-center justify-center rounded-sm border border-ink px-4 text-[13px] tracking-[0.1em] text-ink transition-colors duration-200 hover:bg-ink hover:text-paper';

/** 34px 높이의 채운 버튼 (회원가입) */
const FILLED_BUTTON =
  'inline-flex h-[34px] items-center justify-center rounded-sm bg-ink px-4 text-[13px] tracking-[0.1em] text-paper transition-opacity duration-200 hover:opacity-80';

export default function AccountMenu({ variant = 'desktop' }: { variant?: Variant }) {
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

  /* ── 햄버거 메뉴 안쪽 ─────────────────────────────── */
  if (variant === 'drawer') {
    if (!ready) return null;

    // 비로그인이면 메뉴 맨 위에 버튼 두 개를 크게 둡니다.
    if (!name) {
      return (
        <div className="flex gap-2">
          <Link
            href="/login"
            className="inline-flex min-h-[52px] flex-1 items-center justify-center rounded-sm border border-ink text-[15px] tracking-[0.14em] text-ink"
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-[52px] flex-1 items-center justify-center rounded-sm bg-ink text-[15px] tracking-[0.14em] text-paper"
          >
            회원가입
          </Link>
        </div>
      );
    }

    return (
      <div>
        <p className="text-[15px] text-muted">
          <strong className="text-ink">{name}</strong>님
        </p>
        <ul className="mt-3 border-t border-stone">
          <li className="border-b border-stone">
            <Link href="/mypage" className="block py-4 text-[16px] text-ink">
              마이페이지
            </Link>
          </li>
          <li className="border-b border-stone">
            <Link href="/mypage/orders" className="block py-4 text-[16px] text-ink">
              주문 내역
            </Link>
          </li>
          <li className="border-b border-stone">
            <Link href="/mypage/inquiries" className="block py-4 text-[16px] text-ink">
              문의 내역
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
        </ul>
      </div>
    );
  }

  /* ── 모바일·태블릿 헤더 ───────────────────────────── */
  if (variant === 'mobile') {
    // 자리를 미리 잡아 오른쪽 묶음이 흔들리지 않게 합니다.
    // ★ 로고는 절대 위치로 정중앙에 고정되어 있어 이 폭에 영향받지 않습니다.
    if (!ready) {
      return <span aria-hidden="true" className="hidden h-[36px] w-[56px] md:block" />;
    }

    if (name) {
      return (
        <Link
          href="/mypage"
          aria-label={`${name}님 마이페이지`}
          className="flex h-11 w-11 items-center justify-center text-ink"
        >
          <PersonIcon />
        </Link>
      );
    }

    /*
     * 비로그인 — 로그인 버튼.
     *
     * ★ 모바일(md 미만)에서는 그리지 않습니다.
     *   햄버거 메뉴 맨 위에 로그인·회원가입 버튼이 이미 크게 들어 있어,
     *   상단바에까지 두면 같은 버튼이 한 화면에 두 번 나옵니다.
     *   빠진 자리는 로고가 정중앙으로 오는 데 쓰입니다.
     * ★ 태블릿(md~lg)에는 햄버거가 없어 메뉴 안쪽 버튼도 없습니다. 여기서는 남깁니다.
     */
    return (
      <Link
        href="/login"
        className="hidden h-[36px] min-h-[36px] items-center justify-center rounded-sm border border-ink px-3.5 text-[13px] tracking-[0.06em] text-ink md:inline-flex"
      >
        로그인
      </Link>
    );
  }

  /* ── 데스크탑 헤더 ────────────────────────────────── */
  // 확인 전에는 같은 크기의 빈 자리를 둡니다.
  if (!ready) {
    return <span aria-hidden="true" className="hidden h-[34px] w-[152px] lg:block" />;
  }

  if (name) {
    return (
      <div className="hidden items-center gap-3 lg:flex">
        <Link href="/mypage" className={OUTLINE_BUTTON}>
          마이페이지
        </Link>
        <button
          type="button"
          onClick={logout}
          disabled={pending}
          className="shrink-0 text-[13px] tracking-[0.1em] text-muted transition-opacity duration-200 hover:opacity-60"
        >
          {pending ? '…' : '로그아웃'}
        </button>
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-2 lg:flex">
      <Link href="/login" className={OUTLINE_BUTTON}>
        로그인
      </Link>
      <Link href="/signup" className={FILLED_BUTTON}>
        회원가입
      </Link>
    </div>
  );
}
