'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import InquiryDetailView from '@/components/InquiryDetailView';
import { lookupInquiryAction } from '@/app/(shop)/inquiry/actions';
import type { Inquiry } from '@/lib/inquiries';

/**
 * 비회원 문의 조회.
 * 문의번호 + 등록할 때 정한 비밀번호가 모두 맞아야 열립니다.
 * 연속 시도는 서버에서 같은 IP 분당 10회로 제한합니다.
 */
export default function InquiryLookup() {
  const [pending, startTransition] = useTransition();
  const [inquiryNo, setInquiryNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError('');
    startTransition(async () => {
      const result = await lookupInquiryAction(inquiryNo, password);
      if (!result.ok) {
        setInquiry(null);
        setError(result.error);
        return;
      }
      setInquiry(result.data);
    });
  };

  const inputClass =
    'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

  return (
    <div className="mt-12">
      <form onSubmit={submit} noValidate className="max-w-[480px] border border-stone p-6 md:p-8">
        <h2 className="font-serif text-[18px] text-ink">문의 조회</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          문의를 등록하실 때 받으신 문의번호와 직접 정하신 비밀번호를 넣어 주세요.
        </p>

        <div className="mt-6">
          <label htmlFor="lookup-inquiry-no" className="label-xs block">
            문의번호
          </label>
          <input
            id="lookup-inquiry-no"
            type="text"
            value={inquiryNo}
            onChange={(event) => setInquiryNo(event.target.value.toUpperCase())}
            placeholder="INQ-20260814-0001"
            className={inputClass}
          />
        </div>

        <div className="mt-5">
          <label htmlFor="lookup-inquiry-password" className="label-xs block">
            비밀번호
          </label>
          <input
            id="lookup-inquiry-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            className={inputClass}
          />
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-[14px] leading-relaxed text-wine">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn-primary mt-6 w-full">
          {pending ? '조회 중…' : '문의 조회'}
        </button>

        <p className="mt-5 text-[13px] leading-relaxed text-muted">
          회원으로 문의하셨다면{' '}
          <Link href="/mypage/inquiries" className="link-wine">
            마이페이지 &gt; 문의 내역
          </Link>
          에서 확인해 주세요.
        </p>
      </form>

      {inquiry ? (
        <div className="mt-14 max-w-[760px]">
          <InquiryDetailView inquiry={inquiry} />
        </div>
      ) : null}
    </div>
  );
}
