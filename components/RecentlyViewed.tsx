'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import SafeImage from '@/components/SafeImage';
import { useSite } from '@/components/SiteProvider';
import { brandLabel as findBrandLabel } from '@/lib/brands';
import { formatPrice } from '@/lib/product-utils';
import {
  RECENT_CHANGED,
  clearRecent,
  readRecent,
  removeRecent,
  type RecentItem,
} from '@/lib/recently-viewed';

/**
 * ============================================================
 * 최근 본 상품 (3-H C-1)
 * ============================================================
 *
 * 세 곳에서 같은 컴포넌트를 씁니다.
 *   1) 상품 상세 맨 아래 — '함께 보면 좋은 상품' 다음
 *   2) 메인 맨 아래
 *   3) 장바구니가 비어 있을 때 — 담긴 게 없으면 다시 둘러볼 거리를 줍니다
 *
 * ★ 기록이 없으면 이 자리 자체가 사라집니다. 제목만 덩그러니 남기지 않습니다.
 * ★ 서버에서는 아무것도 그리지 않습니다. 기록이 브라우저에만 있어서,
 *   서버가 미리 그려 두면 화면이 한 번 깜빡이며 바뀝니다(hydration 어긋남).
 *   그래서 붙고 난 뒤에 한 번 읽어 그립니다.
 * ★ 가로 스크롤입니다. 20개까지 쌓이므로 격자로 깔면 화면을 다 먹습니다.
 */

/** 카드 한 장의 폭. 모바일에서 두 장 반쯤 보이는 크기입니다. */
const CARD = 'w-[140px] md:w-[168px]';

function CloseIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M1 1l8 8M9 1L1 9" />
    </svg>
  );
}

export default function RecentlyViewed({
  /** 지금 보고 있는 상품. 제 페이지에서 자기를 또 보여 주지 않습니다. */
  excludeSlug,
  className = '',
}: {
  excludeSlug?: string;
  className?: string;
}) {
  const { brands } = useSite();
  const [items, setItems] = useState<RecentItem[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setItems(readRecent()), []);

  useEffect(() => {
    refresh();
    setReady(true);

    // 같은 탭에서 지웠을 때(RECENT_CHANGED)와 다른 탭에서 바뀌었을 때(storage) 모두 따라갑니다.
    window.addEventListener(RECENT_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(RECENT_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  const visible = items.filter((item) => item.slug !== excludeSlug);

  // 붙기 전이거나 보여 줄 게 없으면 자리 자체를 만들지 않습니다.
  if (!ready || visible.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-title" className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="label-xs">RECENTLY VIEWED</p>
          <h2
            id="recently-viewed-title"
            className="mt-3 font-serif text-[22px] leading-snug text-ink md:text-[28px]"
          >
            최근 본 상품
          </h2>
        </div>
        <button
          type="button"
          onClick={clearRecent}
          className="tap-target text-[13px] text-muted underline underline-offset-4 transition-colors duration-200 hover:text-ink"
        >
          전체 지우기
        </button>
      </div>

      {/*
        ★ -mx-5 md:-mx-10 은 .shell 의 좌우 여백만큼 되돌려, 카드가 화면 끝까지
          흘러가게 합니다. 안쪽 px 로 첫 카드의 왼끝은 글줄과 맞춰 둡니다.
          이렇게 해야 "옆으로 더 있다" 는 것이 잘린 카드로 드러납니다.
      */}
      <div className="mt-8 -mx-5 overflow-x-auto md:-mx-10">
        <ul className="flex gap-4 px-5 pb-2 md:gap-6 md:px-10">
          {visible.map((item) => {
            const brand = item.brandSlug ? findBrandLabel(brands, item.brandSlug) : '';
            return (
              <li key={item.slug} className={`${CARD} relative shrink-0`}>
                <Link href={`/products/${item.slug}`} className="block">
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-stone">
                    <SafeImage
                      src={item.thumbnail}
                      alt={`${brand} ${item.name}`.trim()}
                      label={item.name}
                      width={340}
                      height={454}
                    />
                  </div>
                  {brand ? (
                    <p className="mt-3 text-[12px] tracking-[0.14em] text-muted">{brand}</p>
                  ) : null}
                  <p className="mt-1 break-keep text-[14px] leading-snug text-ink">
                    {item.name}
                  </p>
                  <p className="mt-1 text-[14px] tabular-nums text-ink">
                    {formatPrice(item.price)}원
                  </p>
                </Link>

                {/*
                  ★ 삭제 버튼은 Link 바깥에 둡니다. 안에 넣으면 눌렀을 때
                    상세로 이동까지 함께 일어납니다.
                */}
                <button
                  type="button"
                  onClick={() => removeRecent(item.slug)}
                  aria-label={`${item.name} 기록 지우기`}
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center bg-paper/80 text-muted transition-colors duration-200 hover:text-ink"
                >
                  <CloseIcon />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
