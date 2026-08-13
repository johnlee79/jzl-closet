'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/admin/products';

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
      router.replace(next.startsWith('/admin') ? next : '/admin/products');
      router.refresh();
    } catch {
      setError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="admin-card w-full max-w-[380px] p-8">
      <h1 className="text-[20px] font-semibold text-slate-900">JZL CLOSET 관리자</h1>
      <p className="mt-2 text-[14px] text-slate-600">
        비밀번호를 입력하시면 7일 동안 로그인 상태가 유지됩니다.
      </p>

      <div className="mt-6">
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
          placeholder="비밀번호"
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-red-700">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="admin-btn-primary mt-6 w-full">
        {pending ? '확인 중…' : '로그인'}
      </button>

      <a
        href="/"
        className="mt-4 block text-center text-[13px] text-slate-500 underline underline-offset-4"
      >
        쇼핑몰 화면으로 돌아가기
      </a>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="admin-root flex min-h-screen items-center justify-center p-5">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
