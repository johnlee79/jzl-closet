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
const DISMISS_KEY = 'jzl-phone-prompt-dismissed';

export default function PhonePrompt({
  /** 헤더 바로 아래에 붙이는 얇은 형태 */
  variant = 'banner',
}: {
  variant?: 'banner' | 'inline';
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(window.sessionStorage.getItem(DISMISS_KEY) !== '1');
    } catch {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // 저장 공간이 없으면 이번 화면에서만 숨깁니다.
    }
  };

  if (!show) return null;

  if (variant === 'inline') {
    return (
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-stone bg-stone/20 px-5 py-4">
        <p className="text-[15px] leading-relaxed text-ink">
          주문을 위해 연락처를 입력해 주세요.
          <span className="mt-1 block text-[13px] text-muted">
            배송 안내와 주문 확인 문자를 받으실 번호입니다.
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/mypage/profile"
            className="inline-flex min-h-[44px] items-center border border-ink px-5 text-[14px] text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            입력하기
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="안내 닫기"
            className="text-[13px] text-muted underline underline-offset-4"
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
        <p className="text-[14px] leading-relaxed text-ink">
          주문을 위해 연락처를 입력해 주세요.
        </p>
        <div className="flex shrink-0 items-center gap-4">
          <Link href="/mypage/profile" className="link-wine text-[14px]">
            입력하기
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
