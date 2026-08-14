'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { authButtonClass, authInputClass } from '@/components/AuthCard';
import SignupPointBadge from '@/components/SignupPointBadge';
import GoogleButton, { OrDivider } from '@/components/GoogleButton';
import ResendVerification from '@/components/ResendVerification';
import { loginAction } from '@/app/(shop)/auth-actions';

/** 콜백이 붙여 보내는 안내 (링크 만료·구글 취소 등) */
const LINK_MESSAGES: Record<string, string> = {
  expired: '링크가 만료되었습니다. 다시 시도해 주세요.',
  link: '잘못된 링크입니다. 메일의 주소를 다시 확인해 주세요.',
  auth: '로그인 기능이 아직 설정되지 않았습니다.',
  cancelled: '구글 로그인을 취소하셨습니다.',
  oauth: '구글 로그인 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
  profile: '회원 정보를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  withdrawn: '탈퇴한 계정입니다. 새로 가입해 주시거나 고객센터로 문의해 주세요.',
  inactive: '이용이 제한된 계정입니다. 고객센터로 문의해 주세요.',
};

/**
 * ★ next·error 는 서버 페이지가 searchParams 로 읽어 넘겨 줍니다.
 *   여기서 useSearchParams 를 쓰면 폼 전체가 Suspense 로 감싸여
 *   서버 HTML 이 비고 화면이 한 번 깜빡입니다.
 */
export default function LoginForm({
  next = '/mypage',
  linkError = '',
}: {
  next?: string;
  linkError?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // ★ Supabase 세션은 기본으로 유지됩니다. 체크를 끄면 브라우저를 닫을 때 지웁니다.
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [error, setError] = useState(LINK_MESSAGES[linkError] ?? '');
  /** 인증 메일을 아직 누르지 않은 계정이면 재전송 버튼을 함께 보여 줍니다. */
  const [needsVerification, setNeedsVerification] = useState(false);

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/mypage';

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError('');
    setNeedsVerification(false);
    startTransition(async () => {
      const result = await loginAction(email, password);
      if (!result.ok) {
        setError(result.error);
        setNeedsVerification(Boolean(result.needsVerification));
        return;
      }
      if (!keepLoggedIn) {
        // 브라우저를 닫으면 로그아웃되도록 표시만 남깁니다.
        try {
          window.sessionStorage.setItem('jzl-session-only', '1');
        } catch {
          // 저장 공간이 없으면 무시합니다.
        }
      }
      router.replace(safeNext);
      router.refresh();
    });
  };

  return (
    <div>
      {/* ── 1. 구글 간편로그인 ─────────────────────────── */}
      <GoogleButton next={safeNext} />

      <OrDivider />

      {/* ── 2. 이메일 로그인 ───────────────────────────── */}
      {error ? (
        <div
          role="alert"
          className="mb-6 border border-wine bg-wine/5 px-4 py-3 text-[14px] leading-relaxed text-wine"
        >
          {error}
          {needsVerification ? (
            <div className="mt-3">
              <p className="text-[13px] leading-relaxed text-ink">
                가입하실 때 보내드린 메일의 인증 링크를 눌러 주세요. 메일이 보이지 않으면
                스팸함도 확인해 주세요.
              </p>
              <div className="mt-3">
                <ResendVerification email={email} compact />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={submit} noValidate>
        <div className="text-left">
          <label htmlFor="login-email" className="label-xs block">
            이메일
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className={authInputClass}
          />
        </div>

        <div className="mt-5 text-left">
          <label htmlFor="login-password" className="label-xs block">
            비밀번호
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className={authInputClass}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={keepLoggedIn}
              onChange={(event) => setKeepLoggedIn(event.target.checked)}
              className="h-4 w-4"
            />
            로그인 상태 유지
          </label>
          <Link
            href="/reset-password"
            className="text-[14px] text-muted underline underline-offset-4"
          >
            비밀번호를 잊으셨나요?
          </Link>
        </div>

        {/* 아직 회원이 아닌 분에게 가입 혜택을 알려 줍니다. */}
        <div className="mt-7 flex justify-center">
          <SignupPointBadge />
        </div>

        <button type="submit" disabled={pending} className={`${authButtonClass} mt-4`}>
          {pending ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
