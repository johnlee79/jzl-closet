'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMainSectionsAction } from '@/app/admin/settings-actions';
import { MAIN_SECTIONS, type MainSectionKey, type MainSections } from '@/lib/site-config';

/**
 * 메인 화면 섹션 노출 (3-K)
 *
 * ★ 목록은 lib/site-config.ts 의 MAIN_SECTIONS 를 그대로 돌립니다.
 *   섹션을 하나 더 만들 때 그 목록에만 한 줄 넣으면 이 화면이 저절로 따라옵니다.
 * ★ 항목마다 "화면 어디에 있는지" 를 함께 적습니다.
 *   NEW ARRIVAL·SELECTION 같은 이름만으로는 운영자가 어느 자리인지 알 수 없습니다.
 */
export default function MainSectionsForm({ initial }: { initial: MainSections }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<MainSections>(initial);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const toggle = (key: MainSectionKey) =>
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveMainSectionsAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다. 메인 화면에 바로 반영됩니다.' });
      router.refresh();
    });
  };

  const hiddenCount = MAIN_SECTIONS.filter((item) => !form[item.key]).length;

  return (
    <div className="admin-card p-4 md:p-5">
      <h2 className="text-[18px] font-semibold text-slate-900">메인 섹션 노출</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-slate-600">
        끄면 해당 섹션이 메인에서 통째로 사라집니다. 빈 자리도 남지 않습니다. 준비가 덜 된
        섹션을 잠시 감출 때 쓰세요.
      </p>

      <ul className="mt-4 flex flex-col divide-y divide-slate-200 border-y border-slate-200">
        {MAIN_SECTIONS.map((item) => (
          <li key={item.key} className="py-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form[item.key]}
                onChange={() => toggle(item.key)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[16px] font-medium text-slate-900">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[14px] leading-relaxed text-slate-500">
                  {item.where}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 ? (
        <p className="mt-3 text-[15px] text-amber-700">
          지금 {hiddenCount}개 섹션이 꺼져 있습니다. 저장해야 실제로 반영됩니다.
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className={`mt-4 rounded-md px-3 py-2 text-[16px] ${
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
        <a href="/" target="_blank" rel="noreferrer" className="admin-btn">
          메인 보기 ↗
        </a>
      </div>
    </div>
  );
}
