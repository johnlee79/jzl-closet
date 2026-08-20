'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRewardAction } from '@/app/admin/settings-actions';
import { formatPrice } from '@/lib/product-utils';
import {
  DEFAULT_REVIEW_TAGS,
  type PointSettings,
  type ReviewSettings,
} from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/** 적립 규칙 한 줄 — on/off 토글 + 금액 */
function RuleRow({
  id,
  label,
  hint,
  rule,
  unit = '원',
  step = 100,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  rule: { enabled: boolean; amount: number };
  /** 금액이 아니라 비율일 때 '%' 를 넘깁니다. */
  unit?: string;
  step?: number;
  max?: number;
  onChange: (next: { enabled: boolean; amount: number }) => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <label className="flex w-[220px] shrink-0 items-center gap-2 text-[15px] text-slate-800">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(event) => onChange({ ...rule, enabled: event.target.checked })}
          className="h-4 w-4"
        />
        {label}
      </label>

      <div className="flex w-[160px] items-center gap-2">
        <input
          id={id}
          type="number"
          min={0}
          max={max}
          step={step}
          value={rule.amount}
          onChange={(event) => {
            const raw = Math.max(0, Number(event.target.value) || 0);
            onChange({ ...rule, amount: max === undefined ? raw : Math.min(max, raw) });
          }}
          aria-label={`${label} 적립 ${unit === '%' ? '비율' : '금액'}`}
          className="admin-input tabular-nums"
        />
        <span className="shrink-0 text-[15px] text-slate-600">{unit}</span>
      </div>

      <p className="flex-1 pt-2 text-[13px] leading-relaxed text-slate-500">
        {hint}
        {rule.amount === 0 ? (
          <span className="mt-0.5 block text-amber-700">
            {unit === '%' ? '적립률' : '금액'}이 0이라 적립하지 않습니다.
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * 리뷰·포인트 설정.
 * 적립 금액과 리뷰 태그 목록을 여기서 관리합니다.
 */
export default function RewardForm({
  initialPoints,
  initialReview,
  telegramConfigured,
}: {
  initialPoints: PointSettings;
  initialReview: ReviewSettings;
  telegramConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [points, setPoints] = useState<PointSettings>(initialPoints);
  const [review, setReview] = useState<ReviewSettings>(initialReview);
  const [tagsText, setTagsText] = useState(initialReview.tags.join('\n'));
  const [message, setMessage] = useState<Message>(null);

  const tags = tagsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveRewardAction(points, { ...review, tags });
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다.' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {/* ── 적립 ──────────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[17px] font-semibold text-slate-900">포인트 적립</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
          체크를 끄거나 금액을 0으로 두면 적립하지 않습니다.
        </p>

        <div className="mt-4">
          <RuleRow
            id="rule-signup"
            label="회원가입 축하"
            hint="가입 직후 한 번만 지급합니다. 구글 로그인으로 처음 들어온 회원도 받습니다."
            rule={points.signup}
            onChange={(next) => setPoints((prev) => ({ ...prev, signup: next }))}
          />
          <RuleRow
            id="rule-text"
            label="텍스트 리뷰"
            hint="사진 없이 글만 쓴 후기에 지급합니다."
            rule={points.reviewText}
            onChange={(next) => setPoints((prev) => ({ ...prev, reviewText: next }))}
          />
          <RuleRow
            id="rule-photo"
            label="사진·동영상 리뷰"
            hint="사진이나 동영상이 하나라도 있으면 이쪽 금액을 지급합니다."
            rule={points.reviewPhoto}
            onChange={(next) => setPoints((prev) => ({ ...prev, reviewPhoto: next }))}
          />
          <RuleRow
            id="rule-purchase"
            label="구매 적립"
            unit="%"
            step={0.5}
            max={100}
            hint="★ 주문 즉시가 아니라 배송완료·구매확정 시점에 지급합니다. 주문 직후에 주면 취소·반품 때 회수가 복잡해집니다. 기준 금액은 배송비를 뺀 상품금액에서 쓴 포인트를 뺀 값이고, 원 단위 아래는 버립니다."
            rule={points.purchase}
            onChange={(next) => setPoints((prev) => ({ ...prev, purchase: next }))}
          />
          <RuleRow
            id="rule-birthday"
            label="생일 축하"
            hint="연 1회만 지급합니다. 회원이 마이페이지에 생년월일을 적어 두어야 나갑니다."
            rule={points.birthday}
            onChange={(next) => setPoints((prev) => ({ ...prev, birthday: next }))}
          />
        </div>

        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-700">
          예) 59,000원짜리 상품을 사면 {formatPrice(Math.floor((59000 * points.purchase.amount) / 100))}
          P 가 배송완료 시점에 적립됩니다.
        </p>
      </section>

      {/* ── 사용 ──────────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[17px] font-semibold text-slate-900">포인트 사용</h2>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="admin-label" htmlFor="min-use">
              최소 사용 금액 (원)
            </label>
            <input
              id="min-use"
              type="number"
              min={0}
              step={100}
              value={points.minUse}
              onChange={(event) =>
                setPoints((prev) => ({
                  ...prev,
                  minUse: Math.max(0, Number(event.target.value) || 0),
                }))
              }
              className="admin-input tabular-nums"
            />
            <p className="mt-1 text-[13px] text-slate-500">
              이 금액 이상부터 쓸 수 있습니다. 0이면 제한 없음.
            </p>
          </div>
          <div>
            <label className="admin-label" htmlFor="max-rate">
              최대 사용 비율 (%)
            </label>
            <input
              id="max-rate"
              type="number"
              min={0}
              max={100}
              step={5}
              value={points.maxUseRate}
              onChange={(event) =>
                setPoints((prev) => ({
                  ...prev,
                  maxUseRate: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                }))
              }
              className="admin-input tabular-nums"
            />
            <p className="mt-1 text-[13px] text-slate-500">
              상품금액 대비 최대 비율입니다. 100이면 상품금액 전액까지.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="admin-label" htmlFor="expire-months">
            포인트 유효기간 (개월)
          </label>
          <input
            id="expire-months"
            type="number"
            min={0}
            max={120}
            step={1}
            value={points.expireMonths}
            onChange={(event) =>
              setPoints((prev) => ({
                ...prev,
                expireMonths: Math.min(120, Math.max(0, Number(event.target.value) || 0)),
              }))
            }
            className="admin-input tabular-nums md:max-w-[220px]"
          />
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            적립일 기준입니다. 0으로 두면 소멸하지 않습니다. 사용할 때는 먼저 만료되는
            포인트부터 빠져나갑니다.
          </p>
        </div>

        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-700">
          예) 상품금액 50,000원 주문에서 {points.maxUseRate}% 까지 쓸 수 있으므로 최대{' '}
          {formatPrice(Math.floor((50000 * points.maxUseRate) / 100))}원까지 사용 가능합니다.
        </p>
      </section>

      {/* ── 보유 포인트 알림 팝업 ─────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[17px] font-semibold text-slate-900">보유 포인트 알림 팝업</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
          로그인한 회원이 들어오면 보유 포인트를 알려 줍니다. 포인트를 주는 것이 아니라
          안내만 합니다. 잔액이 0이면 뜨지 않고, 공지·이벤트 팝업이 있으면 그쪽이 먼저입니다.
        </p>

        <label className="mt-4 flex items-center gap-2 text-[15px] text-slate-800">
          <input
            type="checkbox"
            checked={points.popupEnabled}
            onChange={(event) =>
              setPoints((prev) => ({ ...prev, popupEnabled: event.target.checked }))
            }
            className="h-4 w-4"
          />
          보유 포인트 팝업 사용
        </label>

        <div className="mt-4 md:max-w-[220px]">
          <label className="admin-label" htmlFor="popup-interval">
            재표시 간격 (시간)
          </label>
          <input
            id="popup-interval"
            type="number"
            min={1}
            max={720}
            step={1}
            value={points.popupIntervalHours}
            onChange={(event) =>
              setPoints((prev) => ({
                ...prev,
                popupIntervalHours: Math.min(
                  720,
                  Math.max(1, Number(event.target.value) || 1)
                ),
              }))
            }
            className="admin-input tabular-nums"
          />
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            마지막으로 본 뒤 이 시간이 지나야 다시 뜹니다.
          </p>
        </div>
      </section>

      {/* ── 리뷰 태그 ─────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[17px] font-semibold text-slate-900">리뷰 긍정 태그</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
          손님이 후기를 쓸 때 고르는 항목입니다. 한 줄에 하나씩 적으세요.
        </p>

        <textarea
          value={tagsText}
          onChange={(event) => setTagsText(event.target.value)}
          rows={8}
          className="admin-input mt-3 leading-relaxed"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setTagsText(DEFAULT_REVIEW_TAGS.join('\n'))}
            className="admin-btn"
          >
            기본값으로 되돌리기
          </button>
          <span className="text-[14px] text-slate-500">{tags.length}개</span>
        </div>

        <label className="mt-4 flex items-center gap-2 text-[15px] text-slate-800">
          <input
            type="checkbox"
            checked={review.telegramEnabled}
            onChange={(event) =>
              setReview((prev) => ({ ...prev, telegramEnabled: event.target.checked }))
            }
            className="h-4 w-4"
          />
          새 리뷰를 텔레그램으로 받기
        </label>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          별점 3점 이하면 ⚠️ 표시가 붙습니다. 관리자가 직접 등록한 체험단 후기에는 알림이
          가지 않습니다.
          {telegramConfigured
            ? ''
            : ' 지금은 봇이 연결되지 않아 알림이 나가지 않습니다.'}
        </p>
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
        <button type="submit" disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '리뷰·포인트 설정 저장'}
        </button>
      </div>
    </form>
  );
}
