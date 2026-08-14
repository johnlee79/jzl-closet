'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * 화면 맨 위 띠배너.
 *
 * ★ 노출 기간 판단은 서버에서 이미 끝냈습니다. 여기서는 그리기만 합니다.
 * ★ 손님이 닫으면 그 브라우저에서는 같은 문구로 다시 뜨지 않습니다.
 *   (문구를 바꾸면 다시 뜹니다 — 새 소식이니까요)
 */

const STORAGE_KEY = 'jzl-ribbon-closed';

const TONE_CLASS: Record<string, string> = {
  ink: 'bg-ink text-paper',
  wine: 'bg-wine text-paper',
  stone: 'bg-stone text-ink',
};

/** 문구가 바뀌었는지 알아보기 위한 아주 짧은 지문 */
function fingerprint(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}

export default function TopRibbon({
  text,
  linkUrl,
  tone,
}: {
  text: string;
  linkUrl: string;
  tone: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) !== fingerprint(text));
    } catch {
      setOpen(true);
    }
  }, [text]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, fingerprint(text));
    } catch {
      /* 저장하지 못해도 이번 화면에서는 닫힙니다. */
    }
  };

  const body = <span className="text-[13px] tracking-[0.06em]">{text}</span>;

  return (
    <div className={`relative ${TONE_CLASS[tone] ?? TONE_CLASS.ink}`}>
      <div className="shell flex min-h-[40px] items-center justify-center py-2 pr-10 text-center">
        {linkUrl ? (
          <Link href={linkUrl} className="underline-offset-4 hover:underline">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="띠배너 닫기"
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" aria-hidden="true">
          <path d="M1 1l10 10M11 1L1 11" />
        </svg>
      </button>
    </div>
  );
}
