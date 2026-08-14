'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { authButtonClass, authInputClass } from '@/components/AuthCard';
import GoogleButton, { OrDivider } from '@/components/GoogleButton';
import PostcodeSearch from '@/components/PostcodeSearch';
import { useSite } from '@/components/SiteProvider';
import { checkEmailAction, signupAction } from '@/app/(shop)/auth-actions';
import { formatPhone } from '@/lib/format';
import { postcodeFallbackNotice } from '@/lib/postcode';

type Form = {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  agreeAge14: boolean;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  agreeMarketing: boolean;
};

const AGREEMENTS = [
  { key: 'agreeAge14', label: '만 14세 이상입니다', required: true, href: '' },
  { key: 'agreeTerms', label: '이용약관 동의', required: true, href: '/terms' },
  { key: 'agreePrivacy', label: '개인정보 수집·이용 동의', required: true, href: '/privacy' },
  { key: 'agreeMarketing', label: '마케팅 정보 수신 동의', required: false, href: '' },
] as const;

export default function SignupForm() {
  const router = useRouter();
  const { store } = useSite();
  /** 주소 검색을 못 불러왔을 때 직접 입력으로 전환합니다. */
  const [manualAddress, setManualAddress] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Form>({
    email: '',
    password: '',
    passwordConfirm: '',
    name: '',
    phone: '',
    postcode: '',
    address1: '',
    address2: '',
    agreeAge14: false,
    agreeTerms: false,
    agreePrivacy: false,
    agreeMarketing: false,
  });
  const [error, setError] = useState('');
  const [emailState, setEmailState] = useState<'idle' | 'ok' | 'taken'>('idle');

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const allAgreed = AGREEMENTS.every((item) => form[item.key]);
  const requiredAgreed = AGREEMENTS.filter((item) => item.required).every(
    (item) => form[item.key]
  );

  const toggleAll = (checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      agreeAge14: checked,
      agreeTerms: checked,
      agreePrivacy: checked,
      agreeMarketing: checked,
    }));

  /* ── 비밀번호 규칙 표시 ─────────────────────────────── */
  const rules = [
    { label: '8자 이상', ok: form.password.length >= 8 },
    { label: '영문 포함', ok: /[A-Za-z]/.test(form.password) },
    { label: '숫자 포함', ok: /[0-9]/.test(form.password) },
  ];
  const passwordMatches =
    form.passwordConfirm.length > 0 && form.password === form.passwordConfirm;

  const checkEmail = () => {
    if (!form.email.trim()) return;
    startTransition(async () => {
      const result = await checkEmailAction(form.email);
      if (!result.ok) {
        setError(result.error);
        setEmailState('idle');
        return;
      }
      setEmailState(result.data.available ? 'ok' : 'taken');
    });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError('');
    startTransition(async () => {
      const result = await signupAction(form);
      if (!result.ok) {
        setError(result.error);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (result.data.loggedIn) {
        // 이메일 인증이 꺼져 있으면 바로 로그인 상태가 됩니다.
        router.replace('/mypage');
        router.refresh();
      } else {
        // 인증이 켜져 있으면 안내 화면으로 보냅니다. (스팸함·재전송 안내가 있는 곳)
        router.replace(`/signup/complete?email=${encodeURIComponent(form.email.trim())}`);
      }
    });
  };

  const inputClass = authInputClass;

  return (
    <div>
      {/* ── 0. 구글 간편로그인 — 폼 맨 위 ───────────────── */}
      <GoogleButton next="/mypage" />

      <OrDivider label="또는 이메일로 가입" />

      <form onSubmit={submit} noValidate className="text-left">
      {error ? (
        <p
          role="alert"
          className="mb-8 border border-wine bg-wine/5 px-5 py-4 text-[15px] leading-relaxed text-wine"
        >
          {error}
        </p>
      ) : null}

      {/* ── 계정 ──────────────────────────────────────── */}
      <section aria-labelledby="account-heading">
        <h2
          id="account-heading"
          className="border-b border-stone pb-4 font-serif text-[20px] text-ink"
        >
          계정
        </h2>

        <div className="mt-6 flex flex-col gap-5">
          <div>
            <label htmlFor="email" className="label-xs block">
              이메일 *
            </label>
            <div className="flex gap-2">
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => {
                  set('email', event.target.value);
                  setEmailState('idle');
                }}
                onBlur={checkEmail}
                autoComplete="email"
                placeholder="hello@example.com"
                className={inputClass}
              />
              <button
                type="button"
                onClick={checkEmail}
                disabled={pending || !form.email.trim()}
                className="btn-secondary mt-2 min-h-[48px] shrink-0 px-5 py-0 text-[14px] disabled:opacity-40"
              >
                중복 확인
              </button>
            </div>
            {emailState === 'ok' ? (
              <p className="mt-2 text-[13px] text-ink">사용할 수 있는 이메일입니다.</p>
            ) : null}
            {emailState === 'taken' ? (
              <p className="mt-2 text-[13px] text-wine">
                이미 가입된 이메일입니다.{' '}
                <Link href="/login" className="link-wine">
                  로그인하기
                </Link>
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="password" className="label-xs block">
              비밀번호 *
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => set('password', event.target.value)}
              autoComplete="new-password"
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

          <div>
            <label htmlFor="passwordConfirm" className="label-xs block">
              비밀번호 확인 *
            </label>
            <input
              id="passwordConfirm"
              type="password"
              value={form.passwordConfirm}
              onChange={(event) => set('passwordConfirm', event.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
            {form.passwordConfirm.length > 0 ? (
              <p
                className={`mt-2 text-[13px] ${passwordMatches ? 'text-ink' : 'text-wine'}`}
              >
                {passwordMatches ? '비밀번호가 일치합니다.' : '비밀번호가 서로 다릅니다.'}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 정보 ──────────────────────────────────────── */}
      <section aria-labelledby="info-heading" className="mt-14">
        <h2
          id="info-heading"
          className="border-b border-stone pb-4 font-serif text-[20px] text-ink"
        >
          기본 정보
        </h2>

        <div className="mt-6 flex flex-col gap-5">
          <div>
            <label htmlFor="name" className="label-xs block">
              이름 *
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              autoComplete="name"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="phone" className="label-xs block">
              연락처
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(event) => set('phone', formatPhone(event.target.value))}
              placeholder="010-1234-5678"
              autoComplete="tel"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="postcode" className="label-xs block">
              주소 (선택)
            </label>
            <div className="flex gap-2">
              <input
                id="postcode"
                type="text"
                inputMode="numeric"
                value={form.postcode}
                // ★ 주소 검색을 못 불러오면 직접 입력할 수 있게 풀어 줍니다.
                readOnly={!manualAddress}
                onChange={(event) =>
                  set('postcode', event.target.value.replace(/[^0-9]/g, '').slice(0, 5))
                }
                placeholder="우편번호"
                className={`${inputClass} max-w-[160px]`}
              />
              <div className="mt-2">
                <PostcodeSearch
                  showNotice={false}
                  onStateChange={(state) => setManualAddress(state === 'failed')}
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
            {manualAddress ? (
              <p
                role="alert"
                className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-wine"
              >
                {postcodeFallbackNotice(store.phone)}
              </p>
            ) : null}
            <input
              type="text"
              value={form.address1}
              onChange={(event) => set('address1', event.target.value)}
              placeholder={manualAddress ? '주소를 직접 입력해 주세요' : '주소 검색을 눌러 주세요'}
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
            <p className="mt-2 text-[13px] text-muted">
              주소를 넣어 두시면 주문할 때 자동으로 채워집니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 약관 ──────────────────────────────────────── */}
      <section aria-labelledby="agree-heading" className="mt-14">
        <h2
          id="agree-heading"
          className="border-b border-stone pb-4 font-serif text-[20px] text-ink"
        >
          약관 동의
        </h2>

        {/* 항목이 많아 옅은 회색 박스로 묶어 다른 입력과 구분합니다. */}
        <div className="mt-6 bg-stone/25 px-5 py-5">
        <label className="flex cursor-pointer items-center gap-3 border-b border-stone pb-4 text-[16px] text-ink">
          <input
            type="checkbox"
            checked={allAgreed}
            onChange={(event) => toggleAll(event.target.checked)}
            className="h-5 w-5"
          />
          전체 동의
        </label>

        <ul className="mt-4 flex flex-col gap-3">
          {AGREEMENTS.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-3 text-[15px] text-ink">
                <input
                  type="checkbox"
                  checked={form[item.key]}
                  onChange={(event) => set(item.key, event.target.checked)}
                  className="h-4 w-4"
                />
                <span>
                  <span className={item.required ? 'text-wine' : 'text-muted'}>
                    [{item.required ? '필수' : '선택'}]
                  </span>{' '}
                  {item.label}
                </span>
              </label>
              {item.href ? (
                <Link
                  href={item.href}
                  target="_blank"
                  className="shrink-0 text-[13px] text-muted underline underline-offset-4"
                >
                  전문 보기
                </Link>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          동의하신 시각을 함께 저장합니다. 마케팅 수신 동의는 마이페이지에서 언제든지
          바꾸실 수 있습니다.
        </p>
        </div>
      </section>

        <button
          type="submit"
          disabled={pending || !requiredAgreed}
          className={`${authButtonClass} mt-10`}
        >
          {pending ? '가입 중…' : '회원가입'}
        </button>
      </form>
    </div>
  );
}
