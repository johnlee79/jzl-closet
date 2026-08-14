'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const PRESETS = [
  { key: 'today', label: '오늘' },
  { key: '7d', label: '7일' },
  { key: '30d', label: '30일' },
  { key: 'month', label: '이번달' },
  { key: 'lastMonth', label: '지난달' },
];

/** 통계 화면의 기간 선택. 조건은 주소에 담아 새로고침해도 유지됩니다. */
export default function StatsRange({
  from,
  to,
  preset,
}: {
  from: string;
  to: string;
  preset: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  const go = (query: Record<string, string>) => {
    router.push(`/admin/stats?${new URLSearchParams(query).toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <span className="admin-label">기간</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((item) => (
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
