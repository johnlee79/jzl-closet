import { PROGRESS_STEPS, orderProgress } from '@/lib/order-status';

/**
 * 주문이 지금 어디쯤 왔는지 보여 주는 네 칸.
 *
 *   결제완료 ── 상품준비중 ── 배송중 ── 배송완료
 *
 * 손님 화면 전용입니다. 관리자에는 쓰지 않습니다.
 * 주문 완료 · 주문 조회 · 마이페이지 주문 내역 · 주문 상세 네 곳이 함께 씁니다.
 *
 * ★ 훅을 쓰지 않는 순수 표시용이라 서버·클라이언트 어디서든 그릴 수 있습니다.
 * ★ 취소·교환·반품·결제실패는 이 흐름 밖이라 네 칸을 그리지 않고 한 줄로 알립니다.
 *   억지로 끼워 넣으면 "배송중인데 취소됨" 같은 화면이 나옵니다.
 * ★ 색은 ink · stone · muted · wine 만 씁니다. 그림자는 쓰지 않습니다.
 */
export default function OrderProgress({
  status,
  compact = false,
  className = '',
}: {
  status: string;
  /** 목록 안에 들어갈 때 쓰는 작은 형태 */
  compact?: boolean;
  className?: string;
}) {
  const progress = orderProgress(status);

  /* ── 흐름 밖 — 취소·교환·반품·결제실패 ──────────────── */
  if (progress.kind === 'aside') {
    return (
      <div className={`border border-stone px-4 py-3 ${className}`}>
        <p className={compact ? 'text-[14px]' : 'text-[15px]'}>
          <span className="font-medium text-wine">{progress.label}</span>
          <span className="text-muted"> · 배송 단계와 별도로 처리되는 주문입니다</span>
        </p>
      </div>
    );
  }

  const current = progress.currentIndex;
  const last = PROGRESS_STEPS.length - 1;

  /* 점 크기 — 지금 단계만 크게 그려 눈에 걸리게 합니다. */
  const dotSize = compact ? 'h-[8px] w-[8px]' : 'h-[9px] w-[9px]';
  const currentDotSize = compact ? 'h-[11px] w-[11px]' : 'h-[13px] w-[13px]';
  const railHeight = compact ? 'h-[11px]' : 'h-[13px]';

  return (
    <ol
      aria-label="주문 진행 단계"
      className={`flex w-full items-start ${className}`}
    >
      {PROGRESS_STEPS.map((step, index) => {
        const done = index <= current;
        const isCurrent = index === current;

        return (
          <li
            key={step.status}
            aria-current={isCurrent ? 'step' : undefined}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            {/* 점과 좌우 연결선 */}
            <span
              className={`relative flex w-full items-center justify-center ${railHeight}`}
            >
              {/*
                ★ 선은 칸의 가운데(점)에서 끊습니다.
                  왼쪽 선은 이 단계에 도달했으면 채우고,
                  오른쪽 선은 다음 단계까지 갔을 때만 채웁니다.
              */}
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-0 right-1/2 h-px ${done ? 'bg-ink' : 'bg-stone'}`}
                />
              ) : null}
              {index < last ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 right-0 h-px ${
                    index < current ? 'bg-ink' : 'bg-stone'
                  }`}
                />
              ) : null}

              <span
                aria-hidden="true"
                className={`relative rounded-full ${
                  isCurrent
                    ? `${currentDotSize} bg-wine`
                    : done
                      ? `${dotSize} bg-ink`
                      : `${dotSize} bg-stone`
                }`}
              />
            </span>

            <span
              className={`text-center leading-tight ${compact ? 'text-[12px]' : 'text-[13px]'} ${
                isCurrent ? 'font-semibold text-ink' : 'text-muted'
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
