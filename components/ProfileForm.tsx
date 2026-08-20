'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FieldError from '@/components/FieldError';
import PostcodeSearch from '@/components/PostcodeSearch';
import SaveFeedback from '@/components/SaveFeedback';
import { useSite } from '@/components/SiteProvider';
import { changePasswordAction } from '@/app/(shop)/auth-actions';
import { updateProfileAction } from '@/app/(shop)/mypage/actions';
import { formatPhone } from '@/lib/format';
import { postcodeFallbackNotice } from '@/lib/postcode';
import { notifyProfileUpdated } from '@/lib/profile-events';
import { useFieldProblems } from '@/lib/use-field-problems';
import { useSave } from '@/lib/use-save';

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
  /** 저장 중 표시 · 저장 결과 안내 · 자동 사라짐을 한꺼번에 (lib/use-save.ts) */
  const save_ = useSave();
  const pending = save_.pending;
  /** 빈 칸 표시 · 안내 · 스크롤 (lib/use-field-problems.ts) */
  const problems = useFieldProblems();
  const [form, setForm] = useState(initial);
  /** 주소 검색을 못 불러왔을 때 직접 입력으로 전환합니다. */
  const [manualAddress, setManualAddress] = useState(false);

  // 비밀번호 변경은 별도 폼으로 둡니다.
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [nextConfirm, setNextConfirm] = useState('');
  const password = useSave();

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    save_.setFeedback(null);
    // 고치기 시작하면 빨간 표시를 지웁니다. 고치는 중에 계속 빨간 것은 잔소리입니다.
    problems.clear();
  };

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    /*
     * ★ 필수 항목부터 봅니다. 문제가 있으면 그 칸으로 화면을 옮기고 멈춥니다.
     *   예전에는 아무 말 없이 멈춰서 왜 저장이 안 되는지 알 수 없었습니다.
     *
     * ★★ 연락처는 필수가 아닙니다. 비워 둔 채로도 저장됩니다.
     *   주소만 고치려는 회원이 연락처까지 넣어야 하면 불편합니다.
     *   연락처가 없으면 헤더 배너가 계속 안내하므로 그걸로 충분합니다.
     *   ★ 다만 값을 넣었다면 형식은 봅니다. 틀린 번호는 없는 번호보다 나쁩니다.
     *     배송 문자가 조용히 실패해서, 안 갔다는 것조차 모르게 됩니다.
     */
    if (
      problems.check([
        { field: 'name', ok: form.name.trim().length > 0, message: '이름을 입력해 주세요.' },
        {
          field: 'phone',
          ok: !form.phone.trim() || /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(form.phone.trim()),
          message: '연락처를 010-1234-5678 형식으로 입력해 주세요.',
        },
      ])
    ) {
      return;
    }

    save_.run(() => updateProfileAction(form), '회원 정보가 저장되었습니다.', () => {
      router.refresh();
      /*
       * ★ 헤더의 "연락처를 입력해 주세요" 배너에 알립니다.
       *   그 배너는 클라이언트 컴포넌트라 router.refresh() 로는 갱신되지 않습니다.
       *   이 신호가 없으면 저장이 됐는데도 배너가 계속 떠 있습니다.
       */
      notifyProfileUpdated();
    });
  };

  const changePassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    password.run(
      () => changePasswordAction(current, next, nextConfirm),
      '비밀번호가 변경되었습니다.',
      () => {
        setCurrent('');
        setNext('');
        setNextConfirm('');
      }
    );
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
              ref={problems.ref('name')}
              type="text"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              aria-invalid={problems.has('name') || undefined}
              className={problems.inputClass('name', inputClass)}
            />
            <FieldError message={problems.messageFor('name')} />
          </div>

          <div>
            <label htmlFor="profile-phone" className="label-xs block">
              연락처
            </label>
            <input
              id="profile-phone"
              ref={problems.ref('phone')}
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(event) => set('phone', formatPhone(event.target.value))}
              placeholder="010-1234-5678"
              aria-invalid={problems.has('phone') || undefined}
              className={problems.inputClass('phone', inputClass)}
            />
            <FieldError message={problems.messageFor('phone')} />
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

        <SaveFeedback feedback={save_.feedback} className="mt-6" />

        {/* ★ 저장 중에는 눌리지 않습니다. 두 번 눌러도 한 번만 나갑니다. */}
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

        <SaveFeedback feedback={password.feedback} className="mt-6" />

        <button
          type="submit"
          disabled={password.pending || !current || !next}
          className="btn-secondary mt-8"
        >
          {password.pending ? '변경 중…' : '비밀번호 변경'}
        </button>
      </form>
      )}
    </div>
  );
}
