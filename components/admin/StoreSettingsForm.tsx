'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveStoreAction } from '@/app/admin/settings-actions';
import type { StoreSettings } from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/** 스토어 정보 — 푸터·법정 페이지·메타데이터에 바로 반영됩니다. */
export default function StoreSettingsForm({ initial }: { initial: StoreSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<StoreSettings>(initial);
  const [message, setMessage] = useState<Message>(null);

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setBusiness = (key: keyof StoreSettings['business'], value: string) =>
    setForm((prev) => ({ ...prev, business: { ...prev.business, [key]: value } }));

  const setStory = (index: number, value: string) =>
    setForm((prev) => {
      const story = [...prev.story];
      story[index] = value;
      return { ...prev, story };
    });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveStoreAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다. 푸터와 법정 페이지에 바로 반영됩니다.' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">기본 정보</h2>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="admin-label" htmlFor="store-name">
              브랜드명
            </label>
            <input
              id="store-name"
              type="text"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="store-nameko">
              한글 브랜드명
            </label>
            <input
              id="store-nameko"
              type="text"
              value={form.nameKo}
              onChange={(event) => set('nameKo', event.target.value)}
              className="admin-input"
            />
          </div>
          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="store-slogan">
              슬로건
            </label>
            <input
              id="store-slogan"
              type="text"
              value={form.slogan}
              onChange={(event) => set('slogan', event.target.value)}
              className="admin-input"
            />
          </div>
          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="store-intro">
              한 줄 소개 (검색 결과 설명에 쓰입니다)
            </label>
            <input
              id="store-intro"
              type="text"
              value={form.intro}
              onChange={(event) => set('intro', event.target.value)}
              className="admin-input"
            />
          </div>
        </div>
      </section>

      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">브랜드 소개 (3문장)</h2>
        <p className="mt-1 text-[15px] text-slate-500">
          메인 화면과 /about 의 “브랜드 스토리” 에 그대로 나옵니다.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <div key={index}>
              <label className="admin-label" htmlFor={`store-story-${index}`}>
                {index + 1}번째 문장
              </label>
              <textarea
                id={`store-story-${index}`}
                value={form.story[index] ?? ''}
                onChange={(event) => setStory(index, event.target.value)}
                rows={3}
                className="admin-input leading-relaxed"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">고객 응대</h2>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="admin-label" htmlFor="store-phone">
              고객센터 번호
            </label>
            <input
              id="store-phone"
              type="tel"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="store-email">
              이메일
            </label>
            <input
              id="store-email"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              placeholder="hello@example.com"
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="store-kakao">
              카카오톡 채널 링크
            </label>
            <input
              id="store-kakao"
              type="url"
              value={form.kakao}
              onChange={(event) => set('kakao', event.target.value)}
              placeholder="http://pf.kakao.com/_xxxxxxx"
              className="admin-input"
            />
            <p className="mt-1 text-[14px] text-slate-500">
              비워 두면 푸터의 카카오톡 버튼이 “준비중” 으로 표시됩니다.
            </p>
          </div>
          <div>
            <label className="admin-label" htmlFor="store-hours">
              운영시간
            </label>
            <input
              id="store-hours"
              type="text"
              value={form.hours}
              onChange={(event) => set('hours', event.target.value)}
              className="admin-input"
            />
          </div>
        </div>
      </section>

      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">사업자 정보</h2>
        <p className="mt-1 text-[15px] text-slate-500">
          푸터와 이용약관·개인정보처리방침에 바로 반영됩니다.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="admin-label" htmlFor="biz-company">
              상호
            </label>
            <input
              id="biz-company"
              type="text"
              value={form.business.company}
              onChange={(event) => setBusiness('company', event.target.value)}
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="biz-ceo">
              대표자
            </label>
            <input
              id="biz-ceo"
              type="text"
              value={form.business.ceo}
              onChange={(event) => setBusiness('ceo', event.target.value)}
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="biz-reg">
              사업자등록번호
            </label>
            <input
              id="biz-reg"
              type="text"
              value={form.business.regNumber}
              onChange={(event) => setBusiness('regNumber', event.target.value)}
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="biz-mail">
              통신판매업신고번호
            </label>
            <input
              id="biz-mail"
              type="text"
              value={form.business.mailOrder}
              onChange={(event) => setBusiness('mailOrder', event.target.value)}
              className="admin-input"
            />
          </div>
          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="biz-address">
              주소
            </label>
            <input
              id="biz-address"
              type="text"
              value={form.business.address}
              onChange={(event) => setBusiness('address', event.target.value)}
              className="admin-input"
            />
          </div>
        </div>
      </section>

      {message ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[16px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border">
        <button type="submit" disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '스토어 정보 저장'}
        </button>
      </div>
    </form>
  );
}
