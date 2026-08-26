'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RANGE_PRESETS } from '@/lib/admin-range';

/*
 * ** 버튼 목록을 여기 두지 않습니다. (2026-08-27)
 *   lib/admin-range.ts 의 RANGE_PRESETS 하나만 씁니다.
 *   버튼 목록과 기간을 푸는 코드가 갈라지면, 버튼은 '전일' 인데
 *   실제로는 다른 기간을 보는 일이 생깁니다.
 */

/**
 * 관리자 화면의 기간 선택. 조건은 주소에 담아 새로고침해도 유지됩니다.
 *
 * ** 통계 화면과 수익 관리 화면이 같이 씁니다. (2026-08-27)
 *   전에는 주소가 /admin/stats 로 박혀 있어 다른 화면에서 쓸 수 없었습니다.
 *   basePath 를 받아 두 화면이 같은 컴포넌트를 쓰게 했습니다.
 */
export default function StatsRange({
  from,
  to,
  preset,
  basePath,
}: {
  from: string;
  to: string;
  preset: string;
  /** 예: '/admin/stats' · '/admin/profit' */
  basePath: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  const go = (query: Record<string, string>) => {
    router.push(`${basePath}?${new URLSearchParams(query).toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <span className="admin-label">기간</span>
        <div className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => go({ preset: item.key })}
              aria-pressed={preset === item.key}
              className={
                preset === item.key
                  ? 'admin-btn border-blue-700 bg-blue-700 text-white hover:bg-blue-800'
                  : 'admin-btn'
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="admin-label">직접 입력</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-label="시작일"
            className="admin-input w-[150px]"
          />
          <span className="text-slate-400">—</span>
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            aria-label="종료일"
            className="admin-input w-[150px]"
          />
          <button
            type="button"
            onClick={() => go({ preset: 'custom', from: start, to: end })}
            className={preset === 'custom' ? 'admin-btn-primary' : 'admin-btn'}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
