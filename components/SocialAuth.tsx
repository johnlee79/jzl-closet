'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  signInWithGoogleAction,
  signInWithKakaoAction,
} from '@/app/(shop)/auth-actions';

/**
 * ============================================================
 * 소셜 간편로그인 버튼 (구글 · 카카오)
 * ============================================================
 *
 * ★ 두 버튼이 하는 일이 똑같습니다. 색과 부르는 액션만 다릅니다.
 *   그래서 진행 표시(3-C)·중복 클릭 차단·오류 안내를 SocialButton 하나에 두고
 *   구글·카카오는 그 껍데기만 다르게 씌웁니다.
 *   예전처럼 버튼마다 타이머 코드를 복사해 두면 한쪽만 고쳐집니다.
 *
 * ★ 로고는 전부 인라인 SVG 입니다. 외부 이미지·이모지를 쓰지 않습니다.
 * ★ 그림자를 쓰지 않습니다. 테두리와 배경색만으로 구분합니다.
 */

/** 카카오 상징색 — 브랜드 가이드에서 정한 값이라 우리 토큰을 쓰지 않습니다. */
const KAKAO_YELLOW = '#FEE500';
const KAKAO_INK = '#191919';

/**
 * 두 버튼이 공유하는 크기·모서리·간격.
 * ★ 여기 한 줄만 고치면 구글·카카오가 같이 움직입니다. 높이가 어긋날 수 없습니다.
 */
const SOCIAL_BUTTON =
  'inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-sm px-6 text-[16px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50';

/** 구글 정품 로고(4색)를 인라인 SVG 로 직접 그립니다. */
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
 * 카카오 심볼 — 말풍선 안에 있는 그 모양입니다.
 * ★ 글씨색(#191919)과 같은 색으로 그려 노란 바탕 위에서 한 덩어리로 보이게 합니다.
 */
function KakaoSymbol() {
  return (
    <svg
      width="18"
      height="17"
      viewBox="0 0 18 17"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill={KAKAO_INK}
        d="M9 0.9C4.3 0.9 0.5 3.9 0.5 7.6c0 2.4 1.6 4.5 4 5.7-.2.6-.7 2.3-.8 2.7 0 .2.1.3.3.2.2-.1 2.5-1.7 3.5-2.4.5.1 1 .1 1.5.1 4.7 0 8.5-3 8.5-6.7S13.7.9 9 .9z"
      />
    </svg>
  );
}

type StartAction = (next: string) => Promise<
  { ok: true; data: { url: string } } | { ok: false; error: string }
>;

type SocialButtonProps = {
  action: StartAction;
  next: string;
  label: string;
  icon: React.ReactNode;
  /** 버튼 껍데기(배경·글씨·테두리)만 지정합니다. 크기는 SOCIAL_BUTTON 이 잡습니다. */
  skin: string;
  style?: React.CSSProperties;
  onError: (message: string) => void;
  /** 다른 소셜 버튼이 진행 중이면 같이 잠급니다. */
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
};

/**
 * 소셜 버튼 한 개.
 *
 * 진행 상태 (3-C 에서 정한 규칙 그대로)
 *   0  아직 시작 전
 *   1  연결 중
 *   2  3초 넘음 — "곧 연결됩니다" 안내
 *   3  15초 넘음 — 실패로 보고 다시 시도 버튼
 */
function SocialButton({
  action,
  next,
  label,
  icon,
  skin,
  style,
  onError,
  busy,
  onBusyChange,
}: SocialButtonProps) {
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  // 화면을 떠날 때 타이머를 정리합니다.
  useEffect(() => clearTimers, []);

  const running = stage === 1 || stage === 2;

  const start = () => {
    // ★ 중복 클릭 차단. 여러 번 누르면 인증 요청이 겹쳐 더 느려집니다.
    //   다른 소셜 버튼이 돌고 있을 때도 막습니다.
    if (pending || running || busy) return;

    onError('');
    setStage(1);
    onBusyChange(true);
    clearTimers();
    timers.current.push(window.setTimeout(() => setStage(2), 3000));
    timers.current.push(window.setTimeout(() => setStage(3), 15000));

    startTransition(async () => {
      const result = await action(next);
      if (!result.ok) {
        clearTimers();
        setStage(0);
        onBusyChange(false);
        onError(result.error);
        return;
      }
      // 동의 화면으로 넘어갑니다. (여기서 페이지가 통째로 바뀝니다)
      window.location.assign(result.data.url);
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={running || (busy && !running)}
        style={style}
        className={`${SOCIAL_BUTTON} ${skin}`}
      >
        {icon}
        {stage === 0 ? label : stage === 3 ? '다시 시도하기' : '연결 중…'}
      </button>

      {stage === 2 ? (
        <p role="status" className="mt-3 text-center text-[14px] leading-relaxed text-muted">
          잠시만 기다려 주세요. 곧 연결됩니다.
        </p>
      ) : null}

      {stage === 3 ? (
        <p role="alert" className="mt-3 text-center text-[14px] leading-relaxed text-wine">
          연결이 오래 걸리고 있습니다. 위 버튼으로 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  );
}

/**
 * 로그인·회원가입 화면 맨 위의 간편로그인 묶음.
 *
 * ★ 소셜 로그인은 약관 동의 화면을 따로 거치지 않습니다.
 *   그래서 버튼 아래에 동의 간주 안내를 반드시 함께 보여 줍니다.
 *   (처음 들어오면 콜백에서 profiles 행을 자동으로 만듭니다)
 */
export default function SocialAuthButtons({
  /** 로그인 후 돌아갈 사이트 안쪽 주소 */
  next = '/mypage',
}: {
  next?: string;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <div className="flex flex-col gap-3">
        <SocialButton
          action={signInWithGoogleAction}
          next={next}
          label="Google로 계속하기"
          icon={<GoogleLogo />}
          skin="border border-[#DADCE0] bg-white text-[#1F1F1F] hover:bg-[#F8F9FA]"
          onError={setError}
          busy={busy}
          onBusyChange={setBusy}
        />

        <SocialButton
          action={signInWithKakaoAction}
          next={next}
          label="카카오로 계속하기"
          icon={<KakaoSymbol />}
          skin="hover:opacity-90"
          style={{ backgroundColor: KAKAO_YELLOW, color: KAKAO_INK }}
          onError={setError}
          busy={busy}
          onBusyChange={setBusy}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-center text-[14px] leading-relaxed text-wine">
          {error}
        </p>
      ) : null}

      {/* TODO: 네이버 로그인 버튼 — Supabase 미지원이라 직접 붙여야 합니다. */}

      <p className="mt-3 text-center text-[13px] leading-relaxed text-muted">
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
      <span className="text-[14px] tracking-[0.14em] text-muted">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-stone" />
    </div>
  );
}
