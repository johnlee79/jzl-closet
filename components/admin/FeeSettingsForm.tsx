'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveFeesAction } from '@/app/admin/settings-actions';

/**
 * ================================================================
 * ** 수수료 두 칸 (2026-08-27)
 * ================================================================
 *
 * ** 수익 관리 화면 안에서 바로 고칠 수 있어야 합니다. (사장님 지시)
 *   "1.43 → 1.84 로 바꾸면 그 순간부터 화면 숫자가 달라진다"
 *
 * ** 저장하면 router.refresh() 로 화면을 다시 굽습니다.
 *   서버가 다시 계산해 위쪽 큰 숫자가 곧바로 바뀝니다.
 *   설정은 저장할 때 revalidateTag 로 캐시를 비우므로 옛 값이 안 나옵니다.
 *
 * * 저장하는 곳은 설정 화면의 「결제·주문」과 같은 자리입니다.
 *   여기서 바꾸면 그쪽에도 그대로 반영됩니다. 값이 두 벌이 되지 않습니다.
 * ================================================================
 */
export default function FeeSettingsForm({
  initial,
}: {
  initial: { cardFeeRate: number; transferFee: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cardFeeRate, setCardFeeRate] = useState(String(initial.cardFeeRate));
  const [transferFee, setTransferFee] = useState(String(initial.transferFee));
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const save = () => {
    if (pending) return;
    setMessage(null);

    const rate = Number(cardFeeRate);
    const fee = Number(transferFee);

    // ** 화면에서도 막습니다. 서버도 다시 막습니다. (settings-actions.ts)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setMessage({ tone: 'error', text: '카드 수수료율은 0~100 사이로 넣어 주세요.' });
      return;
    }
    if (!Number.isFinite(fee) || fee < 0 || fee > 10000) {
      setMessage({ tone: 'error', text: '이체 수수료는 0~10,000원 사이로 넣어 주세요.' });
      return;
    }

    startTransition(async () => {
      const result = await saveFeesAction({ cardFeeRate: rate, transferFee: fee });
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다. 위 숫자를 다시 계산했습니다.' });
      // ** 서버 계산을 다시 시킵니다. 이것이 없으면 옛 숫자가 그대로 보입니다.
      router.refresh();
    });
  };

  return (
    <div className="admin-card p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="admin-label block" htmlFor="card-fee-rate">
            카드 수수료율 (%)
          </label>
          <input
            id="card-fee-rate"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={cardFeeRate}
            onChange={(event) => setCardFeeRate(event.target.value)}
            className="admin-input mt-1 w-[140px] tabular-nums"
          />
          <p className="mt-1 text-[13px] text-slate-500">카드 결제에만 붙습니다</p>
        </div>

        <div>
          <label className="admin-label block" htmlFor="transfer-fee">
            이체 수수료 (원)
          </label>
          <input
            id="transfer-fee"
            type="number"
            min={0}
            max={10000}
            step={10}
            value={transferFee}
            onChange={(event) => setTransferFee(event.target.value)}
            className="admin-input mt-1 w-[140px] tabular-nums"
          />
          <p className="mt-1 text-[13px] text-slate-500">카드 결제 1건당</p>
        </div>

        <button type="button" onClick={save} disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '저장하고 다시 계산'}
        </button>
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-3 text-[15px] ${
            message.tone === 'ok' ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
