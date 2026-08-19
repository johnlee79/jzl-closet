'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ============================================================
 * 가로로 밀어 보는 목록 (3-L)
 * ============================================================
 *
 * ★ 저절로 흐르지 않습니다. 손님이 직접 밀어야 움직입니다.
 *   자동으로 흐르면 누르려는 순간 항목이 달아나고, 읽는 속도는 사람마다 다릅니다.
 *
 * ★ overflow-x: auto 를 그대로 씁니다. 스크롤바만 감춥니다. (globals.css 의 .hscroll)
 *   overflow 를 없애고 transform 으로 밀면 키보드(Tab·화살표)로 넘길 수 없게 됩니다.
 *
 * ★ 세로 스크롤을 막지 않습니다. touch-action 을 건드리지 않아,
 *   이 영역 위에서 위아래로 밀면 페이지가 그대로 스크롤됩니다.
 *   (여기에 touch-action: none 을 걸면 손가락이 갇힙니다)
 *
 * ★ 화살표는 마우스가 있는 기기에만 나옵니다. 맨 처음에는 왼쪽,
 *   맨 끝에서는 오른쪽 화살표를 감춥니다. 눌러도 아무 일 없는 버튼을 두지 않습니다.
 *
 * ★ 만든 이유 — 프로젝트에 가로 스크롤이 여섯 군데 있었지만 전부 그 자리에
 *   직접 적어 둔 것이라 가져다 쓸 수 있는 것이 없었습니다. 여기로 모읍니다.
 */

/** 화살표 한 번에 밀 거리. 보이는 폭의 80% 만큼 넘깁니다. */
const PAGE_RATIO = 0.8;

/** 끝에 닿았는지 판단할 여유(px). 소수점 오차 때문에 0 으로 두면 화살표가 깜빡입니다. */
const EDGE_SLACK = 4;

function Arrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      width="9"
      height="15"
      viewBox="0 0 9 15"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d={dir === 'left' ? 'M8 1L1 7.5 8 14' : 'M1 1l7 6.5L1 14'} />
    </svg>
  );
}

export default function HScroll({
  children,
  label,
  className = '',
}: {
  children: React.ReactNode;
  /** 이 목록이 무엇인지. 화살표 버튼의 읽어 주는 이름에 들어갑니다. */
  label: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= EDGE_SLACK);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_SLACK);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;

    update();
    el.addEventListener('scroll', update, { passive: true });

    /*
      ★ 폭이 바뀌면 끝에 닿았는지도 달라집니다.
        창 크기·글꼴 로딩·항목 수 변화까지 한 번에 잡으려고 ResizeObserver 를 씁니다.
    */
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [update]);

  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /*
      ★ 갈 자리를 우리가 직접 끝값 안으로 잘라 줍니다. scrollBy 로 넘겨서는 안 됩니다.
        끝을 넘는 자리를 요구하면 브라우저가 그 요구를 스냅 위치로 다시 계산하는데,
        마지막 한 번은 갈 곳을 못 찾고 그냥 제자리에 멈춰 버립니다.
        실제로 그렇게 됐습니다 — 마지막 화살표를 눌러도 아무 일도 일어나지 않고
        목록이 끝에 닿지 못한 채 한 화면 앞에서 멈췄습니다.
    */
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.min(
      max,
      Math.max(0, el.scrollLeft + el.clientWidth * PAGE_RATIO * direction)
    );
    el.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const arrowClass =
    'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center border border-stone bg-paper text-ink transition-opacity duration-200 hover:bg-stone [@media(hover:hover)]:flex';

  return (
    <div className={`relative ${className}`}>
      {/*
        ★ -mx 로 .shell 의 좌우 여백만큼 되돌리고 안쪽 px 로 다시 맞춥니다.
          그래야 오른쪽 항목이 화면 끝에서 잘려 "더 있다" 는 것이 눈에 보입니다.
          여백 안에서 끊기면 목록이 거기서 끝난 것처럼 보입니다.
      */}
      {/*
        ★ scroll-pl 을 좌우 여백(px-5 / md:px-10)과 같은 값으로 맞춥니다. 반드시 필요합니다.
          이게 없으면 첫 항목이 여백만큼 밀린 자리(scrollLeft 40)에 붙어 멈춥니다.
          그러면 "맨 앞에 있다" 는 판단이 영영 서지 않아 왼쪽 화살표가 안 사라집니다.
          실제로 그렇게 만들어 보고 확인한 뒤 고쳤습니다.

        ★ 스냅은 proximity 입니다. mandatory 가 아닙니다.
          mandatory 는 손님이 멈춘 자리를 브라우저가 반드시 고쳐 잡습니다.
          그래서 끝자락처럼 딱 떨어지지 않는 자리에서는 가려던 곳으로 못 가고
          뒤로 되돌아가 버립니다. proximity 는 가까울 때만 붙여 주므로
          항목 경계에 기분 좋게 멈추면서도 맨 끝에는 반드시 닿습니다.
      */}
      <ul
        ref={trackRef}
        className="hscroll -mx-5 flex snap-x snap-proximity scroll-pl-5 gap-x-4 px-5 pb-2 md:-mx-10 md:scroll-pl-10 md:gap-x-6 md:px-10"
      >
        {children}
      </ul>

      {atStart ? null : (
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label={`${label} 이전으로`}
          className={`${arrowClass} left-0`}
        >
          <Arrow dir="left" />
        </button>
      )}
      {atEnd ? null : (
        <button
          type="button"
          onClick={() => page(1)}
          aria-label={`${label} 다음으로`}
          className={`${arrowClass} right-0`}
        >
          <Arrow dir="right" />
        </button>
      )}
    </div>
  );
}
