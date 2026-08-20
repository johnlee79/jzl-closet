'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Banner } from '@/lib/site-config';

/**
 * 메인 배너 슬라이드.
 *
 * - 배너가 1개면 슬라이드하지 않습니다. (점·화살표도 그리지 않습니다)
 * - 자동 간격은 관리자에서 정합니다. 기본 5초 — 배너는 천천히 넘어가야 읽힙니다.
 * - 모바일 이미지를 따로 올렸으면 <picture> 로 갈라 씁니다.
 * - 마우스를 올리거나 포커스가 들어오면 잠시 멈춥니다.
 */
export default function MainBanner({
  banners,
  interval,
}: {
  banners: Banner[];
  interval: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slideable = banners.length > 1;

  useEffect(() => {
    if (!slideable || paused) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % banners.length);
    }, interval);
    return () => window.clearInterval(timer);
  }, [slideable, paused, interval, banners.length]);

  if (banners.length === 0) return null;

  return (
    <div
      className="relative overflow-hidden bg-stone"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription={slideable ? 'carousel' : undefined}
      aria-label={slideable ? '메인 배너' : undefined}
    >
      {banners.map((banner, position) => {
        const active = position === index;
        const content = (
          <>
            <picture>
              {banner.mobileImageUrl ? (
                <source media="(max-width: 767px)" srcSet={banner.mobileImageUrl} />
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={banner.imageUrl}
                alt={banner.title || '메인 배너'}
                loading={position === 0 ? 'eager' : 'lazy'}
                className="h-full w-full object-cover"
              />
            </picture>

            {banner.title || banner.subtitle || banner.buttonText ? (
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/45 via-black/10 to-transparent">
                <div className="shell pb-10 md:pb-16">
                  {banner.subtitle ? (
                    <p className="text-[14px] tracking-[0.22em] text-white/85">
                      {banner.subtitle}
                    </p>
                  ) : null}
                  {banner.title ? (
                    <p className="mt-2 font-serif text-[26px] leading-snug text-white md:text-[36px]">
                      {banner.title}
                    </p>
                  ) : null}
                  {banner.buttonText ? (
                    <span className="mt-5 inline-flex min-h-[48px] items-center border border-white px-8 text-[15px] tracking-[0.14em] text-white">
                      {banner.buttonText}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        );

        return (
          <div
            key={banner.id}
            aria-hidden={!active}
            className={`${
              position === 0 ? 'relative' : 'absolute inset-0'
            } aspect-[4/5] w-full transition-opacity duration-700 md:aspect-[21/9] ${
              active ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            {banner.link ? (
              <Link href={banner.link} className="block h-full w-full" tabIndex={active ? 0 : -1}>
                {content}
              </Link>
            ) : (
              content
            )}
          </div>
        );
      })}

      {slideable ? (
        <>
          <button
            type="button"
            aria-label="이전 배너"
            onClick={() =>
              setIndex((prev) => (prev - 1 + banners.length) % banners.length)
            }
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/70 text-ink transition-colors hover:bg-white md:left-4"
          >
            <svg width="9" height="16" viewBox="0 0 9 16" stroke="currentColor" fill="none" aria-hidden="true">
              <path d="M8 1L1 8l7 7" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="다음 배너"
            onClick={() => setIndex((prev) => (prev + 1) % banners.length)}
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/70 text-ink transition-colors hover:bg-white md:right-4"
          >
            <svg width="9" height="16" viewBox="0 0 9 16" stroke="currentColor" fill="none" aria-hidden="true">
              <path d="M1 1l7 7-7 7" />
            </svg>
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {banners.map((banner, position) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`${position + 1}번째 배너로 이동`}
                aria-current={position === index ? 'true' : undefined}
                onClick={() => setIndex(position)}
                className={`h-2 rounded-full transition-all ${
                  position === index ? 'w-6 bg-white' : 'w-2 bg-white/60'
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
