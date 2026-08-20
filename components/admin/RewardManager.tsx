'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  payAchievementAction,
  rejectAchievementAction,
  saveShippingAction,
  shipGiftAction,
} from '@/app/admin/referral-actions';
import { COURIERS } from '@/lib/couriers';
import { formatDateTime } from '@/lib/format';
import type { Achievement, ShippingInput } from '@/lib/referrals';

/**
 * 목표 달성자 처리 — 포인트 보류분 지급 · 사은품 발송.
 *
 * ★ 포인트는 원래 자동으로 나갑니다.
 *   여기 남아 있는 포인트 건은 월 한도를 넘어 보류된 것들입니다.
 *   관리자가 눈으로 보고 지급하거나 거절합니다.
 *
 * ★ 사은품은 자동으로 나가지 않습니다.
 *   받는 분 정보를 확인하고, 실제로 부친 뒤 송장을 적어야 끝납니다.
 */

const STATUS_LABEL: Record<string, string> = {
  pending: '처리 대기',
  paid: '지급 완료',
  preparing: '발송 준비 중',
  shipped: '발송 완료',
  held: '보류',
  rejected: '거절',
};

function ShippingForm({
  item,
  busy,
  onSave,
  onShip,
}: {
  item: Achievement;
  busy: boolean;
  onSave: (input: ShippingInput) => void;
  onShip: (courier: string, trackingNo: string) => void;
}) {
  const [draft, setDraft] = useState<ShippingInput>({
    shipName: item.shipName,
    shipPhone: item.shipPhone,
    shipPostcode: item.shipPostcode,
    shipAddress1: item.shipAddress1,
    shipAddress2: item.shipAddress2,
    memo: item.memo,
  });
  const [courier, setCourier] = useState(item.courier);
  const [trackingNo, setTrackingNo] = useState(item.trackingNo);

  const set = <K extends keyof ShippingInput>(key: K, value: ShippingInput[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <p className="text-[14px] text-slate-500">
        받는 분 — 마지막 배송지를 가져왔습니다. 필요하면 고쳐 주세요.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <input
          type="text"
          value={draft.shipName}
          onChange={(event) => set('shipName', event.target.value)}
          placeholder="받는 분 이름"
          aria-label="받는 분 이름"
          className="admin-input"
        />
        <input
          type="text"
          value={draft.shipPhone}
          onChange={(event) => set('shipPhone', event.target.value)}
          placeholder="연락처"
          aria-label="연락처"
          className="admin-input"
        />
        <input
          type="text"
          value={draft.shipPostcode}
          onChange={(event) => set('shipPostcode', event.target.value)}
          placeholder="우편번호"
          aria-label="우편번호"
          className="admin-input"
        />
        <input
          type="text"
          value={draft.shipAddress1}
          onChange={(event) => set('shipAddress1', event.target.value)}
          placeholder="주소"
          aria-label="주소"
          className="admin-input"
        />
        <input
          type="text"
          value={draft.shipAddress2}
          onChange={(event) => set('shipAddress2', event.target.value)}
          placeholder="상세주소"
          aria-label="상세주소"
          className="admin-input"
        />
        <input
          type="text"
          value={draft.memo}
          onChange={(event) => set('memo', event.target.value)}
          placeholder="메모 (선택)"
          aria-label="메모"
          className="admin-input"
        />
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={busy}
          className="admin-btn disabled:opacity-50"
        >
          {busy ? '저장 중…' : '받는 분 정보 저장'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
        <select
          value={courier}
          onChange={(event) => setCourier(event.target.value)}
          aria-label="택배사"
          className="admin-input"
        >
          <option value="">택배사 선택</option>
          {COURIERS.map((item2) => (
            <option key={item2.code} value={item2.code}>
              {item2.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={trackingNo}
          onChange={(event) => setTrackingNo(event.target.value)}
          placeholder="송장번호"
          aria-label="송장번호"
          className="admin-input"
        />
        <button
          type="button"
          onClick={() => onShip(courier, trackingNo)}
          disabled={busy}
          className="admin-btn-primary disabled:opacity-50"
        >
          {busy ? '처리 중…' : '발송 완료 처리'}
        </button>
      </div>
    </div>
  );
}

export default function RewardManager({ items }: { items: Achievement[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const run = (job: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    startTransition(async () => {
      const result = await job();
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? '처리하지 못했습니다.' });
        return;
      }
      setMessage({ tone: 'ok', text: okText });
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <p className="mt-4 text-[15px] text-slate-600">처리할 보상이 없습니다.</p>
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
          <li key={item.id} className="border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[16px] text-slate-900">
                  {item.userName || '이름 없음'}
                  <span className="ml-2 text-[14px] text-slate-500">
                    {item.goalName}
                    {item.round > 1 ? ` · ${item.round}회차` : ''}
                  </span>
                </p>
                <p className="mt-1 text-[14px] text-slate-600">
                  {item.rewardType === 'point'
                    ? `포인트 ${item.rewardPoints.toLocaleString('ko-KR')}P`
                    : `사은품 ${item.giftName || '미지정'}`}{' '}
                  · 달성 {formatDateTime(item.createdAt)} ·{' '}
                  <span className="admin-badge">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </p>
                {item.holdReason ? (
                  <p className="mt-1 text-[14px] text-amber-700">{item.holdReason}</p>
                ) : null}
                {item.status === 'shipped' ? (
                  <p className="mt-1 text-[14px] text-slate-600">
                    {item.courier} {item.trackingNo}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {item.rewardType === 'point' && item.status === 'held' ? (
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        () =>
                          payAchievementAction(
                            item.id,
                            item.userId,
                            item.rewardPoints,
                            `${item.goalName} 달성`
                          ),
                        '지급했습니다.'
                      )
                    }
                    disabled={pending}
                    className="admin-btn-primary disabled:opacity-50"
                  >
                    {pending ? '지급 중…' : '지급하기'}
                  </button>
                ) : null}

                {item.rewardType === 'gift' && item.status !== 'shipped' ? (
                  <button
                    type="button"
                    onClick={() => setOpen(open === item.id ? null : item.id)}
                    className="admin-btn"
                  >
                    {open === item.id ? '접기' : '발송 처리'}
                  </button>
                ) : null}

                {item.status !== 'rejected' && item.status !== 'shipped' &&
                item.status !== 'paid' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt('거절 사유를 적어 주세요.') ?? '';
                      if (!reason.trim()) return;
                      run(
                        () => rejectAchievementAction(item.id, reason),
                        '거절 처리했습니다.'
                      );
                    }}
                    disabled={pending}
                    className="admin-btn-danger disabled:opacity-50"
                  >
                    {pending ? '처리 중…' : '거절'}
                  </button>
                ) : null}
              </div>
            </div>

            {open === item.id ? (
              <ShippingForm
                item={item}
                busy={pending}
                onSave={(input) =>
                  run(() => saveShippingAction(item.id, input), '저장했습니다.')
                }
                onShip={(courier, trackingNo) =>
                  run(
                    () =>
                      shipGiftAction(
                        item.id,
                        courier,
                        trackingNo,
                        item.giftName || '사은품',
                        item.shipName || item.userName || ''
                      ),
                    '발송 처리했습니다.'
                  )
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
