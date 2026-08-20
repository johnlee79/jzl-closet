'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveAnalyticsAction } from '@/app/admin/settings-actions';
import { GA4_ID_PATTERN, type AnalyticsSettings } from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

export default function AnalyticsForm({ initial }: { initial: AnalyticsSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ga4Id, setGa4Id] = useState(initial.ga4Id);
  const [message, setMessage] = useState<Message>(null);

  const trimmed = ga4Id.trim();
  const invalid = trimmed.length > 0 && !GA4_ID_PATTERN.test(trimmed);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveAnalyticsAction({ ga4Id: trimmed });
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({
        tone: 'ok',
        text: trimmed
          ? '저장했습니다. 배포된 사이트에 GA4 스크립트가 들어갑니다.'
          : '측정 ID 를 비웠습니다. GA4 스크립트를 넣지 않습니다.',
      });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[17px] font-semibold text-slate-900">GA4 측정 ID</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
          비워 두면 아무 스크립트도 넣지 않습니다. 개발 환경(localhost)에서는 값이 있어도
          전송하지 않습니다.
        </p>

        <div className="mt-4 max-w-[360px]">
          <label className="admin-label" htmlFor="ga4-id">
            측정 ID
          </label>
          <input
            id="ga4-id"
            type="text"
            value={ga4Id}
            onChange={(event) => setGa4Id(event.target.value.toUpperCase())}
            placeholder="G-XXXXXXXXXX"
            className="admin-input font-mono"
          />
          {invalid ? (
            <p className="mt-1 text-[13px] text-red-700">
              G- 로 시작하는 형식이어야 합니다. (예: G-AB12CD34EF)
            </p>
          ) : null}
        </div>

        <div className="mt-5 rounded-md bg-slate-50 p-4 text-[14px] leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">측정 ID 받는 법</p>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
            <li>
              <a
                href="https://analytics.google.com/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline underline-offset-2"
              >
                analytics.google.com
              </a>{' '}
              에 구글 계정으로 로그인합니다.
            </li>
            <li>관리(톱니바퀴) → 속성 만들기 → 웹 데이터 스트림을 추가합니다.</li>
            <li>웹사이트 주소에 이 쇼핑몰 주소를 넣습니다.</li>
            <li>만들어진 스트림 화면 오른쪽 위의 “측정 ID (G-…)” 를 복사해 위에 붙여넣습니다.</li>
          </ol>
          <p className="mt-3">
            지금 보내는 이벤트: <code>view_item</code> (상품 상세 조회),{' '}
            <code>add_to_cart</code> (장바구니 담기)
          </p>
        </div>
      </section>

      {message ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[15px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={pending || invalid} className="admin-btn-primary">
          {pending ? '저장 중…' : '측정 ID 저장'}
        </button>
      </div>
    </form>
  );
}
