'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import ImageViewer from '@/components/ImageViewer';
import SafeImage from '@/components/SafeImage';

/* ------------------------------------------------------------------
 * 자동 전환 속도 — 이 세 값만 고치면 됩니다.
 * ------------------------------------------------------------------ */
const SLIDE_INTERVAL_MS = 1000; // 전환 간격
const SLIDE_FADE_MS = 350; // 크로스페이드 시간
const FIRST_SLIDE_HOLD_MS = 2000; // 첫 이미지만 더 오래

/** 스와이프로 인정할 최소 가로 이동 거리(px) */
const SWIPE_THRESHOLD = 40;

type ProductGalleryProps = {
  images: string[];
  productName: string;
  brand: string;
};

/**
 * 상품 상세의 메인 이미지.
 *
 * 자동 전환은 "한 바퀴만" 돌고 첫 이미지로 돌아가 멈춥니다.
 * 상세 설명을 읽는 동안 계속 깜빡이면 오히려 방해가 되기 때문입니다.
 * 마우스를 올리거나, 화면 밖으로 나가거나, 썸네일을 직접 고르면 멈춥니다.
 */
export default function ProductGallery({
  images,
  productName,
  brand,
}: ProductGalleryProps) {
  // 이미지가 하나도 없어도 자리(SafeImage 의 대체 화면)는 잡아 둡니다.
  const list = useMemo(() => (images.length > 0 ? images : ['']), [images]);

  const frameRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);
  /** 실제로 <img> 를 걸어 둔 인덱스. 다음 장을 미리 걸어 두는 것이 곧 preload 입니다. */
  const [mounted, setMounted] = useState<number[]>([0]);
  /** 전체화면 뷰어 (3-J). 열었을 때만 큰 이미지를 받습니다. */
  const [viewerOpen, setViewerOpen] = useState(false);

  const canAuto = list.length > 1 && !reduced;
  const running = canAuto && playing && visible && !hovered;

  /* ── 움직임 최소화 설정 ─────────────────────────────── */
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  /* ── 화면에 보일 때만 돌립니다 (모바일 배터리·데이터 절약) ── */
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { threshold: 0.3 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* ── 자동 전환 ──────────────────────────────────────── */
  useEffect(() => {
    if (!running) return undefined;

    const delay = active === 0 ? FIRST_SLIDE_HOLD_MS : SLIDE_INTERVAL_MS;
    const timer = window.setTimeout(() => {
      if (active >= list.length - 1) {
        // 한 바퀴를 다 돌았습니다. 첫 이미지로 돌아가 멈춥니다.
        setActive(0);
        setPlaying(false);
      } else {
        setActive(active + 1);
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [running, active, list.length]);

  /* ── 앞뒤 한 장씩 미리 걸어 둡니다 (전환 시 깜빡임 방지) ── */
  useEffect(() => {
    setMounted((prev) => {
      const next = new Set(prev);
      next.add(active);
      if (active + 1 < list.length) next.add(active + 1);
      if (active - 1 >= 0) next.add(active - 1);
      if (next.size === prev.length) return prev;
      return Array.from(next).sort((a, b) => a - b);
    });
  }, [active, list.length]);

  /** 이미지를 직접 고르면 자동 전환을 멈춥니다. */
  const show = useCallback(
    (index: number, stopAuto = true) => {
      const count = list.length;
      setActive(((index % count) + count) % count);
      if (stopAuto) setPlaying(false);
    },
    [list.length]
  );

  const startAuto = () => {
    // 마지막 장에서 다시 켜면 처음부터 보여 줍니다.
    if (active >= list.length - 1) setActive(0);
    setPlaying(true);
  };

  /* ── 모바일 좌우 스와이프 ───────────────────────────── */
  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || list.length < 2) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // 세로로 더 많이 움직였으면 페이지 스크롤입니다. 건드리지 않습니다.
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;

    show(active + (dx < 0 ? 1 : -1));
  };

  const arrowClass =
    'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center bg-paper/85 text-ink opacity-0 transition-opacity duration-200 hover:bg-paper focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:flex';

  return (
    /*
     * ★ self-start 가 중요합니다.
     *   이 갤러리는 2단 그리드의 왼쪽 칸입니다. 그리드는 기본으로 두 칸의 높이를 맞추는데,
     *   오른쪽 구매 영역이 길어지면 왼쪽도 같이 늘어나면서
     *   아래 프레임의 aspect 비율이 무시되고 이미지가 세로로 늘어납니다.
     *   (적립 안내·비회원 구매 버튼이 늘면서 실제로 그렇게 됐습니다)
     */
    <div className="flex flex-col-reverse gap-4 self-start md:flex-row md:gap-6">
      {/*
       * 썸네일 목록.
       * ★ 데스크탑에서는 absolute 로 띄웁니다.
       *   그래야 썸네일이 아무리 많아도 이 목록이 갤러리 전체 높이를 밀어 올리지 않습니다.
       *   높이는 오른쪽 큰 이미지가 정하고, 목록은 그 높이 안에서 스크롤됩니다.
       *
       * ★ 썸네일 비율을 aspect-[3/4] 로 못 박습니다. (예전에는 높이 110px 고정이었습니다)
       *   세로만 고정해 두면 세로 스크롤바가 가로를 먹는 만큼 칸이 좁아져
       *   3:4 인 상품 사진의 좌우가 잘렸습니다. 스크롤바 두께는 기기마다 달라서
       *   폭을 아무리 맞춰도 어딘가에서는 어긋납니다.
       *   비율로 두면 남는 폭이 얼마든 사진이 잘리지 않습니다.
       * ★ 모바일은 그대로 가로 스크롤(h-[100px] w-[76px])입니다. md 부터만 바뀝니다.
       */}
      <div className="shrink-0 md:relative md:w-[104px]">
      <ul className="flex gap-3 overflow-x-auto md:absolute md:inset-0 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
        {list.map((src, index) => (
          <li key={`${src}-${index}`} className="shrink-0">
            <button
              type="button"
              onClick={() => show(index)}
              aria-label={`${productName} ${index + 1}번째 이미지 보기`}
              aria-current={index === active}
              className={`block h-[100px] w-[76px] overflow-hidden border bg-stone transition-colors duration-200 md:aspect-[3/4] md:h-auto md:w-full ${
                index === active ? 'border-ink' : 'border-transparent'
              }`}
            >
              <SafeImage
                src={src}
                alt={`${brand} ${productName} 썸네일 ${index + 1}`}
                label={productName}
                width={152}
                height={200}
              />
            </button>
          </li>
        ))}
      </ul>
      </div>

      <div
        ref={frameRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        // ★ 3:4 고정. self-start 로 늘어나지 않게 못 박아 둡니다.
        //   (aspect 는 높이가 auto 일 때만 먹습니다. 늘어나면 그냥 무시됩니다)
        className="group relative aspect-[3/4] w-full self-start overflow-hidden bg-stone"
      >
        {/* 겹쳐 두고 투명도만 바꿉니다. 이미지가 밀리거나 튀지 않습니다. */}
        {list.map((src, index) =>
          mounted.includes(index) ? (
            <div
              key={`${src}-${index}`}
              aria-hidden={index !== active}
              className="absolute inset-0 transition-opacity ease-out"
              style={{
                opacity: index === active ? 1 : 0,
                transitionDuration: `${reduced ? 0 : SLIDE_FADE_MS}ms`,
              }}
            >
              <SafeImage
                src={src}
                alt={`${brand} ${productName} 상세 이미지 ${index + 1}`}
                label={productName}
                width={900}
                height={1125}
                priority={index === 0}
              />
            </div>
          ) : null
        )}

        {/*
          ★ 눌러서 전체화면으로 보는 버튼 (3-J).
            이미지 전체를 덮는 투명한 버튼입니다. 이미지 자체를 button 으로 감싸면
            자동 전환·스와이프를 처리하는 바깥 div 와 이벤트가 얽힙니다.
          ★ 이미지들 다음, 좌우 화살표(z-10) 앞에 둡니다. 그래야 이미지 위에서는
            눌러지고, 화살표·자동보기 버튼을 눌렀을 때는 뷰어가 함께 열리지 않습니다.
        */}
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`${productName} 이미지 크게 보기`}
          className="absolute inset-0 z-0 cursor-zoom-in"
        />

        {list.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => show(active - 1)}
              aria-label="이전 이미지"
              className={`${arrowClass} left-2`}
            >
              <svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M8 1L1 7.5 8 14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => show(active + 1)}
              aria-label="다음 이미지"
              className={`${arrowClass} right-2`}
            >
              <svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M1 1l7 6.5L1 14" />
              </svg>
            </button>

            <span className="absolute bottom-3 left-3 z-10 bg-paper/85 px-2.5 py-1 text-[13px] tabular-nums tracking-[0.1em] text-ink">
              {active + 1} / {list.length}
            </span>

            {/* 멈춰 있을 때만 다시 켤 수 있는 버튼을 내놓습니다. */}
            {canAuto && !playing ? (
              <button
                type="button"
                onClick={startAuto}
                className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 bg-paper/90 px-3 py-1.5 text-[13px] tracking-[0.1em] text-ink transition-colors hover:bg-paper"
              >
                <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" aria-hidden="true">
                  <path d="M0 0l8 5-8 5z" />
                </svg>
                자동보기
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {/* 전체화면 뷰어 — 열었을 때만 큰 이미지를 받습니다. */}
      {viewerOpen ? (
        <ImageViewer
          images={list.filter(Boolean)}
          startIndex={active}
          productName={productName}
          brand={brand}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </div>
  );
}
