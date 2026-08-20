'use client';

import { useEffect, useState } from 'react';

/**
 * 입금 기한 카운트다운.
 *
 * ★ DB 를 다시 읽지 않습니다. 서버가 넘겨 준 기한 하나로 브라우저가 계산합니다.
 * ★ 6시간 미만이면 wine 색으로 강조합니다.
 * ★ 기한이 지나면 "기한이 지났습니다" 로 바뀝니다. (실제 취소는 서버가 합니다)
 */

/** 남은 시간을 '23시간 45분' 형태로 */
function remaining(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}일 ${hours % 24}시간`;
  }
  if (hours > 0) return `${hours}시간 ${rest}분`;
  if (minutes > 0) return `${minutes}분`;
  return '1분 미만';
}

export default function DepositCountdown({
  deadline,
  label,
}: {
  /** ISO 문자열 */
  deadline: string;
  /** '2026년 8월 15일 (금) 오후 2시 30분' 처럼 미리 만들어 넘깁니다. */
  label: string;
}) {
  const target = new Date(deadline).getTime();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (Number.isNaN(target)) return;

    const tick = () => setLeft(target - Date.now());
    tick();
    // 1분마다면 충분합니다. 초 단위로 세면 배터리만 씁니다.
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [target]);

  if (Number.isNaN(target)) return null;

  const expired = left !== null && left <= 0;
  // 6시간 미만이면 눈에 띄게 합니다.
  const urgent = left !== null && left > 0 && left < 6 * 60 * 60 * 1000;

  return (
    <section className="mt-6 border border-stone p-5 md:p-6">
      <h3 className="text-[14px] tracking-[0.14em] text-muted">입금 기한 안내</h3>

      <p className="mt-3 text-[17px] leading-[1.9] text-ink">
        <strong>{label}</strong>까지 입금해 주세요.
        <br />
        기한이 지나면 주문이 자동으로 취소됩니다.
      </p>

      <div className="mt-5 flex items-baseline gap-4 border-t border-stone pt-5">
        <span className="text-[14px] tracking-[0.14em] text-muted">남은 시간</span>
        {/* 서버와 브라우저의 시각이 달라 깜박이지 않도록, 계산 전에는 비워 둡니다. */}
        <span
          className={`text-[26px] font-semibold tabular-nums tracking-tight ${
            expired || urgent ? 'text-wine' : 'text-ink'
          }`}
        >
          {left === null ? ' ' : expired ? '기한이 지났습니다' : remaining(left)}
        </span>
      </div>
    </section>
  );
}
