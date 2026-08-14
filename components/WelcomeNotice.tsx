'use client';

import { useEffect, useState } from 'react';

/**
 * 가입 축하 안내 — 마이페이지 첫 방문 때 한 번만 보여 줍니다.
 *
 * ★ "봤는지" 는 브라우저에 남깁니다. 이것 때문에 DB 를 읽거나 쓰지 않습니다.
 * ★ 최근에 가입한 회원에게만 서버가 이 컴포넌트를 렌더합니다.
 */
const STORAGE_KEY = 'jzl-welcome-seen';

export default function WelcomeNotice({ message }: { message: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) !== '1');
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open || !message.trim()) return null;

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* 저장하지 못해도 이번 화면에서는 닫힙니다. */
    }
  };

  return (
    <div className="relative border border-stone bg-paper px-5 py-4 pr-12">
      <p className="text-[15px] leading-relaxed text-ink">{message}</p>
      <button
        type="button"
        onClick={close}
        aria-label="안내 닫기"
        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center text-muted"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" aria-hidden="true">
          <path d="M1 1l10 10M11 1L1 11" />
        </svg>
      </button>
    </div>
  );
}
