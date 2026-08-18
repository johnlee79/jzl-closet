'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

/**
 * ============================================================
 * 전체화면 이미지 뷰어 (3-J)
 * ============================================================
 *
 * ★ 마우스를 올리면 돋보기로 확대되는 방식은 일부러 쓰지 않았습니다.
 *   모바일에는 마우스 올리기가 없어 손님 대부분이 쓸 수 없고,
 *   큰 원본을 미리 받아 두어야 해서 전송량만 늘어납니다.
 *   눌러서 여는 편이 두 기기에서 똑같이 동작합니다.
 *
 * ★ 큰 이미지는 열었을 때 비로소 받습니다.
 *   닫혀 있는 동안에는 이 컴포넌트가 아무것도 그리지 않아 <img> 자체가 없습니다.
 *
 * ★ 확대는 CSS transform 으로만 합니다. 더 큰 파일을 다시 받지 않습니다.
 *     모바일 — 손가락 두 개로 벌리기(핀치)
 *     데스크톱 — 휠, 확대된 상태에서 끌어 이동
 *
 * ★ 열려 있는 동안 하단 구매 바와 맨 위로 버튼을 숨깁니다.
 *   html 에 data-viewer-open 을 달아 두면 globals.css 가 둘을 감춥니다.
 *   컴포넌트끼리 서로를 알 필요가 없어집니다.
 */

/** 확대 배율 한계. 너무 키우면 원본 해상도가 드러나 오히려 흐려 보입니다. */
const MIN_SCALE = 1;
const MAX_SCALE = 4;

/** 스와이프로 인정할 최소 가로 이동 거리(px) */
const SWIPE_THRESHOLD = 50;

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M1 1l16 16M17 1L1 17" />
    </svg>
  );
}

function ArrowIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="11" height="18" viewBox="0 0 11 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d={dir === 'left' ? 'M9.5 1L1.5 9l8 8' : 'M1.5 1l8 8-8 8'} />
    </svg>
  );
}

export default function ImageViewer({
  images,
  startIndex,
  productName,
  brand,
  onClose,
}: {
  images: string[];
  startIndex: number;
  productName: string;
  brand: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** 화면에 올린 포인터들. 두 개가 되면 핀치로 봅니다. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(
    null
  );
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const total = images.length;

  /** 배율을 되돌립니다. 다른 장으로 넘어갈 때마다 처음 크기로 시작합니다. */
  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const go = useCallback(
    (next: number) => {
      if (total === 0) return;
      setIndex(((next % total) + total) % total);
      resetZoom();
    },
    [total, resetZoom]
  );

  /* ── 열려 있는 동안의 바깥 처리 ─────────────────────── */
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    /*
      ★ 배경 스크롤을 막습니다. position:fixed 로 잡아 두지 않고 overflow 만 막으면
        모바일 사파리에서 뒤 배경이 같이 밀립니다. 다만 fixed 로 잡으면 스크롤
        위치가 0 으로 튀므로, 지금 위치를 기억해 두었다가 닫을 때 되돌립니다.
    */
    const scrollY = window.scrollY;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    // 하단 구매 바·맨 위로 버튼을 감추는 표시. (app/globals.css)
    root.setAttribute('data-viewer-open', 'true');

    closeRef.current?.focus();

    return () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      root.removeAttribute('data-viewer-open');
      // 원래 보던 자리로 돌아옵니다.
      window.scrollTo(0, scrollY);
    };
  }, []);

  /* ── 키보드 ─────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft') go(index - 1);
      if (event.key === 'ArrowRight') go(index + 1);

      /*
        ★ 초점을 뷰어 안에 가둡니다. 뒤쪽 페이지의 링크로 넘어가 버리면
          화면에는 뷰어가 떠 있는데 키보드는 딴 데 가 있는 상태가 됩니다.
      */
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, go, onClose]);

  /* ── 손가락·마우스 ──────────────────────────────────── */

  const distanceOf = () => {
    // ★ Array.from 을 씁니다. 스프레드로 Map 반복자를 펴면 빌드 타깃 때문에 타입 오류가 납니다.
    const [a, b] = Array.from(pointers.current.values());
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      // 두 손가락이 닿으면 핀치 시작. 스와이프·드래그는 멈춥니다.
      pinchStart.current = { distance: distanceOf(), scale };
      swipeStart.current = null;
      dragStart.current = null;
      return;
    }

    if (scale > 1) {
      dragStart.current = { x: event.clientX, y: event.clientY, offset };
    } else {
      swipeStart.current = { x: event.clientX, y: event.clientY };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const next = distanceOf();
      if (pinchStart.current.distance > 0) {
        const ratio = next / pinchStart.current.distance;
        setScale(
          Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.current.scale * ratio))
        );
      }
      return;
    }

    if (dragStart.current && scale > 1) {
      setOffset({
        x: dragStart.current.offset.x + (event.clientX - dragStart.current.x),
        y: dragStart.current.offset.y + (event.clientY - dragStart.current.y),
      });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    pointers.current.delete(event.pointerId);

    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      dragStart.current = null;
      swipeStart.current = null;

      // 확대하지 않은 상태에서 옆으로 충분히 끌었으면 장을 넘깁니다.
      if (start && scale === 1 && total > 1) {
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          go(dx < 0 ? index + 1 : index - 1);
        }
      }
      // 배율이 1 로 돌아오면 위치도 가운데로 되돌립니다.
      if (scale <= 1) setOffset({ x: 0, y: 0 });
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale - event.deltaY * 0.002));
    setScale(next);
    if (next <= 1) setOffset({ x: 0, y: 0 });
  };

  const src = images[index] ?? '';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} 이미지 크게 보기`}
      // 배경을 눌러도 닫힙니다. 이미지 위는 아래에서 눌림을 멈춰 둡니다.
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col bg-ink"
    >
      {/* ── 위: 닫기 ─────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-end p-4">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-11 w-11 items-center justify-center text-paper transition-opacity duration-200 hover:opacity-70"
        >
          <CloseIcon />
        </button>
      </div>

      {/* ── 가운데: 이미지 ───────────────────────────── */}
      <div
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        // touch-action:none 이라야 브라우저가 핀치·스크롤을 가로채지 않습니다.
        className="relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden [touch-action:none]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${brand} ${productName} 이미지 ${index + 1}`}
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > 1 ? 'grab' : 'default',
          }}
        />

        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="이전 이미지"
              className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center text-paper transition-opacity duration-200 hover:opacity-70 [@media(hover:hover)]:flex"
            >
              <ArrowIcon dir="left" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="다음 이미지"
              className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center text-paper transition-opacity duration-200 hover:opacity-70 [@media(hover:hover)]:flex"
            >
              <ArrowIcon dir="right" />
            </button>
          </>
        ) : null}
      </div>

      {/* ── 아래: 몇 번째인지 ────────────────────────── */}
      <div className="shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 text-center">
        <span className="text-[13px] tabular-nums tracking-[0.14em] text-paper/80">
          {index + 1} / {total}
        </span>
      </div>
    </div>
  );
}
