'use client';

import { useEffect } from 'react';
import { useSite } from '@/components/SiteProvider';
import {
  postcodeFallbackNotice,
  usePostcodeScript,
  type PostcodeResult,
  type PostcodeState,
} from '@/lib/postcode';

export type { PostcodeResult };

/**
 * 다음 우편번호 검색 버튼.
 * 회원가입·회원정보 수정처럼 주소를 받는 화면에서 함께 씁니다.
 *
 * ★ 스크립트는 화면에 들어오는 순간 미리 받아 둡니다. (버튼을 누를 때 기다리지 않습니다)
 * ★ 못 받으면 "다시 시도" 로 바뀌고, 직접 입력하라는 안내를 함께 띄웁니다.
 *   예전에는 "불러오는 중…" 에서 영영 멈춰 주소를 넣을 방법이 없었습니다.
 */
export default function PostcodeSearch({
  onSelect,
  className = 'btn-secondary min-h-[48px] shrink-0 px-6 py-0 text-[15px] disabled:opacity-40',
  label = '주소 검색',
  /** 실패 안내를 버튼 아래에 함께 보여 줄지 */
  showNotice = true,
  onStateChange,
}: {
  onSelect: (result: PostcodeResult) => void;
  className?: string;
  label?: string;
  showNotice?: boolean;
  /** 부모가 우편번호 칸의 readonly 를 풀 수 있도록 상태를 알려 줍니다. */
  onStateChange?: (state: PostcodeState) => void;
}) {
  const { store } = useSite();
  const { state, open, retry } = usePostcodeScript();

  useEffect(() => {
    onStateChange?.(state);
    // onStateChange 는 부모가 매번 새로 만들 수 있어 의존성에서 뺍니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const text =
    state === 'ready' ? label : state === 'loading' ? '불러오는 중…' : '주소 검색 다시 시도';

  return (
    <>
      <button
        type="button"
        onClick={() => (state === 'failed' ? retry() : void open(onSelect))}
        disabled={state === 'loading'}
        className={className}
      >
        {text}
      </button>

      {showNotice && state === 'failed' ? (
        <p
          role="alert"
          className="mt-2 w-full whitespace-pre-line text-[14px] leading-relaxed text-wine"
        >
          {postcodeFallbackNotice(store.phone)}
        </p>
      ) : null}
    </>
  );
}
