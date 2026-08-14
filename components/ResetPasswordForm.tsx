'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { authButtonClass, authInputClass } from '@/components/AuthCard';
import {
  requestPasswordResetAction,
  updatePasswordAction,
} from '@/app/(shop)/auth-actions';

const inputClass = authInputClass;

/** 화면에 그대로 쓰는 소셜 이름 */
const SOCIAL_LABEL: Record<string, string> = {
  google: 'Google',
  kakao: '카카오',
  naver: '네이버',
};

/** 1단계 — 메일 보내기 */
export function RequestResetForm() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  /** 간편가입 계정이면 어느 소셜인지. 비어 있으면 일반 이메일 계정입니다. */
  const [social, setSocial] = useState('');

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
      setSocial(result.data.socialProvider);
      setSent(true);
    });
  };

  // ★ 간편가입 계정에는 비밀번호가 없습니다. 메일을 보내도 할 수 있는 일이 없으므로
  //   어느 소셜로 가입했는지만 알려 줍니다.
  if (sent && social) {
    return (
      <div className="text-left">
        <div className="border border-stone bg-paper px-5 py-4 text-[15px] leading-relaxed text-ink">
          <p className="font-medium">이 계정은 {SOCIAL_LABEL[social] ?? social} 계정으로 가입하셨습니다.</p>
          <p className="mt-1.5">
            로그인 화면에서 &lsquo;{SOCIAL_LABEL[social] ?? social}로 계속하기&rsquo;를 눌러 주세요.
          </p>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          소셜 계정의 비밀번호는 {SOCIAL_LABEL[social] ?? social}에서 관리합니다. JZL CLOSET 에는
          따로 저장된 비밀번호가 없습니다.
        </p>
        <Link href="/login" className={`${authButtonClass} mt-6`}>
          로그인 화면으로
        </Link>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="text-left">
        <div className="border border-amber-300 bg-amber-50 px-5 py-4 text-[14px] leading-relaxed text-amber-900">
          <p className="font-medium">메일을 보냈습니다</p>
          <p className="mt-1.5">
            가입된 이메일이라면 <strong className="break-all">{email}</strong> 으로 재설정
            링크를 보내드렸습니다. 메일이 보이지 않으면 스팸함(정크메일)도 확인해 주세요.
          </p>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          보안을 위해 가입 여부는 알려드리지 않습니다.
        </p>
        <Link href="/login" className={`${authButtonClass} mt-6`}>
          로그인 화면으로
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="text-left">
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

      <button type="submit" disabled={pending} className={`${authButtonClass} mt-7`}>
        {pending ? '보내는 중…' : '재설정 메일 받기'}
      </button>
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
      <div>
        <p className="text-[15px] leading-relaxed text-ink">
          비밀번호를 바꿨습니다. 새 비밀번호로 로그인되어 있습니다.
        </p>
        <Link href="/mypage" className={`${authButtonClass} mt-6`}>
          마이페이지로
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="text-left">
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

      <button type="submit" disabled={pending} className={`${authButtonClass} mt-7`}>
        {pending ? '저장 중…' : '비밀번호 바꾸기'}
      </button>
    </form>
  );
}
