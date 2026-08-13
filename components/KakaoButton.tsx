'use client';

import { useState } from 'react';
import { store } from '@/lib/store';

export default function KakaoButton() {
  const [notice, setNotice] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setNotice(true)}
        className="border border-stone px-6 py-3 text-[12px] tracking-[0.14em] text-ink transition-colors duration-200 hover:border-ink"
      >
        카카오톡 채널 문의
      </button>
      {notice ? (
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          카카오톡 채널은 준비 중입니다. 문의는 고객센터 {store.phone}으로 전화 주시면
          바로 도와드리겠습니다.
        </p>
      ) : null}
    </div>
  );
}
