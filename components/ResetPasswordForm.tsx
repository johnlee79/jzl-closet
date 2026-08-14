'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  requestPasswordResetAction,
  updatePasswordAction,
} from '@/app/(shop)/auth-actions';

const inputClass =
  'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

/** 1단계 — 메일 보내기 */
export function RequestResetForm() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError('');
    startTransition(async () => {
      const result = await requestPasswordResetAction(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <div className="mt-12 max-w-[480px] border border-stone p-6 md:p-8">
        <h2 className="font-serif text-[20px] text-ink">메일을 보냈습니다</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-ink">
          가입된 이메일이라면 <strong>{email}</strong> 으로 재설정 링크를 보내드렸습니다.
          메일이 보이지 않으면 스팸함도 확인해 주세요.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          보안을 위해 가입 여부는 알려드리지 않습니다.
        </p>
        <Link href="/login" className="btn-secondary mt-6">
          로그인 화면으로
        </Link>
      </div>
    );
  }

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

      <label htmlFor="reset-email" className="label-xs block">
        가입하신 이메일
      </label>
      <input
        id="reset-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        autoFocus
        placeholder="hello@example.com"
        className={inputClass}
      />

      <button type="submit" disabled={pending} className="btn-primary mt-8 w-full">
        {pending ? '보내는 중…' : '재설정 메일 받기'}
      </button>

      <p className="mt-6 text-center text-[14px]">
        <Link href="/login" className="link-wine">
          로그인 화면으로 돌아가기
        </Link>
      </p>
    </form>
  );
}

/** 2단계 — 메일 링크로 들어와 새 비밀번호 정하기 */
export function UpdatePasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const rules = [
    { label: '8자 이상', ok: password.length >= 8 },
    { label: '영문 포함', ok: /[A-Za-z]/.test(password) },
    { label: '숫자 포함', ok: /[0-9]/.test(password) },
  ];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError('');
    startTransition(async () => {
      const result = await updatePasswordAction(password, passwordConfirm);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  if (done) {
    return (
      <div className="mt-12 max-w-[480px] border border-stone p-6 md:p-8">
        <h2 className="font-serif text-[20px] text-ink">비밀번호를 바꿨습니다</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-ink">
          새 비밀번호로 로그인되어 있습니다.
        </p>
        <Link href="/mypage" className="btn-primary mt-6">
          마이페이지로
        </Link>
      </div>
    );
  }

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
        <label htmlFor="new-password" className="label-xs block">
          새 비밀번호
        </label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          autoFocus
          className={inputClass}
        />
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {rules.map((rule) => (
            <li
              key={rule.label}
              className={`text-[13px] ${rule.ok ? 'text-ink' : 'text-muted'}`}
            >
              {rule.ok ? '✓' : '·'} {rule.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <label htmlFor="new-password-confirm" className="label-xs block">
          새 비밀번호 확인
        </label>
        <input
          id="new-password-confirm"
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      <button type="submit" disabled={pending} className="btn-primary mt-8 w-full">
        {pending ? '저장 중…' : '비밀번호 바꾸기'}
      </button>
    </form>
  );
}
