'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  runCardSweepNowAction,
  type CardSweepSummary,
} from '@/app/admin/order-actions';

/**
 * ============================================================
 * 결제대기 카드 주문 [지금 정리하기]
 * ============================================================
 *
 * ★★ 왜 버튼인가
 *   이 정리는 주문 하나마다 KSNET 에 20초 타임아웃으로 두 번 물어봅니다.
 *   한 번에 최대 30건까지 보므로 최악의 경우 20분이 넘습니다.
 *   예전에는 주문 목록을 그리기 전에 이것을 기다렸습니다. 결제대기가
 *   몇 건만 쌓여도 목록이 안 열리고, 주문이 몰리는 순간에 관리자 화면이
 *   통째로 마비됐습니다.
 *
 *   평소에는 10분마다 도는 크론이 합니다. 이 버튼은 급할 때만 씁니다.
 *
 * ★ 오래 걸릴 수 있다는 것을 눌리기 전에 알려 줍니다.
 *   진행 중에도 "왜 안 끝나지" 가 아니라 "지금 KSNET 에 묻는 중" 으로 읽히게 합니다.
 * ★ 결과는 화면에 남깁니다. 사라지는 안내로 두면 무엇이 바뀌었는지 놓칩니다.
 */

const LABELS: { key: keyof CardSweepSummary; label: string; tone: 'good' | 'warn' | 'plain' }[] = [
  { key: 'recovered', label: '결제완료로 되살림', tone: 'good' },
  { key: 'review', label: '검토필요 — 금액·주문번호 불일치', tone: 'warn' },
  { key: 'unconfirmed', label: '승인확인실패 — 조회 못 함 (재고 유지)', tone: 'warn' },
  { key: 'noKey', label: '승인확인실패 — 결제 신호 없음 (재고 되돌림)', tone: 'plain' },
  { key: 'failed', label: '결제실패 — 미승인 확인됨 (재고 되돌림)', tone: 'plain' },
];

export default function CardSweepButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [result, setResult] = useState<CardSweepSummary | null>(null);

  const run = () => {
    setError('');
    setResult(null);
    startTransition(async () => {
      const response = await runCardSweepNowAction();
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.data);
      router.refresh();
    });
  };

  return (
    <div className="admin-card mt-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-slate-900">
            결제대기 카드 주문 정리
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-slate-600">
            10분마다 자동으로 돌고 있습니다. 방금 들어온 결제를 바로 확인해야 할 때만
            눌러 주세요.
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            KSNET 에 승인 여부를 하나씩 물어보므로 <strong>건수에 따라 몇 분까지</strong>
            걸릴 수 있습니다. 그동안 이 화면은 그대로 두셔도 됩니다.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="admin-btn-primary shrink-0"
        >
          {pending ? 'KSNET 에 확인하는 중…' : '지금 정리하기'}
        </button>
      </div>

      {/*
        ★ 진행 중 표시 — 버튼 글자만으로는 멈춘 것처럼 보입니다.
          무엇을 기다리는 중인지 적어 두면 운영자가 새로고침해서 끊지 않습니다.
      */}
      {pending ? (
        <p
          role="status"
          className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700"
        >
          결제대기 카드 주문을 하나씩 KSNET 에 확인하고 있습니다. 끝날 때까지 이 화면을
          닫거나 새로고침하지 말아 주세요.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[15px] leading-relaxed text-red-700"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-md bg-slate-50 p-3">
          <p className="text-[15px] font-medium text-slate-900">
            {result.checked === 0
              ? '정리할 결제대기 카드 주문이 없습니다.'
              : `결제대기 카드 주문 ${result.checked}건을 확인했습니다.`}
          </p>

          {result.checked > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-[15px] leading-relaxed">
              {LABELS.map(({ key, label, tone }) => {
                const list = result[key] as string[];
                if (list.length === 0) return null;
                return (
                  <li
                    key={key}
                    className={
                      tone === 'good'
                        ? 'text-green-800'
                        : tone === 'warn'
                          ? 'text-amber-900'
                          : 'text-slate-700'
                    }
                  >
                    <strong>
                      {label} {list.length}건
                    </strong>
                    <span className="ml-1 break-all text-slate-600">{list.join(', ')}</span>
                  </li>
                );
              })}
              {result.skipped > 0 ? (
                <li className="text-slate-600">
                  건너뜀 {result.skipped}건 (자동취소 제외 · 송장 있음 등)
                </li>
              ) : null}
            </ul>
          ) : null}

          {result.recovered.length > 0 ? (
            <p className="mt-2 text-[14px] leading-relaxed text-green-800">
              ★ 우리가 놓치고 있던 결제를 찾았습니다. 재고는 그대로 잡혀 있습니다.
            </p>
          ) : null}
          {result.review.length + result.unconfirmed.length > 0 ? (
            <p className="mt-2 text-[14px] leading-relaxed text-amber-900">
              ★ 사람이 확인해야 하는 주문이 생겼습니다. 위 <strong>확인 필요</strong> 탭에서
              KSNET 거래내역과 대조해 주세요.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
