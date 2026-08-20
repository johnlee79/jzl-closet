'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

/**
 * 관리자 로그인.
 * 관리자 레이아웃과 같은 톤(시스템 폰트·흰 카드·파란 버튼)으로 맞춥니다.
 * 화면 가운데 카드 하나만 두고, 꾸밈은 넣지 않습니다.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/admin';

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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

      // 미들웨어가 쿠키를 다시 읽도록 새로고침합니다.
      router.replace(next.startsWith('/admin') ? next : '/admin');
      router.refresh();
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
          <p className="font-display text-[24px] font-light tracking-[0.3em] text-slate-900">
            JZL CLOSET
          </p>
          <p className="mt-1.5 text-[14px] text-slate-500">관리자 로그인</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7">
          <label htmlFor="admin-password" className="admin-label">
            비밀번호
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            className="admin-input"
            placeholder="비밀번호를 입력하세요"
          />

          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[14px] leading-relaxed text-red-700"
            >
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className="admin-btn-primary mt-5 w-full">
            {pending ? '확인 중…' : '로그인'}
          </button>
        </form>

        <p className="mt-5 border-t border-slate-200 pt-4 text-center text-[13px] leading-relaxed text-slate-500">
          한 번 로그인하면 7일 동안 유지됩니다.
        </p>
      </div>

      <p className="mt-5 text-center">
        <a href="/" className="text-[14px] text-slate-500 underline underline-offset-4">
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
