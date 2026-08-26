'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * 연락처 입력 안내 배너.
 *
 * ★ 구글 로그인은 연락처를 주지 않습니다. 주문할 때는 꼭 필요하므로
 *   profiles.phone 이 비어 있는 동안 안내를 띄웁니다.
 *
 * ★ 닫을 수 있게 하되, 연락처를 넣을 때까지 다시 나타납니다.
 *   닫음 표시는 sessionStorage 에만 남겨 이번 방문에서만 숨깁니다.
 *   (localStorage 에 남기면 영영 다시 안 보여 안내가 의미를 잃습니다)
 */
/*
 * ** 두 가지 안내를 이 컴포넌트 하나가 그립니다. (2026-08-26)
 *   phone 연락처가 비어 있음
 *   name  이름이 아직 소셜 닉네임 그대로임 (입금자명이 통장과 달라집니다)
 *
 * * 닫음 표시는 따로 둡니다. 하나를 닫았다고 다른 하나까지 숨으면
 *   안 됩니다. 서로 다른 이야기입니다.
 */
const DISMISS_KEY: Record<'phone' | 'name', string> = {
  phone: 'jzl-phone-prompt-dismissed',
  name: 'jzl-realname-prompt-dismissed',
};

const TEXT: Record<'phone' | 'name', { title: string; detail: string; action: string }> = {
  phone: {
    title: '주문을 위해 연락처를 입력해 주세요.',
    detail: '배송 안내와 주문 확인 문자를 받으실 번호입니다.',
    action: '입력하기',
  },
  name: {
    title: '주문하시기 전에 이름을 실명으로 확인해 주세요.',
    detail: '입금자명과 배송에 쓰입니다. 통장에 찍히는 이름으로 적어 주세요.',
    action: '확인하기',
  },
};

export default function PhonePrompt({
  /** 헤더 바로 아래에 붙이는 얇은 형태 */
  variant = 'banner',
  /** 무엇을 안내하는지 */
  kind = 'phone',
}: {
  variant?: 'banner' | 'inline';
  kind?: 'phone' | 'name';
}) {
  const [show, setShow] = useState(false);
  const text = TEXT[kind];
  const key = DISMISS_KEY[kind];

  useEffect(() => {
    try {
      setShow(window.sessionStorage.getItem(key) !== '1');
    } catch {
      setShow(true);
    }
  }, [key]);

  const dismiss = () => {
    setShow(false);
    try {
      window.sessionStorage.setItem(key, '1');
    } catch {
      // 저장 공간이 없으면 이번 화면에서만 숨깁니다.
    }
  };

  if (!show) return null;

  if (variant === 'inline') {
    return (
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-stone bg-stone/20 px-5 py-4">
        <p className="text-[16px] leading-relaxed text-ink">
          {text.title}
          <span className="mt-1 block text-[14px] text-muted">{text.detail}</span>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/mypage/profile"
            className="inline-flex min-h-[44px] items-center border border-ink px-5 text-[15px] text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            {text.action}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="안내 닫기"
            className="text-[14px] text-muted underline underline-offset-4"
          >
            나중에
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-stone bg-stone/25">
      <div className="shell flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-[15px] leading-relaxed text-ink">{text.title}</p>
        <div className="flex shrink-0 items-center gap-4">
          <Link href="/mypage/profile" className="link-wine text-[15px]">
            {text.action}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="안내 닫기"
            className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:text-ink"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" aria-hidden="true">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
