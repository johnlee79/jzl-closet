'use client';

import { useEffect, useState } from 'react';

/**
 * ============================================================
 * 맨 위로 버튼
 * ============================================================
 *
 * ★ 화면 높이의 두 배만큼 내려갔을 때부터 나타납니다.
 *   조금만 내려도 뜨면 짧은 화면에서 계속 따라다니는 것처럼 보입니다.
 *   두 배쯤 내려간 뒤라면 "위로 돌아가는 길이 멀다" 는 것이 사실이 됩니다.
 *
 * ★ 모양은 app/globals.css 의 .to-top 에 있습니다.
 *   아이폰 홈 인디케이터를 피하는 여백 계산(env(safe-area-inset-bottom))이 있어
 *   유틸리티 클래스보다 CSS 로 두는 편이 읽기 쉽습니다.
 *
 * ★ 고객 화면과 관리자 화면이 함께 씁니다. 팔레트만 variant 로 가릅니다.
 *   관리자는 다크모드가 있어 색을 팔레트 변수로 받습니다.
 */

/** 화면 높이의 몇 배를 내려가야 나타날지. */
const SHOW_AFTER_SCREENS = 2;

function ArrowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      {/* 세로줄 + 갈매기. 이모지·외부 아이콘을 쓰지 않습니다. */}
      <path d="M8 14V2.5" />
      <path d="M2.8 7.7 8 2.4l5.2 5.3" />
    </svg>
  );
}

export default function ScrollToTop({
  variant = 'shop',
}: {
  variant?: 'shop' | 'admin';
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    /*
      ★ 스크롤 이벤트는 손가락 한 번에 수십 번씩 옵니다.
        그때마다 setState 를 부르면 화면이 버벅입니다.
        다음 화면 그리기 직전에 한 번만 확인하도록 묶습니다.
    */
    let frame = 0;

    const check = () => {
      frame = 0;
      setShown(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS);
    };

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(check);
    };

    // 새로고침으로 중간에서 시작한 경우를 위해 한 번 먼저 확인합니다.
    check();
    // passive — 이 처리기가 스크롤을 막지 않는다고 알려 주어 스크롤이 끊기지 않습니다.
    window.addEventListener('scroll', onScroll, { passive: true });
    // 화면을 돌리면 기준 높이가 달라집니다.
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const toTop = () => {
    /*
      ★ 움직임을 줄여 달라고 설정한 손님에게는 부드럽게 굴리지 않고 곧바로 올립니다.
        CSS 의 scroll-behavior 는 여기서 소용이 없습니다. scrollTo 의 behavior 가
        CSS 보다 우선하기 때문에, 자바스크립트에서 직접 물어보고 정해야 합니다.
    */
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="페이지 맨 위로"
      /*
        ★ 숨어 있을 때는 탭 순서와 화면 낭독기 양쪽에서 빠집니다.
          CSS 의 visibility 만으로도 대개 빠지지만, 전환 중 잠깐 남는 순간이 있어
          여기서도 한 번 더 막아 둡니다. 보이지 않는 버튼에 초점이 멈추면
          키보드만 쓰는 손님은 지금 어디에 있는지 알 수 없습니다.
      */
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      className={`to-top ${variant === 'admin' ? 'to-top-admin' : ''} ${
        shown ? 'to-top-on' : ''
      }`}
    >
      <ArrowUpIcon />
    </button>
  );
}
