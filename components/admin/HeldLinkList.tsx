'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { judgeLinkAction } from '@/app/admin/referral-actions';
import { formatDateTime } from '@/lib/format';
import type { HeldLink } from '@/lib/referrals';

/**
 * 같은 기기·회선으로 보여 보류된 추천을 사람이 판단합니다.
 *
 * ★ 기계가 자동으로 잘라 내지 않는 이유
 *   가족이 같은 공유기를 쓰거나, 매장에서 손님 옆에서 가입시키는 경우가 실제로 흔합니다.
 *   자동으로 거절하면 정상 손님이 억울해지고, 자동으로 인정하면 어뷰징이 뚫립니다.
 *   그래서 보류만 해 두고 여기서 사람이 정합니다.
 *
 * ★ 화면에 IP 나 브라우저 정보를 그대로 보여 주지 않습니다.
 *   판단에 필요한 것은 "같은가 다른가"뿐이고, 원본 값은 애초에 저장하지도 않습니다.
 */
export default function HeldLinkList({ items }: { items: HeldLink[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const judge = (id: string, approve: boolean) => {
    startTransition(async () => {
      const result = await judgeLinkAction(id, approve);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({
        tone: 'ok',
        text: approve ? '실적으로 인정했습니다.' : '인정하지 않았습니다.',
      });
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <p className="mt-4 text-[15px] text-slate-600">
        확인이 필요한 건이 없습니다.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {message ? (
        <p
          role="status"
          className={`text-[14px] ${
            message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-start justify-between gap-3 border border-amber-300 bg-amber-50 p-4"
          >
            <div className="min-w-0">
              <p className="text-[16px] text-slate-900">
                {item.referrerName || '이름 없음'}
                <span className="ml-1 font-mono text-[14px] text-slate-500">
                  ({item.referrerCode})
                </span>
                <span className="mx-2 text-slate-400">→</span>
                {item.inviteeName || '이름 없음'}
                <span className="ml-2 text-[14px] text-slate-500">
                  {item.inviteeEmail}
                </span>
              </p>
              <p className="mt-1 text-[14px] text-amber-800">{item.reason}</p>
              <p className="mt-1 text-[14px] text-slate-600">
                {item.sameDevice ? '같은 기기' : '다른 기기'} ·{' '}
                {item.sameIp ? '같은 회선(IP)' : '다른 회선'} ·{' '}
                {formatDateTime(item.createdAt)}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => judge(item.id, true)}
                disabled={pending}
                className="admin-btn-primary disabled:opacity-50"
              >
                {pending ? '처리 중…' : '인정'}
              </button>
              <button
                type="button"
                onClick={() => judge(item.id, false)}
                disabled={pending}
                className="admin-btn-danger disabled:opacity-50"
              >
                {pending ? '처리 중…' : '거절'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
