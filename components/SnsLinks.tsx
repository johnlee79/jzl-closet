'use client';

import { useEffect, useRef, useState } from 'react';
import { SNS_ICONS, WeChatIcon } from '@/components/SnsIcons';
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
 * ★ 색을 칠하지 않습니다. 평소 muted, 올리면 ink 입니다. (브랜드컬러 금지)
 * ★ 그림자를 쓰지 않습니다. 모달도 테두리로만 구분합니다.
 */

/** 아이콘 하나가 차지하는 자리 — 손가락으로 누를 수 있는 크기(44px)를 지킵니다. */
const ICON_SLOT =
  'flex h-11 w-11 items-center justify-center text-muted transition-colors duration-200 hover:text-ink';

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
      <ul className="-ml-2.5 flex flex-wrap items-center">
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
