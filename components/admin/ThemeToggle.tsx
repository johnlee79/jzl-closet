'use client';

import { useEffect, useState } from 'react';

/**
 * 관리자 다크모드 토글.
 *
 * ★ 기본값은 라이트입니다. 상품 이미지의 색감을 판단해야 하기 때문입니다.
 *   (기기 설정이 다크여도 여기서는 따라가지 않습니다)
 * ★ 고른 값은 이 브라우저에 저장해 다음 접속에도 유지합니다.
 * ★ 고객 화면에는 적용되지 않습니다. html 의 .dark 는 /admin 안에서만 의미가 있습니다.
 *   (app/globals.css 의 .dark .admin-root 규칙)
 */

export const THEME_KEY = 'jzl-admin-theme';

function apply(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved = '';
    try {
      saved = window.localStorage.getItem(THEME_KEY) ?? '';
    } catch {
      /* 저장소가 막혀 있으면 라이트로 갑니다. */
    }
    const next = saved === 'dark';
    setDark(next);
    apply(next);
    setReady(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    apply(next);
    try {
      window.localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      /* 저장하지 못해도 이번 화면에서는 바뀝니다. */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
      title={dark ? '라이트 모드' : '다크 모드'}
      className="admin-btn h-[38px] w-[38px] shrink-0 px-0"
    >
      {/* 화면이 준비되기 전에는 아이콘을 그리지 않습니다. (깜박임 방지) */}
      {!ready ? null : dark ? (
        // 해 — 누르면 라이트로
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="9" cy="9" r="3.4" />
          <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.4 3.4l1.4 1.4M13.2 13.2l1.4 1.4M14.6 3.4l-1.4 1.4M4.8 13.2l-1.4 1.4" />
        </svg>
      ) : (
        // 달 — 누르면 다크로
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M15.2 11.1A6.6 6.6 0 016.9 2.8a6.6 6.6 0 108.3 8.3z" />
        </svg>
      )}
    </button>
  );
}
