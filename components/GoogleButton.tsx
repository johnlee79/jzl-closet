'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { signInWithGoogleAction } from '@/app/(shop)/auth-actions';

/** 구글 정품 로고(4색)를 인라인 SVG 로 직접 그립니다. 외부 이미지를 쓰지 않습니다. */
function GoogleLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * 구글 간편로그인 버튼.
 *
 * Supabase Auth 의 Google Provider 를 씁니다.
 * 클라이언트 ID / Secret 은 Supabase 대시보드에만 있고 코드에는 들어오지 않습니다.
 *
 * ★ 구글로 처음 로그인하면 profiles 행이 없어 콜백에서 자동으로 만듭니다.
 *   그래서 버튼 아래에 약관 동의 간주 안내를 반드시 함께 보여 줍니다.
 */
export default function GoogleButton({
  /** 로그인 후 돌아갈 사이트 안쪽 주소 */
  next = '/mypage',
  label = 'Google로 계속하기',
}: {
  next?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  /**
   * 구글 응답이 느릴 때 멈춘 것으로 오해하지 않게 상태를 알려 줍니다.
   *   0  아직 시작 전
   *   1  연결 중
   *   2  3초 넘음 — "곧 연결됩니다" 안내
   *   3  15초 넘음 — 실패로 보고 다시 시도 버튼
   */
  const [stage, setStage] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  // 화면을 떠날 때 타이머를 정리합니다.
  useEffect(() => clearTimers, []);

  const start = () => {
    // ★ 중복 클릭 차단. 여러 번 누르면 인증 요청이 겹쳐 더 느려집니다.
    if (pending || stage === 1 || stage === 2) return;

    setError('');
    setStage(1);
    clearTimers();
    timers.current.push(window.setTimeout(() => setStage(2), 3000));
    timers.current.push(window.setTimeout(() => setStage(3), 15000));

    startTransition(async () => {
      const result = await signInWithGoogleAction(next);
      if (!result.ok) {
        clearTimers();
        setStage(0);
        setError(result.error);
        return;
      }
      // 구글 동의 화면으로 넘어갑니다. (여기서 페이지가 통째로 바뀝니다)
      window.location.assign(result.data.url);
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={stage === 1 || stage === 2}
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-sm border border-[#DADCE0] bg-white px-6 text-[15px] font-medium text-[#1F1F1F] transition-colors duration-200 hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleLogo />
        {stage === 0 ? label : stage === 3 ? '다시 시도하기' : '연결 중…'}
      </button>

      {stage === 2 ? (
        <p role="status" className="mt-3 text-center text-[13px] leading-relaxed text-muted">
          잠시만 기다려 주세요. 곧 연결됩니다.
        </p>
      ) : null}

      {stage === 3 ? (
        <p role="alert" className="mt-3 text-center text-[13px] leading-relaxed text-wine">
          연결이 오래 걸리고 있습니다. 위 버튼으로 다시 시도해 주세요.
        </p>
      ) : null}

      {/* TODO: 카카오 로그인 버튼 */}
      {/* TODO: 네이버 로그인 버튼 */}

      {error ? (
        <p role="alert" className="mt-3 text-center text-[13px] leading-relaxed text-wine">
          {error}
        </p>
      ) : null}

      {/* ★ 소셜 로그인은 약관 동의 화면을 따로 거치지 않습니다. 반드시 안내합니다. */}
      <p className="mt-3 text-center text-[12px] leading-relaxed text-muted">
        가입 시{' '}
        <Link href="/terms" target="_blank" className="underline underline-offset-2">
          이용약관
        </Link>
        과{' '}
        <Link href="/privacy" target="_blank" className="underline underline-offset-2">
          개인정보처리방침
        </Link>
        에 동의하는 것으로 간주됩니다
      </p>
    </div>
  );
}

/** 소셜 버튼과 이메일 폼 사이의 "또는" 구분선 */
export function OrDivider({ label = '또는' }: { label?: string }) {
  return (
    <div className="my-7 flex items-center gap-4" role="separator">
      <span aria-hidden="true" className="h-px flex-1 bg-stone" />
      <span className="text-[13px] tracking-[0.14em] text-muted">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-stone" />
    </div>
  );
}
