'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SNS_BRAND_COLORS, SNS_ICONS, WeChatIcon } from '@/components/SnsIcons';
import { SNS_ITEMS, hasAnySns, type SnsSettings } from '@/lib/site-config';

/**
 * ============================================================
 * SNS 아이콘 줄 — 푸터와 브랜드 페이지가 함께 씁니다
 * ============================================================
 *
 * ★ 값이 비어 있는 항목은 그리지 않습니다. 전부 비어 있으면 줄 자체가 사라집니다.
 *   "준비 중" 아이콘을 남겨 두면 손님이 눌러 보고 아무 일도 안 일어납니다.
 *
 * ★ 인스타·스레드·틱톡은 새 탭으로 나갑니다.
 *   위챗만 다릅니다. 위챗은 프로필 주소라는 개념이 없어 QR 을 보여 줘야 하고,
 *   그래서 밖으로 내보내지 않고 이 자리에서 QR 을 띄웁니다.
 *
 * ★ 평소에는 전부 muted 한 색입니다. 마우스를 올린 하나만 그 SNS 의
 *   브랜드 컬러로 부드럽게 넘어갑니다. 터치 화면에서는 색이 들어오지 않습니다.
 *   (모양은 app/globals.css 의 .sns-icon 에 있습니다 — 거기 이유를 적어 두었습니다)
 * ★ 그림자를 쓰지 않습니다. 모달도 테두리로만 구분합니다.
 */

/**
 * 아이콘 하나가 차지하는 자리.
 *
 * ★ 그림은 24px 이지만 누를 수 있는 칸은 44px 입니다. 손가락은 뾰족하지 않습니다.
 *   그래서 아래 목록에 gap-2 를 더해도 눈에 보이는 아이콘 사이는 훨씬 넓습니다.
 */
const ICON_SLOT = 'sns-icon';

/** 브랜드 컬러를 CSS 변수로 넘깁니다. 색을 어디에 쓸지는 .sns-icon 이 정합니다. */
function brandStyle(color: string) {
  return { '--sns-brand': color } as CSSProperties;
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" aria-hidden="true">
      <path d="M1 1l14 14M15 1L1 15" />
    </svg>
  );
}

/**
 * 위챗 QR 모달.
 *
 * ★ Esc 로 닫히고, 열려 있는 동안 뒤쪽 화면이 스크롤되지 않습니다.
 *   닫으면 원래 눌렀던 버튼으로 초점을 돌려 줍니다. (키보드로만 쓰는 손님)
 */
function WeChatModal({ qrUrl, onClose }: { qrUrl: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="위챗 QR 코드"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-6"
    >
      {/* 안쪽을 눌러도 닫히지 않게 합니다. 바깥(배경)을 눌러야 닫힙니다. */}
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-[320px] border border-stone bg-paper p-6 text-center"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center text-muted transition-colors duration-200 hover:text-ink"
        >
          <CloseIcon />
        </button>

        <p className="label-xs">WECHAT</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl}
          alt="위챗 QR 코드"
          className="mx-auto mt-5 block h-auto w-full max-w-[220px]"
        />
        <p className="mt-5 text-[15px] leading-relaxed text-ink">위챗에서 스캔해 주세요</p>
      </div>
    </div>
  );
}

export default function SnsLinks({
  sns,
  className = '',
}: {
  sns: SnsSettings;
  className?: string;
}) {
  const [qrOpen, setQrOpen] = useState(false);

  if (!hasAnySns(sns)) return null;

  const wechat = sns.wechatQrUrl.trim();

  return (
    <div className={className}>
      {/*
        ★ -ml-2.5 는 첫 아이콘의 왼쪽 여백을 걷어내 위아래 글줄과 왼끝을 맞춥니다.
          44px 칸 안에 24px 그림이라 양쪽에 10px 씩 남고, 그만큼만 당깁니다.
          아이콘 크기를 바꾸면 이 숫자도 (칸 - 그림) / 2 로 다시 맞춰야 합니다.
      */}
      <ul className="-ml-2.5 flex flex-wrap items-center gap-2">
        {SNS_ITEMS.map((item) => {
          const url = sns.links[item.key].trim();
          if (!url) return null;
          const Icon = SNS_ICONS[item.key];

          return (
            <li key={item.key}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${item.label} 새 창에서 열기`}
                className={ICON_SLOT}
                style={brandStyle(SNS_BRAND_COLORS[item.key])}
              >
                <Icon />
              </a>
            </li>
          );
        })}

        {wechat ? (
          <li>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              aria-label="위챗 QR 코드 보기"
              aria-haspopup="dialog"
              className={ICON_SLOT}
              style={brandStyle(SNS_BRAND_COLORS.wechat)}
            >
              <WeChatIcon />
            </button>
          </li>
        ) : null}
      </ul>

      {qrOpen && wechat ? (
        <WeChatModal qrUrl={wechat} onClose={() => setQrOpen(false)} />
      ) : null}
    </div>
  );
}
