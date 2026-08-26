'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { adminEmailLoginAction } from '@/app/admin/login-actions';

/**
 * 관리자 로그인.
 * 관리자 레이아웃과 같은 톤(시스템 폰트·흰 카드·파란 버튼)으로 맞춥니다.
 * 화면 가운데 카드 하나만 두고, 꾸밈은 넣지 않습니다.
 *
 * ★★ 두 가지 길이 함께 열려 있습니다. (전환 중)
 *   위  — 이메일 + 비밀번호 (새 길)
 *   아래 — 비밀번호 하나 (옛 길)
 *
 *   어느 쪽으로도 들어갈 수 있습니다. 새 길을 준비하는 동안,
 *   또는 새 길에 문제가 생겼을 때 잠기지 않게 하기 위해서입니다.
 *   옛 길은 4단계에서 닫습니다. 그때 아래 칸을 지웁니다.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/admin';

  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  /** 어느 쪽으로 들어왔든 같은 곳으로 보냅니다. */
  const goIn = () => {
    // 미들웨어가 쿠키를 다시 읽도록 새로고침합니다.
    router.replace(next.startsWith('/admin') ? next : '/admin');
    router.refresh();
  };

  /* ── 새 길 — 이메일 + 비밀번호 ────────────────────── */
  const handleEmailLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError('');
    try {
      const result = await adminEmailLoginAction(email, emailPassword);
      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return;
      }
      goIn();
    } catch {
      setError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setPending(false);
    }
  };

  /* ── 옛 길 — 비밀번호 하나 ────────────────────────── */
  const handlePasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 비밀번호는 여기서 서버로 보내기만 하고, 대조는 서버에서만 합니다.
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? '로그인에 실패했습니다.');
        setPending(false);
        return;
      }
      goIn();
    } catch {
      setError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-[400px]">
      <div className="admin-card p-7 md:p-8">
        {/* 로고 — 프론트와 같은 글자, 관리자 화면에 맞게 크기만 줄였습니다. */}
        <div className="text-center">
          <p className="font-display text-[26px] font-light tracking-[0.3em] text-slate-900">
            JZL CLOSET
          </p>
          <p className="mt-1.5 text-[15px] text-slate-500">관리자 로그인</p>
        </div>

        {/* ── 이메일 로그인 ─────────────────────────── */}
        <form onSubmit={handleEmailLogin} className="mt-7">
          <label htmlFor="admin-email" className="admin-label">
            이메일
          </label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoFocus
            className="admin-input"
            placeholder="admin@example.com"
          />

          <label htmlFor="admin-email-password" className="admin-label mt-3 block">
            비밀번호
          </label>
          <input
            id="admin-email-password"
            type="password"
            value={emailPassword}
            onChange={(event) => setEmailPassword(event.target.value)}
            autoComplete="current-password"
            className="admin-input"
            placeholder="비밀번호"
          />

          <button
            type="submit"
            disabled={pending || !email.trim() || !emailPassword}
            className="admin-btn-primary mt-4 w-full"
          >
            {pending ? '확인 중…' : '로그인'}
          </button>
        </form>

        {/*
          ── 옛 길 ──────────────────────────────────
          ★ 4단계에서 이 아래를 통째로 지웁니다.
            그때까지는 남겨 둡니다. 새 길에 문제가 생겨도 들어올 수 있어야 합니다.
        */}
        <form onSubmit={handlePasswordLogin} className="mt-6 border-t border-slate-200 pt-5">
          <label htmlFor="admin-password" className="admin-label">
            또는 관리자 비밀번호
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            className="admin-input"
            placeholder="예전 방식"
          />
          <button
            type="submit"
            disabled={pending || !password}
            className="admin-btn mt-3 w-full"
          >
            {pending ? '확인 중…' : '비밀번호로 로그인'}
          </button>
        </form>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-[15px] leading-relaxed text-red-700"
          >
            {error}
          </p>
        ) : null}

        {/*
          ★★ 두 로그인의 유지 시간이 다릅니다. (2026-08-26)
            전에는 "한 번 로그인하면 7일 동안 유지됩니다" 한 줄이었습니다.
            그 7일은 아래 [관리자 비밀번호] 쿠키(lib/admin-auth.ts 의
            SESSION_MAX_AGE)를 말하는 것입니다. 위 이메일 로그인은 Supabase
            세션이라 수명이 다른데, 문구가 둘을 뭉뚱그려 "7일" 이라고
            약속하고 있었습니다. 실제로는 그보다 훨씬 자주 끊깁니다.
        */}
        <p className="mt-5 border-t border-slate-200 pt-4 text-center text-[14px] leading-relaxed text-slate-500">
          아래 <strong>관리자 비밀번호</strong>로 들어오시면 7일 동안 유지됩니다.
          <br />
          위 이메일 로그인은 유지 시간이 이보다 짧아, 한동안 쓰지 않으면 다시 로그인이
          필요합니다.
        </p>
      </div>

      <p className="mt-5 text-center">
        <a href="/" className="text-[15px] text-slate-500 underline underline-offset-4">
          쇼핑몰 화면으로 돌아가기
        </a>
      </p>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="admin-root flex min-h-screen items-center justify-center bg-slate-100 p-5">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
