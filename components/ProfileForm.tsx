'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import PostcodeSearch from '@/components/PostcodeSearch';
import { changePasswordAction } from '@/app/(shop)/auth-actions';
import { updateProfileAction } from '@/app/(shop)/mypage/actions';
import { formatPhone } from '@/lib/format';

type Message = { tone: 'ok' | 'error'; text: string } | null;

const inputClass =
  'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

export default function ProfileForm({
  initial,
  email,
}: {
  initial: {
    name: string;
    phone: string;
    postcode: string;
    address1: string;
    address2: string;
    agreeMarketing: boolean;
  };
  email: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<Message>(null);

  // 비밀번호 변경은 별도 폼으로 둡니다.
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [nextConfirm, setNextConfirm] = useState('');
  const [pwMessage, setPwMessage] = useState<Message>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateProfileAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '회원 정보를 저장했습니다.' });
      router.refresh();
    });
  };

  const changePassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPwMessage(null);
    startTransition(async () => {
      const result = await changePasswordAction(current, next, nextConfirm);
      if (!result.ok) {
        setPwMessage({ tone: 'error', text: result.error });
        return;
      }
      setPwMessage({ tone: 'ok', text: '비밀번호를 바꿨습니다.' });
      setCurrent('');
      setNext('');
      setNextConfirm('');
    });
  };

  return (
    <div className="flex flex-col gap-16">
      {/* ── 기본 정보 ─────────────────────────────────── */}
      <form onSubmit={save} noValidate>
        <h2 className="border-b border-stone pb-4 font-serif text-[20px] text-ink">
          기본 정보
        </h2>

        <div className="mt-6 flex max-w-[520px] flex-col gap-5">
          <div>
            <span className="label-xs block">이메일</span>
            <p className="mt-2 min-h-[48px] border border-stone px-4 py-3 text-[15px] text-muted">
              {email}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              이메일(로그인 아이디)은 바꿀 수 없습니다. 변경이 필요하시면 고객센터로 문의해
              주세요.
            </p>
          </div>

          <div>
            <label htmlFor="profile-name" className="label-xs block">
              이름
            </label>
            <input
              id="profile-name"
              type="text"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="profile-phone" className="label-xs block">
              연락처
            </label>
            <input
              id="profile-phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(event) => set('phone', formatPhone(event.target.value))}
              placeholder="010-1234-5678"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="profile-postcode" className="label-xs block">
              주소
            </label>
            <div className="flex gap-2">
              <input
                id="profile-postcode"
                type="text"
                value={form.postcode}
                readOnly
                placeholder="우편번호"
                className={`${inputClass} max-w-[160px]`}
              />
              <div className="mt-2">
                <PostcodeSearch
                  onSelect={(result) =>
                    setForm((prev) => ({
                      ...prev,
                      postcode: result.postcode,
                      address1: result.address,
                    }))
                  }
                />
              </div>
            </div>
            <input
              type="text"
              value={form.address1}
              onChange={(event) => set('address1', event.target.value)}
              placeholder="주소 검색을 눌러 주세요"
              aria-label="주소"
              className={inputClass}
            />
            <input
              type="text"
              value={form.address2}
              onChange={(event) => set('address2', event.target.value)}
              placeholder="상세주소 (동·호수 등)"
              aria-label="상세주소"
              className={inputClass}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-[15px] text-ink">
            <input
              type="checkbox"
              checked={form.agreeMarketing}
              onChange={(event) => set('agreeMarketing', event.target.checked)}
              className="h-4 w-4"
            />
            마케팅 정보 수신 동의 (선택)
          </label>
        </div>

        {message ? (
          <p
            role="status"
            className={`mt-6 text-[14px] leading-relaxed ${
              message.tone === 'ok' ? 'text-ink' : 'text-wine'
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn-primary mt-8">
          {pending ? '저장 중…' : '회원 정보 저장'}
        </button>
      </form>

      {/* ── 비밀번호 변경 ─────────────────────────────── */}
      <form onSubmit={changePassword} noValidate>
        <h2 className="border-b border-stone pb-4 font-serif text-[20px] text-ink">
          비밀번호 변경
        </h2>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          8자 이상, 영문과 숫자를 모두 포함해 주세요.
        </p>

        <div className="mt-6 flex max-w-[420px] flex-col gap-5">
          <div>
            <label htmlFor="current-password" className="label-xs block">
              현재 비밀번호
            </label>
            <input
              id="current-password"
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="next-password" className="label-xs block">
              새 비밀번호
            </label>
            <input
              id="next-password"
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="next-password-confirm" className="label-xs block">
              새 비밀번호 확인
            </label>
            <input
              id="next-password-confirm"
              type="password"
              value={nextConfirm}
              onChange={(event) => setNextConfirm(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
        </div>

        {pwMessage ? (
          <p
            role="status"
            className={`mt-6 text-[14px] leading-relaxed ${
              pwMessage.tone === 'ok' ? 'text-ink' : 'text-wine'
            }`}
          >
            {pwMessage.text}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !current || !next}
          className="btn-secondary mt-8"
        >
          {pending ? '변경 중…' : '비밀번호 변경'}
        </button>
      </form>
    </div>
  );
}
