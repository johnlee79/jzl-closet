'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  signInWithGoogleAction,
  signInWithKakaoAction,
} from '@/app/(shop)/auth-actions';
import { isLeaving, markLeaving } from '@/lib/leaving';

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
  /**
   * * 안내 문구와 로그에 쓰는 짧은 이름입니다. (예: '구글' · '카카오')
   *   label 은 버튼에 적는 글자라("Google로 계속하기") 문장에 넣으면
   *   "Google로 계속하기 로그인을 시작하지 못했습니다" 처럼 어색해집니다.
   *   서버(app/(shop)/auth-actions.ts)가 쓰는 이름과 같게 맞춥니다.
   */
  name: string;
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
  name,
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
      try {
        const result = await action(next);
        if (!result.ok) {
          clearTimers();
          setStage(0);
          onBusyChange(false);
          onError(result.error);
          return;
        }
      /*
       * ============================================================
       * ★★ 떠나는 중이라고 표시합니다 (2026-08-25)
       * ============================================================
       *
       * ★★ 지금은 이 한 줄만 넣습니다. 일부러 그렇게 합니다.
       *   아이폰에서 이 버튼을 누르면 오류 화면이 잠깐 뜹니다.
       *   그것이 "떠나면서 끊긴 것" 인지 "진짜 고장" 인지 아직 모릅니다.
       *   이 표시가 있어야 다음에 눌렀을 때 화면으로 갈립니다.
       *     로딩 화면이 뜬다  → 떠나면서 끊긴 것 (고장 아님)
       *     안내 화면이 뜬다  → 진짜 고장. 다른 원인이 있습니다
       *   구분이 되기 전에 try/catch 로 덮으면 원인을 영영 못 봅니다.
       *
       * ★ 이 말이 그대로 손님 화면에 뜹니다. 어디로 가는지 적습니다.
       * ★ assign() 바로 앞이어야 합니다. 뒤에 두면 늦습니다.
       */
        markLeaving('로그인 화면으로 이동하고 있습니다');

        /*
         * ============================================================
         * ** 떠나기 전에 타이머를 끕니다 (2026-08-26)
         * ============================================================
         *
         * ** 3초 뒤와 15초 뒤에 화면을 바꾸도록 걸어 둔 타이머가 있습니다.
         *   여기까지 왔으면 동의 화면으로 넘어가는 중이라 그 타이머가
         *   할 일이 없습니다.
         *
         *   그런데 아이폰 사파리는 다른 화면으로 넘어갈 때 이 화면을
         *   버리지 않고 **얼려 두었다가 뒤로가기로 되살립니다.**
         *   (bfcache) 되살아나면 얼어 있던 타이머가 마저 돌아서,
         *   손님이 뒤로가기로 돌아온 순간 "다시 시도하기" 로 바뀌거나
         *   "잠시만 기다려 주세요" 가 뜹니다. 아무것도 안 하고 있는데요.
         *
         * * assign() 바로 앞이어야 합니다. 뒤에 두면 이미 늦습니다.
         */
        clearTimers();

        // 동의 화면으로 넘어갑니다. (여기서 페이지가 통째로 바뀝니다)
        window.location.assign(result.data.url);
      } catch (error) {
        /*
         * ============================================================
         * ** 여기서 끊기는 것을 고장으로 오해하지 않습니다 (2026-08-26)
         * ============================================================
         *
         * ** 아이폰에서 이 버튼을 누르면 오류 화면이 잠깐 떴습니다.
         *   서버 액션 응답을 받는 도중에 페이지가 통째로 바뀌면, 그 요청이
         *   중간에 끊기면서 여기로 옵니다. 고장이 아니라 떠나는 중입니다.
         *
         * ** 그래서 markLeaving 이 켜져 있으면 조용히 넘어갑니다.
         *   손님은 이미 동의 화면으로 가고 있습니다. 그 위에 오류를 띄우면
         *   멀쩡히 되는 로그인을 실패한 것처럼 보이게 만듭니다.
         *
         * ** 진짜 실패는 반드시 알립니다.
         *   떠나는 중이 아닌데 여기로 왔다면 인증 시작 자체가 안 된 것입니다.
         *   그때는 버튼을 되돌리고 무엇을 하면 되는지 알려 줍니다.
         *
         * * 어느 쪽이든 로그는 남깁니다. 조용히 지나가면 나중에 아무도
         *   못 찾습니다. 떠나는 중인지 아닌지도 함께 적습니다.
         */
        const detail = error instanceof Error ? error.message : String(error);
        if (isLeaving()) {
          console.warn(`[auth] ${name} 로그인 — 떠나는 중에 끊겼습니다 (정상): ${detail}`);
          return;
        }

        console.warn(`[auth] ${name} 로그인을 시작하지 못했습니다: ${detail}`);
        clearTimers();
        setStage(0);
        onBusyChange(false);
        onError(
          `${name} 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주시거나 이메일로 로그인해 주세요.`
        );
      }
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
          name="구글"
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
          name="카카오"
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
