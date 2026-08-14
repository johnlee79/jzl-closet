'use client';

import { useEffect, useState, useTransition } from 'react';
import { resendVerificationAction } from '@/app/(shop)/auth-actions';

/**
 * 인증 메일 다시 보내기 버튼.
 * 메일 폭탄을 막기 위해 한 번 보내면 60초 동안 잠그고 남은 시간을 보여 줍니다.
 * (서버에서도 IP 기준으로 한 번 더 제한합니다)
 */
const COOLDOWN_SECONDS = 60;

export default function ResendVerification({
  email,
  /** 로그인 화면 안내처럼 좁은 자리에 넣을 때 */
  compact = false,
}: {
  email: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [left, setLeft] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // 남은 시간을 1초씩 줄입니다.
  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = window.setTimeout(() => setLeft((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);

  const send = () => {
    if (pending || left > 0) return;
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await resendVerificationAction(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage('인증 메일을 다시 보냈습니다. 메일함을 확인해 주세요.');
      setLeft(COOLDOWN_SECONDS);
    });
  };

  const disabled = pending || left > 0 || !email.trim();

  return (
    <div>
      <button
        type="button"
        onClick={send}
        disabled={disabled}
        className={
          compact
            ? 'inline-flex min-h-[44px] items-center justify-center border border-stone px-5 text-[14px] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40'
            : 'inline-flex min-h-[52px] w-full items-center justify-center rounded-sm border border-ink px-6 text-[15px] tracking-[0.14em] text-ink transition-colors duration-200 hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-30'
        }
      >
        {pending
          ? '보내는 중…'
          : left > 0
            ? `다시 보내기 (${left}초 후 가능)`
            : '인증 메일 다시 보내기'}
      </button>

      {message ? (
        <p role="status" className="mt-3 text-[13px] leading-relaxed text-ink">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] leading-relaxed text-wine">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 메일함 바로 열기.
 * 주소의 도메인을 보고 해당 서비스의 웹메일로 보냅니다.
 * 표에 없는 도메인이면 버튼 자체를 그리지 않습니다.
 */
const MAILBOX_URLS: Record<string, { label: string; url: string }> = {
  'gmail.com': { label: 'Gmail', url: 'https://mail.google.com' },
  'googlemail.com': { label: 'Gmail', url: 'https://mail.google.com' },
  'naver.com': { label: '네이버 메일', url: 'https://mail.naver.com' },
  'daum.net': { label: '다음 메일', url: 'https://mail.daum.net' },
  'hanmail.net': { label: '다음 메일', url: 'https://mail.daum.net' },
  'nate.com': { label: '네이트 메일', url: 'https://mail.nate.com' },
};

export function mailboxFor(email: string): { label: string; url: string } | null {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return null;
  return MAILBOX_URLS[domain] ?? null;
}

export function MailboxButton({ email }: { email: string }) {
  const mailbox = mailboxFor(email);
  // ★ 표에 없는 도메인이면 버튼을 숨깁니다. 엉뚱한 곳으로 보내지 않습니다.
  if (!mailbox) return null;

  return (
    <a
      href={mailbox.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-sm bg-ink px-6 text-[15px] tracking-[0.14em] text-paper transition-opacity duration-200 hover:opacity-80"
    >
      {mailbox.label} 열기 ↗
    </a>
  );
}
