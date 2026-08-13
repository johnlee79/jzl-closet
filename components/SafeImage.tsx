'use client';

import { useEffect, useState } from 'react';

type SafeImageProps = {
  src: string;
  alt: string;
  label: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
};

/**
 * 이미지 파일이 아직 없을 때 깨진 아이콘 대신
 * stone 배경 + 얇은 선 아이콘 + 상품명을 보여준다.
 */
export default function SafeImage({
  src,
  alt,
  label,
  width,
  height,
  className = '',
  priority = false,
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-3 bg-stone ${className}`}
        role="img"
        aria-label={alt}
      >
        <svg
          width="44"
          height="34"
          viewBox="0 0 44 34"
          fill="none"
          stroke="#6E6A65"
          strokeWidth="1"
          aria-hidden="true"
        >
          <rect x="0.5" y="0.5" width="43" height="33" />
          <circle cx="12" cy="10" r="3.5" />
          <path d="M2 27l11.5-11 8 7.5 7-6.5L42 28" />
        </svg>
        <span className="px-4 text-center font-serif text-[13px] leading-relaxed text-muted">
          {label}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
