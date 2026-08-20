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
  /**
   * 이미지를 어떻게 채울지.
   *   cover    틀에 꽉 채우고 넘치는 부분을 자릅니다 (상품 썸네일·갤러리)
   *   contain  틀 안에 전부 들어오게 줄입니다 (잘리면 안 되는 미리보기)
   *   natural  틀을 두지 않고 원본 비율 그대로 폭에 맞춥니다 (상세설명 세로 이미지)
   */
  fit?: 'cover' | 'contain' | 'natural';
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
  fit = 'cover',
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
        <span className="px-4 text-center text-[14px] leading-relaxed text-muted">
          {label}
        </span>
      </div>
    );
  }

  // ★ natural 은 틀을 두지 않습니다.
  //   상세설명 이미지는 세로로 아주 긴 경우가 많아 비율을 미리 정해 두면 잘립니다.
  //   대신 원본 크기를 알고 있으면 width/height 를 넘겨 자리를 미리 잡아 둡니다.
  //   (모르면 넘기지 않습니다. 엉뚱한 비율을 넘기면 오히려 더 밀립니다)
  const knowsSize = width > 0 && height > 0;
  const fitClass =
    fit === 'natural'
      ? 'block h-auto w-full'
      : fit === 'contain'
        ? 'h-full w-full object-contain'
        : 'h-full w-full object-cover';

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      {...(fit === 'natural' && !knowsSize ? {} : { width, height })}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`${fitClass} ${className}`}
    />
  );
}
