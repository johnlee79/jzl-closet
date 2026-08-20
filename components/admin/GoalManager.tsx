'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteGoalAction, saveGoalAction } from '@/app/admin/referral-actions';
import type { Gift, Goal, GoalCriteria, RewardType } from '@/lib/referrals';

/**
 * 목표 이벤트 관리.
 *
 * ★ 보상이 나가는 유일한 통로입니다.
 *   방문·가입 자체로는 아무것도 지급하지 않습니다.
 *   여기서 만든 목표를 채웠을 때만 포인트나 사은품이 나갑니다.
 *
 * ★ 기간은 날짜만 받습니다. (3-C 팝업과 같은 방식)
 *   시각까지 받으면 관리자가 적은 시각이 UTC 로 해석돼 9시간 어긋납니다.
 */

type Draft = {
  name: string;
  criteria: GoalCriteria;
  targetCount: number;
  rewardType: RewardType;
  rewardPoints: number;
  giftId: string | null;
  startsOn: string;
  endsOn: string;
  isRepeatable: boolean;
  isActive: boolean;
  displayOrder: number;
};

function emptyDraft(order: number): Draft {
  return {
    name: '',
    criteria: 'purchase',
    targetCount: 5,
    rewardType: 'point',
    rewardPoints: 5000,
    giftId: null,
    startsOn: '',
    endsOn: '',
    isRepeatable: false,
    isActive: true,
    displayOrder: order,
  };
}

const CRITERIA: { key: GoalCriteria; label: string; hint: string }[] = [
  {
    key: 'signup',
    label: '가입',
    hint: '친구가 회원가입을 마치면 1명으로 셉니다.',
  },
  {
    key: 'purchase',
    label: '첫 구매',
    hint: '친구의 첫 주문이 배송완료·구매확정되면 1명으로 셉니다. 취소·반품하면 다시 뺍니다.',
  },
];

function GoalForm({
  initial,
  isNew,
  gifts,
  busy,
  onSave,
  onCancel,
}: {
  initial: Draft;
  isNew: boolean;
  gifts: Gift[];
  busy: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const criteriaHint = CRITERIA.find((item) => item.key === draft.criteria)?.hint ?? '';

  return (
    <div className="border border-slate-200 p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="admin-label">목표 이름</label>
          <input
            type="text"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="친구 5명 첫 구매하면 캠핑 테이블"
            className="admin-input"
          />
          <p className="mt-1 text-[14px] text-slate-500">
            회원 화면에 그대로 보입니다. 무엇을 하면 무엇을 받는지가 한 줄에 들어가게 적어
            주세요.
          </p>
        </div>

        <div>
          <label className="admin-label">진열 순서</label>
          <input
            type="number"
            value={draft.displayOrder}
            onChange={(event) => set('displayOrder', Number(event.target.value) || 0)}
            className="admin-input"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="admin-label">달성 기준</label>
          <select
            value={draft.criteria}
            onChange={(event) => set('criteria', event.target.value as GoalCriteria)}
            className="admin-input"
          >
            {CRITERIA.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">{criteriaHint}</p>
        </div>

        <div>
          <label className="admin-label">목표 인원</label>
          <input
            type="number"
            min={1}
            value={draft.targetCount}
            onChange={(event) => set('targetCount', Number(event.target.value) || 1)}
            className="admin-input"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="admin-label">보상 종류</label>
          <select
            value={draft.rewardType}
            onChange={(event) => set('rewardType', event.target.value as RewardType)}
            className="admin-input"
          >
            <option value="point">포인트</option>
            <option value="gift">사은품</option>
          </select>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            포인트는 달성 즉시 자동 지급됩니다. 사은품은 자동으로 나가지 않고 [보상 처리]
            화면에서 발송하십니다.
          </p>
        </div>

        {draft.rewardType === 'point' ? (
          <div>
            <label className="admin-label">지급 포인트</label>
            <input
              type="number"
              min={0}
              step={100}
              value={draft.rewardPoints}
              onChange={(event) => set('rewardPoints', Number(event.target.value) || 0)}
              className="admin-input"
            />
          </div>
        ) : (
          <div>
            <label className="admin-label">사은품</label>
            <select
              value={draft.giftId ?? ''}
              onChange={(event) => set('giftId', event.target.value || null)}
              className="admin-input"
            >
              <option value="">고르지 않음</option>
              {gifts.map((gift) => (
                <option key={gift.id} value={gift.id}>
                  {gift.name}
                </option>
              ))}
            </select>
            {gifts.length === 0 ? (
              <p className="mt-1 text-[14px] text-amber-700">
                등록된 사은품이 없습니다. 아래 사은품 등록에서 먼저 만들어 주세요.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="admin-label">시작일 (선택)</label>
          <input
            type="date"
            value={draft.startsOn}
            onChange={(event) => set('startsOn', event.target.value)}
            className="admin-input"
          />
        </div>
        <div>
          <label className="admin-label">종료일 (선택)</label>
          <input
            type="date"
            value={draft.endsOn}
            onChange={(event) => set('endsOn', event.target.value)}
            className="admin-input"
          />
        </div>
      </div>
      <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
        비워 두면 기간 제한이 없습니다. 날짜는 한국시간 기준으로 그 날 0시부터 24시까지입니다.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[16px] text-slate-800">
          <input
            type="checkbox"
            checked={draft.isRepeatable}
            onChange={(event) => set('isRepeatable', event.target.checked)}
          />
          달성할 때마다 반복 지급
        </label>
        <p className="-mt-1 text-[14px] leading-relaxed text-slate-500">
          켜면 목표 인원의 배수마다 계속 지급합니다. (5명 목표에 10명이면 2회) 끄면 한
          사람당 한 번만 받습니다.
        </p>

        <label className="flex items-center gap-2 text-[16px] text-slate-800">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => set('isActive', event.target.checked)}
          />
          목표 사용 (off 하면 회원 화면에서 사라집니다)
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={busy}
          className="admin-btn-primary disabled:opacity-50"
        >
          {busy ? '저장 중…' : isNew ? '등록' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className="admin-btn">
          취소
        </button>
      </div>
    </div>
  );
}

function summary(goal: Goal, gifts: Gift[]): string {
  const what = goal.criteria === 'signup' ? '가입' : '첫 구매';
  const reward =
    goal.rewardType === 'point'
      ? `${goal.rewardPoints.toLocaleString('ko-KR')}P`
      : (gifts.find((gift) => gift.id === goal.giftId)?.name ?? '사은품 미지정');
  const period =
    goal.startsOn || goal.endsOn
      ? ` · ${goal.startsOn || '제한없음'} ~ ${goal.endsOn || '제한없음'}`
      : '';
  return `친구 ${goal.targetCount}명 ${what} → ${reward}${goal.isRepeatable ? ' (반복)' : ''}${period}`;
}

export default function GoalManager({ goals, gifts }: { goals: Goal[]; gifts: Gift[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const save = (draft: Draft, id?: string) => {
    startTransition(async () => {
      const result = await saveGoalAction(draft, id);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다.' });
      setEditing(null);
      router.refresh();
    });
  };

  const remove = (id: string, name: string) => {
    /*
     * ★ 목표를 지우면 그 목표의 달성·지급 기록도 함께 사라집니다. (DB cascade)
     *   이미 나간 포인트는 포인트 내역에 남지만, "왜 줬는지"는 알 수 없게 됩니다.
     *   그래서 지우기보다 off 를 권합니다.
     */
    if (
      !window.confirm(
        `"${name}" 목표를 지울까요?\n달성·지급 기록도 함께 사라집니다.\n운영을 멈추는 것뿐이라면 "목표 사용"을 끄는 편이 안전합니다.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteGoalAction(id);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '지웠습니다.' });
      router.refresh();
    });
  };

  const nextOrder = goals.length > 0 ? Math.max(...goals.map((g) => g.displayOrder)) + 1 : 0;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {message ? (
        <p
          role="status"
          className={`text-[15px] ${
            message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {goals.length === 0 && editing !== 'new' ? (
        <p className="text-[16px] leading-relaxed text-slate-600">
          아직 목표가 없습니다. 목표를 만들기 전까지는 회원의 방문·가입·구매 숫자만 쌓이고
          보상은 나가지 않습니다.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {goals.map((goal) => (
          <li key={goal.id}>
            {editing === goal.id ? (
              <GoalForm
                initial={{
                  name: goal.name,
                  criteria: goal.criteria,
                  targetCount: goal.targetCount,
                  rewardType: goal.rewardType,
                  rewardPoints: goal.rewardPoints,
                  giftId: goal.giftId,
                  startsOn: goal.startsOn,
                  endsOn: goal.endsOn,
                  isRepeatable: goal.isRepeatable,
                  isActive: goal.isActive,
                  displayOrder: goal.displayOrder,
                }}
                isNew={false}
                gifts={gifts}
                busy={pending}
                onSave={(draft) => save(draft, goal.id)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-4 border border-slate-200 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] text-slate-900">
                    {goal.name}
                    {!goal.isActive ? (
                      <span className="admin-badge ml-2">사용 안 함</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[15px] text-slate-600">{summary(goal, gifts)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(goal.id)}
                    className="admin-btn"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(goal.id, goal.name)}
                    disabled={pending}
                    className="admin-btn-danger disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        <GoalForm
          initial={emptyDraft(nextOrder)}
          isNew
          gifts={gifts}
          busy={pending}
          onSave={(draft) => save(draft)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="admin-btn-primary"
          >
            + 목표 등록
          </button>
        </div>
      )}
    </div>
  );
}
