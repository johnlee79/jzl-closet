'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveHeroButtonsAction } from '@/app/admin/settings-actions';
import { DEFAULT_HERO_BUTTONS, type HeroButtonsSettings } from '@/lib/site-config';

/**
 * 메인 첫 화면 버튼 두 개 (3-J)
 *
 * ★ 문구와 링크를 함께 다뤄야 해서 사이트 문구(소제목+본문)로는 담기 어려웠습니다.
 *   그래서 site_settings 에 key 하나(heroButtons)를 두고 여기서 네 칸을 받습니다.
 * ★ 두 번째 버튼 문구를 비우면 버튼 자체가 화면에서 사라집니다.
 *   운영자가 원할 때 뺄 수 있어야 해서 빈 값을 그대로 저장합니다.
 */
export default function HeroButtonsForm({ initial }: { initial: HeroButtonsSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<HeroButtonsSettings>(initial);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const set = (key: keyof HeroButtonsSettings, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveHeroButtonsAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다. 메인 화면에 바로 반영됩니다.' });
      router.refresh();
    });
  };

  const reset = () => {
    if (!window.confirm('지금 내용을 버리고 기본값으로 되돌릴까요?')) return;
    setForm(DEFAULT_HERO_BUTTONS);
    setMessage({ tone: 'ok', text: '기본값을 채웠습니다. [저장] 을 눌러 주세요.' });
  };

  const field = (
    key: keyof HeroButtonsSettings,
    label: string,
    placeholder: string
  ) => (
    <div>
      <label className="admin-label" htmlFor={`hero-${key}`}>
        {label}
      </label>
      <input
        id={`hero-${key}`}
        type="text"
        value={form[key]}
        onChange={(event) => set(key, event.target.value)}
        placeholder={placeholder}
        className="admin-input"
      />
    </div>
  );

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4">
      <p className="text-[13px] leading-relaxed text-slate-600">
        메인 첫 화면 소개 문단 아래에 나오는 버튼 두 개입니다. 첫 번째는 검정 배경,
        두 번째는 흰 배경에 검정 테두리입니다.{' '}
        <b>두 번째 버튼 문구를 비우면 그 버튼이 화면에서 사라집니다.</b>
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {field('primaryLabel', '첫 번째 버튼 문구', DEFAULT_HERO_BUTTONS.primaryLabel)}
        {field('primaryHref', '첫 번째 버튼 링크', DEFAULT_HERO_BUTTONS.primaryHref)}
        {field(
          'secondaryLabel',
          '두 번째 버튼 문구 (비우면 숨김)',
          DEFAULT_HERO_BUTTONS.secondaryLabel
        )}
        {field('secondaryHref', '두 번째 버튼 링크', DEFAULT_HERO_BUTTONS.secondaryHref)}
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-4 rounded-md px-3 py-2 text-[14px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '저장'}
        </button>
        <button type="button" onClick={reset} disabled={pending} className="admin-btn">
          기본값으로 되돌리기
        </button>
        <a href="/" target="_blank" rel="noreferrer" className="admin-btn">
          페이지 보기 ↗
        </a>
      </div>
    </div>
  );
}
