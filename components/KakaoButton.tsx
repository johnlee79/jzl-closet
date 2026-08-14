'use client';

import { useState } from 'react';

/**
 * 카카오톡 채널 버튼.
 * 관리자 > 설정 > 스토어 정보 에 채널 링크를 넣으면 그 주소로 열리고,
 * 비워 두면 지금까지처럼 "준비 중" 안내를 보여 줍니다.
 */
export default function KakaoButton({
  channelUrl,
  phone,
}: {
  channelUrl: string;
  phone: string;
}) {
  const [notice, setNotice] = useState(false);

  const className =
    'inline-block border border-stone px-6 py-3 text-[13px] tracking-[0.14em] text-ink transition-colors duration-200 hover:border-ink';

  if (channelUrl) {
    return (
      <a href={channelUrl} target="_blank" rel="noreferrer" className={className}>
        카카오톡 채널 문의
      </a>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setNotice(true)} className={className}>
        카카오톡 채널 문의
      </button>
      {notice ? (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          카카오톡 채널은 준비 중입니다. 문의는 고객센터 {phone}으로 전화 주시면 바로
          도와드리겠습니다.
        </p>
      ) : null}
    </div>
  );
}
