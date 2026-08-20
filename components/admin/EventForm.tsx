'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveEventAction } from '@/app/admin/settings-actions';
import { formatPrice } from '@/lib/product-utils';
import {
  RIBBON_TONES,
  fillTokens,
  type EventSettings,
  type PointSettings,
} from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/** 띠배너 미리보기의 배경색 — 디자인 토큰만 씁니다. */
const TONE_CLASS: Record<string, string> = {
  ink: 'bg-[#14141A] text-[#F6F5F2]',
  wine: 'bg-[#6A2E3C] text-[#F6F5F2]',
  stone: 'bg-[#DBD7D1] text-[#14141A]',
};

/**
 * 가입 환영 문구와 상단 띠배너.
 *
 * ★ 이벤트 공지·팝업은 3-A 의 [공지 관리] · [팝업 관리] 를 그대로 씁니다.
 *   여기에 같은 기능을 또 만들지 않습니다.
 */
export default function EventForm({
  initial,
  points,
}: {
  initial: EventSettings;
  points: PointSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<EventSettings>(initial);
  const [message, setMessage] = useState<Message>(null);

  const set = <K extends keyof EventSettings>(key: K, value: EventSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const setRibbon = <K extends keyof EventSettings['ribbon']>(
    key: K,
    value: EventSettings['ribbon'][K]
  ) => {
    setForm((prev) => ({ ...prev, ribbon: { ...prev.ribbon, [key]: value } }));
    setMessage(null);
  };

  const signupPoints = points.signup.enabled ? points.signup.amount : 0;
  const samplePoints = formatPrice(Math.floor((59000 * points.purchase.amount) / 100));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveEventAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '문구를 저장했습니다.' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {/* ── 가입 문구 ─────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">가입 환영 문구</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          <code className="rounded bg-slate-100 px-1 py-0.5">{'{points}'}</code> 자리에
          지급된 포인트가 자동으로 들어갑니다. 지금 설정은{' '}
          <strong>{formatPrice(signupPoints)}P</strong> 입니다.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label className="admin-label" htmlFor="event-signup">
              가입 완료 화면
            </label>
            <textarea
              id="event-signup"
              rows={3}
              value={form.signupComplete}
              onChange={(event) => set('signupComplete', event.target.value)}
              className="admin-input leading-relaxed"
            />
            <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700">
              미리보기 —{' '}
              {fillTokens(form.signupComplete, { points: formatPrice(signupPoints) })}
            </p>
          </div>

          <div>
            <label className="admin-label" htmlFor="event-mypage">
              마이페이지 첫 방문 안내
            </label>
            <textarea
              id="event-mypage"
              rows={3}
              value={form.mypageWelcome}
              onChange={(event) => set('mypageWelcome', event.target.value)}
              className="admin-input leading-relaxed"
            />
          </div>
        </div>
      </section>

      {/* ── 적립 안내 문구 ────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">적립 안내 문구</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          상품 목록과 상세에 붙는 한 줄입니다.{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">{'{points}'}</code> 자리에
          적립률 × 판매가가 자동으로 계산되어 들어갑니다. (DB 조회 없이 화면에서 계산합니다)
        </p>

        <input
          type="text"
          value={form.earnNotice}
          onChange={(event) => set('earnNotice', event.target.value)}
          aria-label="적립 안내 문구"
          className="admin-input mt-3"
        />
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700">
          미리보기 (59,000원 상품, 적립률 {points.purchase.amount}%) —{' '}
          {fillTokens(form.earnNotice, { points: samplePoints })}
        </p>
      </section>

      {/* ── 상단 띠배너 ───────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">상단 띠배너</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          화면 맨 위에 한 줄로 걸립니다. 손님이 닫으면 그 브라우저에서는 다시 뜨지 않습니다.
        </p>

        <label className="mt-4 flex items-center gap-2 text-[16px] text-slate-800">
          <input
            type="checkbox"
            checked={form.ribbon.enabled}
            onChange={(event) => setRibbon('enabled', event.target.checked)}
            className="h-4 w-4"
          />
          띠배너 사용
        </label>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="ribbon-text">
              문구
            </label>
            <input
              id="ribbon-text"
              type="text"
              value={form.ribbon.text}
              onChange={(event) => setRibbon('text', event.target.value)}
              placeholder="첫 구매 3,000원 적립 · 5만원 이상 무료배송"
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="ribbon-link">
              링크 (선택)
            </label>
            <input
              id="ribbon-link"
              type="text"
              value={form.ribbon.linkUrl}
              onChange={(event) => setRibbon('linkUrl', event.target.value)}
              placeholder="/notice 또는 /products"
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="ribbon-tone">
              배경색
            </label>
            <select
              id="ribbon-tone"
              value={form.ribbon.tone}
              onChange={(event) =>
                setRibbon('tone', event.target.value as EventSettings['ribbon']['tone'])
              }
              className="admin-input"
            >
              {RIBBON_TONES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="admin-label" htmlFor="ribbon-start">
              시작일 (선택)
            </label>
            <input
              id="ribbon-start"
              type="date"
              value={form.ribbon.startsAt}
              onChange={(event) => setRibbon('startsAt', event.target.value)}
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="ribbon-end">
              종료일 (선택)
            </label>
            <input
              id="ribbon-end"
              type="date"
              value={form.ribbon.endsAt}
              onChange={(event) => setRibbon('endsAt', event.target.value)}
              className="admin-input"
            />
          </div>
        </div>

        {form.ribbon.text.trim() ? (
          <div className="mt-4">
            <p className="admin-label">미리보기</p>
            <div
              className={`flex min-h-[38px] items-center justify-center px-4 text-[15px] tracking-[0.06em] ${
                TONE_CLASS[form.ribbon.tone] ?? TONE_CLASS.ink
              }`}
            >
              {form.ribbon.text}
            </div>
          </div>
        ) : null}
      </section>

      <p className="rounded-md bg-slate-50 px-4 py-3 text-[15px] leading-relaxed text-slate-700">
        이벤트 공지와 팝업은{' '}
        <Link href="/admin/notices" className="text-blue-700 underline">
          공지 관리
        </Link>{' '}
        ·{' '}
        <Link href="/admin/popups" className="text-blue-700 underline">
          팝업 관리
        </Link>{' '}
        에서 등록하세요. 같은 기능을 여기에 또 만들지 않았습니다.
      </p>

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

      <div>
        <button type="submit" disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '문구·이벤트 저장'}
        </button>
      </div>
    </form>
  );
}
