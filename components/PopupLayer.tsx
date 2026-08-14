'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { announceNoticePopups } from '@/lib/popup-order';
import { sanitizeRichText } from '@/lib/product-utils';
import type { Popup } from '@/lib/popups';

/**
 * 메인 팝업.
 *
 * · "오늘 하루 보지 않기" 를 누르면 24시간 동안 다시 뜨지 않습니다. (쿠키)
 * · 여러 개면 display_order 순서대로 나란히 놓아 겹치지 않게 합니다.
 * · ★ 모바일에서는 위치·폭 설정을 무시하고 화면 가운데에 가로 90%로 띄웁니다.
 *   좁은 화면에서 left/right 로 붙이면 잘리기 때문입니다.
 */
const COOKIE_PREFIX = 'jzl-popup-';

function hiddenToday(id: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((entry) => entry.trim().startsWith(`${COOKIE_PREFIX}${id}=`));
}

function hideForToday(id: string): void {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE_PREFIX}${id}=1; expires=${expires}; path=/; SameSite=Lax`;
}

/** 데스크탑에서의 가로 위치 */
const POSITION_CLASS: Record<string, string> = {
  left: 'md:mr-auto',
  center: 'md:mx-auto',
  right: 'md:ml-auto',
};

export default function PopupLayer({ popups }: { popups: Popup[] }) {
  const pathname = usePathname();
  /** 아직 닫지 않은 팝업 id */
  const [open, setOpen] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 쿠키는 브라우저에서만 읽을 수 있어 마운트 후에 거릅니다.
    setOpen(popups.filter((popup) => !hiddenToday(popup.id)).map((popup) => popup.id));
    setMounted(true);
  }, [popups]);

  const isHome = pathname === '/';
  const shown = mounted
    ? popups.filter(
        (popup) =>
          open.includes(popup.id) &&
          (popup.showOn === 'all' || (isHome && popup.showOn === 'home'))
      )
    : [];

  // ★ 보유 포인트 팝업이 공지 팝업과 겹쳐 뜨지 않도록 몇 개를 띄웠는지 알려 줍니다.
  //   (공지 팝업 우선, 포인트 팝업은 그다음)
  useEffect(() => {
    if (mounted) announceNoticePopups(shown.length);
  }, [mounted, shown.length]);

  if (!mounted || shown.length === 0) return null;

  const close = (id: string) => setOpen((prev) => prev.filter((item) => item !== id));

  const closeToday = (id: string) => {
    hideForToday(id);
    close(id);
  };

  return (
    // 팝업 뒤 화면을 가리지 않습니다. 스크롤도 그대로 둡니다.
    <div className="pointer-events-none fixed inset-0 z-40 overflow-y-auto p-4 md:p-8">
      <div className="flex flex-col items-center gap-4 md:flex-row md:flex-wrap md:items-start">
        {shown.map((popup) => {
          const body = (
            <>
              {popup.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={popup.imageUrl}
                  alt={popup.title}
                  className="block h-auto w-full"
                />
              ) : (
                <div className="p-6">
                  <p className="font-serif text-[18px] leading-snug text-ink">
                    {popup.title}
                  </p>
                  {popup.content ? (
                    <div
                      className="detail-body mt-3 text-[15px] leading-[1.9] text-ink"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeRichText(popup.content),
                      }}
                    />
                  ) : null}
                </div>
              )}
            </>
          );

          return (
            <div
              key={popup.id}
              // ★ 모바일: 가로 90%, 가운데. 데스크탑: 설정한 폭과 위치.
              className={`pointer-events-auto w-[90%] max-w-full border border-stone bg-paper md:w-auto ${
                POSITION_CLASS[popup.position] ?? 'md:mx-auto'
              }`}
              style={{ ['--popup-width' as string]: `${popup.width}px` }}
            >
              <div className="md:w-[var(--popup-width)]">
                {popup.linkUrl ? (
                  <Link
                    href={popup.linkUrl}
                    onClick={() => close(popup.id)}
                    className="block"
                    aria-label={popup.title}
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}

                <div className="flex items-center justify-between border-t border-stone">
                  <label className="flex cursor-pointer items-center gap-2 py-3 pl-4 text-[13px] text-muted">
                    <input
                      type="checkbox"
                      onChange={(event) => {
                        if (event.target.checked) closeToday(popup.id);
                      }}
                      className="h-4 w-4"
                    />
                    오늘 하루 보지 않기
                  </label>
                  <button
                    type="button"
                    onClick={() => close(popup.id)}
                    className="min-h-[44px] px-4 text-[13px] tracking-[0.1em] text-ink"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
