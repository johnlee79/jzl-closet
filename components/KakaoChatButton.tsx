'use client';

import { useSite } from '@/components/SiteProvider';

/**
 * 카카오톡 오픈채팅 문의 버튼.
 *
 * ★ 링크는 관리자 > 설정 > 스토어 정보의 "카카오톡 채널 링크" 값을 씁니다.
 *   코드에 주소를 박아 두지 않습니다. 채팅방을 새로 파도 설정만 고치면 됩니다.
 * ★ 설정이 비어 있으면 버튼 자체를 그리지 않습니다.
 *   "준비중" 을 눌러 보게 만드는 것보다 아예 없는 편이 낫습니다.
 *   그래서 이 버튼 옆에 "아래 버튼으로 문의하세요" 같은 안내를 붙이면 안 됩니다.
 *   버튼이 사라졌을 때 안내만 남아 떠 버립니다.
 * ★ 말풍선은 외부 이미지가 아니라 SVG 로 직접 그립니다. (이모지·외부 링크 금지)
 * ★ 그림자를 쓰지 않습니다.
 * ★ 모양은 app/globals.css 의 .btn-kakao 에 있습니다. 여기에 px-8 같은 유틸리티를
 *   직접 달면 .btn-row 가 좁은 화면에서 여백을 줄이지 못합니다. (레이어 순서)
 */

/** 카카오 상징색 — 브랜드 가이드에서 정한 값이라 우리 토큰을 쓰지 않습니다. */
const KAKAO_YELLOW = '#FEE500';
const KAKAO_INK = '#191919';

/** 3-G 에서 문구를 통일했습니다. 사이트 어디서나 같은 말이 나가야 합니다. */
const LABEL = '카카오톡 실시간 문의';

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
  /**
   * 폭·바깥 여백은 쓰는 쪽이 정합니다.
   * ★ 예전에는 여기서 w-full 을 박아 두어, 다른 버튼과 나란히 놓을 수가 없었습니다.
   */
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
      className={`btn-kakao ${className}`}
    >
      <SpeechBubble />
      {LABEL}
    </a>
  );
}
