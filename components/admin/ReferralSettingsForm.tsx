'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveReferralSettingsAction } from '@/app/admin/referral-actions';
import type { ReferralSettings } from '@/lib/site-config';

/**
 * 추천 기능 설정.
 *
 * ★ 여기에는 "방문 몇 P · 가입 몇 P" 항목이 없습니다.
 *   방문·가입 자체로는 포인트를 주지 않기 때문입니다.
 *   보상은 목표를 만들어야 나갑니다. (목표·사은품 화면)
 */
export default function ReferralSettingsForm({
  settings,
}: {
  settings: ReferralSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ReferralSettings>(settings);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const set = <K extends keyof ReferralSettings>(key: K, value: ReferralSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveReferralSettingsAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다.' });
      router.refresh();
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <label className="flex items-center gap-2 text-[14px] text-slate-800">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => set('enabled', event.target.checked)}
        />
        추천 기능 사용
      </label>
      <p className="-mt-2 text-[12px] leading-relaxed text-slate-500">
        끄면 공유 버튼에 코드가 붙지 않고, 마이페이지 친구 초대 화면도 닫힙니다. 이미
        쌓인 실적은 그대로 남습니다.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="cap" className="admin-label">
            월 지급 한도 (P)
          </label>
          <input
            id="cap"
            type="number"
            min={0}
            step={1000}
            value={form.monthlyPointCap}
            onChange={(event) => set('monthlyPointCap', Number(event.target.value) || 0)}
            className="admin-input"
          />
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            한 달에 추천 보상으로 나갈 수 있는 포인트 상한입니다. 넘으면 지급하지 않고
            보류로 두고 텔레그램으로 알립니다. <strong>0 이면 상한 없음</strong> 입니다.
            어뷰징이 터졌을 때 피해를 여기서 멈추는 안전장치이니 꼭 채워 두세요.
          </p>
        </div>

        <div>
          <label htmlFor="shareLine" className="admin-label">
            공유 문구 두 번째 줄
          </label>
          <input
            id="shareLine"
            type="text"
            value={form.shareLine}
            onChange={(event) => set('shareLine', event.target.value)}
            className="admin-input"
          />
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            {'{store}'} 자리에 스토어 이름이 들어갑니다.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="notice" className="admin-label">
          초대 화면 안내 문구
        </label>
        <textarea
          id="notice"
          rows={2}
          value={form.inviteNotice}
          onChange={(event) => set('inviteNotice', event.target.value)}
          className="admin-input"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="admin-btn-primary disabled:opacity-50"
        >
          {pending ? '저장 중…' : '저장'}
        </button>
        {message ? (
          <span
            role="status"
            className={`text-[13px] ${
              message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
