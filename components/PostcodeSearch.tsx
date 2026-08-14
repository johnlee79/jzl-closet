'use client';

import Script from 'next/script';
import { useState } from 'react';

/**
 * 다음 우편번호 검색 버튼.
 * 라이브러리를 설치하지 않고 스크립트만 불러 씁니다.
 * 회원가입·회원정보 수정처럼 주소를 받는 화면에서 함께 씁니다.
 */
const POSTCODE_SRC =
  'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

export type PostcodeResult = { postcode: string; address: string };

export default function PostcodeSearch({
  onSelect,
  className = 'btn-secondary min-h-[48px] shrink-0 px-6 py-0 text-[14px] disabled:opacity-40',
  label = '주소 검색',
}: {
  onSelect: (result: PostcodeResult) => void;
  className?: string;
  label?: string;
}) {
  const [ready, setReady] = useState(false);

  const open = () => {
    if (!window.daum?.Postcode) return;
    new window.daum.Postcode({
      oncomplete: (data) => {
        const base = data.roadAddress || data.jibunAddress;
        const building = data.buildingName ? ` (${data.buildingName})` : '';
        onSelect({ postcode: data.zonecode, address: `${base}${building}` });
      },
    }).open();
  };

  return (
    <>
      <Script src={POSTCODE_SRC} strategy="afterInteractive" onLoad={() => setReady(true)} />
      <button type="button" onClick={open} disabled={!ready} className={className}>
        {ready ? label : '불러오는 중…'}
      </button>
    </>
  );
}
