'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import PostcodeSearch from '@/components/PostcodeSearch';
import { useSite } from '@/components/SiteProvider';
import { changePasswordAction } from '@/app/(shop)/auth-actions';
import { updateProfileAction } from '@/app/(shop)/mypage/actions';
import { formatPhone } from '@/lib/format';
import { postcodeFallbackNotice } from '@/lib/postcode';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/** 생년월일에 미래 날짜를 고르지 못하게 막습니다. */
const TODAY = new Date().toISOString().slice(0, 10);

const inputClass =
  'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

export default function ProfileForm({
  initial,
  email,
  provider,
  providerName,
}: {
  initial: {
    name: string;
    phone: string;
    postcode: string;
    address1: string;
    address2: string;
    agreeMarketing: boolean;
    birthday: string;
  };
  email: string;
  /** email | google | kakao | naver */
  provider: string;
  /** 화면에 그대로 쓰는 이름 (Google · 카카오 · 네이버) */
  providerName: string;
}) {
  // ★ 간편가입 회원은 JZL CLOSET 에 비밀번호가 없습니다.
  //   입력할 값이 없는 폼을 띄우면 아무리 눌러도 성공하지 않으므로 아예 감춥니다.
  const isSocial = provider !== 'email';
  const router = useRouter();
  const { store } = useSite();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<Message>(null);
  /** 주소 검색을 못 불러왔을 때 직접 입력으로 전환합니다. */
  const [manualAddress, setManualAddress] = useState(false);

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
          </div>

          <div>
            <label htmlFor="profile-birthday" className="label-xs block">
              생년월일 (선택)
            </label>
            <input
              id="profile-birthday"
              type="date"
              value={form.birthday}
              max={TODAY}
              onChange={(event) => set('birthday', event.target.value)}
              className={inputClass}
            />
            <p className="mt-2 text-[13px] text-muted">
              생일에 축하 포인트를 드립니다. 적어 두지 않으시면 지급되지 않습니다.
            </p>
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

      {/* ── 로그인 방식 (간편가입) ────────────────────── */}
      {isSocial ? (
        <section>
          <h2 className="border-b border-stone pb-4 font-serif text-[20px] text-ink">
            로그인 방식
          </h2>
          <p className="mt-6 text-[15px] leading-relaxed text-ink">
            {providerName} 계정으로 로그인 중입니다{email ? ` (${email})` : ''}
          </p>
          <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-muted">
            비밀번호 없이 소셜 계정으로 로그인하고 있어 따로 관리할 비밀번호가 없습니다.
          </p>
        </section>
      ) : null}

      {/* ── 비밀번호 변경 (이메일 가입 회원만) ─────────── */}
      {isSocial ? null : (
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
      )}
    </div>
  );
}
