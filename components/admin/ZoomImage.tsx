'use client';

import { useState } from 'react';

/**
 * 작은 썸네일 — 누르면 전체화면 확대 (사진 비교용).
 *
 * ★ 매칭 화면이 작은 사진으로 구분이 안 되어 넣었습니다 (사장님 지시 2026-10-06).
 *   오버레이 클릭 또는 Escape 로 닫힙니다.
 */
export default function ZoomImage({
  src,
  alt = '',
  className = '',
  thumbClassName = '',
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  thumbClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!src) {
    return <div className={`bg-slate-100 ${thumbClassName || className}`} />;
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`block overflow-hidden ${className}`}
        aria-label="사진 크게 보기"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={`h-full w-full object-cover ${thumbClassName}`}
          loading="lazy"
        />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="확대된 사진"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded bg-white/90 px-3 py-1.5 text-[14px] font-medium text-slate-900 hover:bg-white"
          >
            닫기
          </button>
        </div>
      ) : null}
    </>
  );
}
