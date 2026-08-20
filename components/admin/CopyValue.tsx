'use client';

import { useState } from 'react';

/**
 * 값 하나와 복사 버튼.
 *
 * ★ 왜 필요한가 (4-A)
 *   KSNET 거래번호와 승인번호는 취소를 대행사에 요청할 때 그대로 불러 줘야 하는
 *   값입니다. 숫자를 눈으로 읽어 옮겨 적으면 반드시 틀립니다.
 *   틀린 번호로 접수하면 며칠이 그냥 지나갑니다.
 *
 * ★ 이모지를 쓰지 않습니다. 아이콘은 SVG 로 직접 그립니다.
 */
export default function CopyValue({
  label,
  value,
  /** 크게 보여 줄지 — 취소 요청 상태에서는 눈에 잘 띄어야 합니다. */
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <div>
        <span className="admin-label">{label}</span>
        <p className="text-[15px] text-slate-400">—</p>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드를 못 쓰는 브라우저입니다. 값은 화면에 그대로 보이므로
      // 손으로 골라 복사할 수 있습니다. 알림창은 띄우지 않습니다.
      setCopied(false);
    }
  };

  return (
    <div>
      <span className="admin-label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`select-all font-mono tabular-nums text-slate-900 ${
            large ? 'text-[22px] font-semibold' : 'text-[15px]'
          }`}
        >
          {value}
        </span>
        <button type="button" onClick={copy} className="admin-btn" aria-label={`${label} 복사`}>
          <span className="inline-flex items-center gap-1.5">
            {/* 복사 아이콘 — 네모 두 장 */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
              <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" />
            </svg>
            {copied ? '복사됨' : '복사'}
          </span>
        </button>
      </div>
    </div>
  );
}
