'use client';

import { useSite } from '@/components/SiteProvider';

/**
 * 카카오톡 오픈채팅 문의 버튼.
 *
 * ★ 링크는 관리자 > 설정 > 스토어 정보의 "카카오톡 채널 링크" 값을 씁니다.
 *   코드에 주소를 박아 두지 않습니다. 채팅방을 새로 파도 설정만 고치면 됩니다.
 * ★ 설정이 비어 있으면 버튼 자체를 그리지 않습니다.
 *   "준비중" 을 눌러 보게 만드는 것보다 아예 없는 편이 낫습니다.
 * ★ 말풍선은 외부 이미지가 아니라 SVG 로 직접 그립니다. (이모지·외부 링크 금지)
 */

/** 카카오 상징색 — 브랜드 가이드에서 정한 값이라 우리 토큰을 쓰지 않습니다. */
const KAKAO_YELLOW = '#FEE500';
const KAKAO_INK = '#191919';

function SpeechBubble() {
  return (
    <svg
      width="18"
      height="17"
      viewBox="0 0 18 17"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* 카카오톡 말풍선 — 타원 몸통 + 왼쪽 아래 꼬리 */}
      <path
        fill={KAKAO_INK}
        d="M9 0.9C4.3 0.9 0.5 3.9 0.5 7.6c0 2.4 1.6 4.5 4 5.7-.2.6-.7 2.3-.8 2.7 0 .2.1.3.3.2.2-.1 2.5-1.7 3.5-2.4.5.1 1 .1 1.5.1 4.7 0 8.5-3 8.5-6.7S13.7.9 9 .9z"
      />
    </svg>
  );
}

export default function KakaoChatButton({
  className = '',
}: {
  className?: string;
}) {
  const { store } = useSite();
  const link = store.kakao?.trim() ?? '';

  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      style={{ backgroundColor: KAKAO_YELLOW, color: KAKAO_INK }}
      className={`inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-sm px-10 py-4 text-[15px] tracking-[0.14em] transition-opacity duration-200 hover:opacity-90 ${className}`}
    >
      <SpeechBubble />
      카카오톡으로 문의하기
    </a>
  );
}
