'use client';

import type { Feedback } from '@/lib/use-save';

/**
 * 저장 결과 안내 한 줄.
 *
 * ★ 손님 화면과 관리자 화면이 같은 컴포넌트를 씁니다.
 *   생김새만 admin 여부로 갈립니다. 문구가 뜨는 방식은 어디서나 같습니다.
 *
 * ★ role="status" + aria-live="polite"
 *   화면을 읽어 주는 프로그램에도 "저장되었습니다" 가 전달됩니다.
 *   눈으로만 확인되는 안내는 안내가 아닙니다.
 *
 * ★ 이모지를 쓰지 않습니다. 성공·실패 표시는 SVG 로 직접 그립니다.
 */
export default function SaveFeedback({
  feedback,
  /** 관리자 화면이면 true — 둥근 모서리와 관리자 색을 씁니다. */
  admin = false,
  className = '',
}: {
  feedback: Feedback;
  admin?: boolean;
  className?: string;
}) {
  if (!feedback) return null;

  const ok = feedback.tone === 'ok';

  const tone = admin
    ? ok
      ? 'bg-green-50 text-green-800'
      : 'bg-red-50 text-red-700'
    : ok
      ? 'border border-ink text-ink'
      : 'border border-wine text-wine';

  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2 px-3 py-2 text-[15px] leading-relaxed ${
        admin ? 'rounded-md' : ''
      } ${tone} ${className}`}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {ok ? (
          // 체크 표시
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8.5l3.5 3.5L13 5" />
          </svg>
        ) : (
          // 느낌표 (동그라미 + 세로선 + 점)
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.8v4" />
            <path d="M8 11.1v.1" />
          </svg>
        )}
      </span>
      <span>{feedback.text}</span>
    </p>
  );
}
