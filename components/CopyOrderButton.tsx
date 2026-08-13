'use client';

import { useState } from 'react';

type CopyOrderButtonProps = {
  text: string;
  disabled?: boolean;
};

type CopyState = 'idle' | 'done' | 'failed';

function fallbackCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

export default function CopyOrderButton({ text, disabled = false }: CopyOrderButtonProps) {
  const [state, setState] = useState<CopyState>('idle');

  const handleCopy = async () => {
    if (disabled) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setState('done');
        return;
      } catch {
        // 아래 fallback으로 이어집니다.
      }
    }
    setState(fallbackCopy(text) ? 'done' : 'failed');
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleCopy}
        disabled={disabled}
        className="btn-secondary w-full"
      >
        주문 내역 복사하기
      </button>
      {state === 'done' ? (
        <p className="text-[13px] leading-relaxed text-ink">
          주문 내역이 복사되었습니다. 고객센터로 붙여넣어 보내주세요.
        </p>
      ) : null}
      {state === 'failed' ? (
        <p className="text-[13px] leading-relaxed text-muted">
          자동 복사가 되지 않는 브라우저입니다. 아래 주문 내역을 길게 눌러 직접 복사해 주세요.
        </p>
      ) : null}
    </div>
  );
}
