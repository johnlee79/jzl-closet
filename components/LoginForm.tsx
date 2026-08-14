'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { loginAction } from '@/app/(shop)/auth-actions';

/** 링크가 만료됐을 때 콜백이 붙여 보내는 안내 */
const LINK_MESSAGES: Record<string, string> = {
  expired: '링크가 만료되었습니다. 다시 시도해 주세요.',
  link: '잘못된 링크입니다. 메일의 주소를 다시 확인해 주세요.',
  auth: '로그인 기능이 아직 설정되지 않았습니다.',
};

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // ★ Supabase 세션은 기본으로 유지됩니다. 체크를 끄면 브라우저를 닫을 때 지웁니다.
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [error, setError] = useState(LINK_MESSAGES[params.get('error') ?? ''] ?? '');

  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/mypage';

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError('');
    startTransition(async () => {
      const result = await loginAction(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!keepLoggedIn) {
        // 브라우저를 닫으면 로그아웃되도록 표시만 남깁니다.
        // (세션 쿠키 자체는 서버가 관리하므로 여기서는 안내용 플래그만 둡니다)
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

  const inputClass =
    'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

  return (
    <form onSubmit={submit} noValidate className="mt-12 max-w-[440px]">
      {error ? (
        <p
          role="alert"
          className="mb-6 border border-wine bg-wine/5 px-5 py-4 text-[15px] leading-relaxed text-wine"
        >
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="login-email" className="label-xs block">
          이메일
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoFocus
          className={inputClass}
        />
      </div>

      <div className="mt-5">
        <label htmlFor="login-password" className="label-xs block">
          비밀번호
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className={inputClass}
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

      <button type="submit" disabled={pending} className="btn-primary mt-8 w-full">
        {pending ? '확인 중…' : '로그인'}
      </button>

      <p className="mt-6 text-center text-[14px] text-ink">
        아직 회원이 아니신가요?{' '}
        <Link href="/signup" className="link-wine">
          회원가입
        </Link>
      </p>

      <div className="mt-8 border-t border-stone pt-6">
        <p className="text-[13px] leading-relaxed text-muted">
          회원가입 없이도 주문하실 수 있습니다. 이미 비회원으로 주문하셨다면{' '}
          <Link href="/order-lookup" className="link-wine">
            주문 조회
          </Link>
          에서 주문번호와 연락처로 확인해 주세요.
        </p>
      </div>
    </form>
  );
}
