'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePaymentAction } from '@/app/admin/settings-actions';
import {
  DEFAULT_REMOTE_AREA_RULES,
  isRemoteArea,
  type PaymentSettings,
} from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/**
 * 결제·주문 설정.
 * ★ 여기서 입력한 계좌는 주문 완료 화면과 주문 조회 화면에서만 보입니다.
 *   상품 페이지나 푸터에는 내려보내지 않습니다. (스팸 수집 대상이 됩니다)
 */
export default function PaymentForm({
  initial,
  telegramConfigured,
}: {
  initial: PaymentSettings;
  /** TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 채워져 있는지 */
  telegramConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<PaymentSettings>(initial);
  const [rulesText, setRulesText] = useState(initial.remoteAreaRules.join('\n'));
  const [testPostcode, setTestPostcode] = useState('');
  const [message, setMessage] = useState<Message>(null);

  const set = <K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const rules = rulesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const testResult = testPostcode.replace(/[^0-9]/g, '').length === 5
    ? isRemoteArea(testPostcode, rules)
    : null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await savePaymentAction({ ...form, remoteAreaRules: rules });
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다.' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ── 입금 계좌 ─────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">입금 계좌</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          무통장입금 주문을 받으려면 반드시 채워야 합니다. 비어 있으면 손님이 주문서를
          열 수 없습니다.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="admin-label" htmlFor="bank-name">은행</label>
            <input
              id="bank-name"
              type="text"
              value={form.bankName}
              onChange={(event) => set('bankName', event.target.value)}
              placeholder="국민은행"
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="bank-no">계좌번호</label>
            <input
              id="bank-no"
              type="text"
              value={form.accountNo}
              onChange={(event) => set('accountNo', event.target.value)}
              placeholder="123456-01-234567"
              className="admin-input tabular-nums"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="bank-holder">예금주</label>
            <input
              id="bank-holder"
              type="text"
              value={form.accountHolder}
              onChange={(event) => set('accountHolder', event.target.value)}
              placeholder="제이진엘"
              className="admin-input"
            />
          </div>
        </div>

        <div className="mt-4 max-w-[200px]">
          <label className="admin-label" htmlFor="deposit-hours">입금 기한 (시간)</label>
          <input
            id="deposit-hours"
            type="number"
            min={1}
            max={168}
            value={form.depositHours}
            onChange={(event) =>
              set('depositHours', Math.max(1, Number(event.target.value) || 1))
            }
            className="admin-input tabular-nums"
          />
          <p className="mt-1 text-[12px] text-slate-500">
            주문 완료 화면에 “언제까지”로 환산해 보여 줍니다.
          </p>
        </div>

        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-900">
          계좌 정보는 주문 완료 화면과 주문 조회 화면에서만 보입니다. 상품 페이지나 푸터에는
          노출되지 않습니다.
        </p>
      </section>

      {/* ── 도서산간 ──────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">도서산간 우편번호 규칙</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          여기에 해당하는 주소면 설정 &gt; 배송·반품의 <strong>제주·도서산간 추가배송비</strong>
          가 더해집니다. 한 줄에 하나씩 적으세요.
        </p>

        <textarea
          value={rulesText}
          onChange={(event) => setRulesText(event.target.value)}
          rows={8}
          spellCheck={false}
          className="admin-input mt-3 font-mono text-[13px] leading-relaxed"
        />

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-[180px]">
            <label className="admin-label" htmlFor="postcode-test">규칙 확인</label>
            <input
              id="postcode-test"
              type="text"
              inputMode="numeric"
              value={testPostcode}
              onChange={(event) =>
                setTestPostcode(event.target.value.replace(/[^0-9]/g, '').slice(0, 5))
              }
              placeholder="63000"
              className="admin-input tabular-nums"
            />
          </div>
          <p className="pb-2 text-[13px]">
            {testResult === null ? (
              <span className="text-slate-500">우편번호 5자리를 넣어 보세요.</span>
            ) : testResult ? (
              <span className="font-medium text-amber-700">도서산간 → 추가배송비 적용</span>
            ) : (
              <span className="text-slate-600">일반 지역 → 추가배송비 없음</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setRulesText(DEFAULT_REMOTE_AREA_RULES.join('\n'))}
            className="admin-btn ml-auto"
          >
            기본값으로 되돌리기
          </button>
        </div>

        <div className="mt-4 rounded-md bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">쓸 수 있는 형식</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            <li>
              <code className="rounded bg-white px-1">63000-63644</code> 범위 (제주 전역)
            </li>
            <li>
              <code className="rounded bg-white px-1">63*</code> 앞자리 일치
            </li>
            <li>
              <code className="rounded bg-white px-1">40200</code> 정확히 일치
            </li>
          </ul>
        </div>
      </section>

      {/* ── 알림 ──────────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">알림 (텔레그램)</h2>

        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[14px] text-slate-800">
            <input
              type="checkbox"
              checked={form.telegramEnabled}
              onChange={(event) => set('telegramEnabled', event.target.checked)}
              className="h-4 w-4"
            />
            새 주문과 취소 요청을 텔레그램으로 받기
          </label>
          <label className="flex items-center gap-2 text-[14px] text-slate-800">
            <input
              type="checkbox"
              checked={form.inquiryTelegramEnabled}
              onChange={(event) => set('inquiryTelegramEnabled', event.target.checked)}
              className="h-4 w-4"
            />
            새 1:1 문의를 텔레그램으로 받기
          </label>
        </div>

        <p
          className={`mt-3 rounded-md px-3 py-2 text-[13px] leading-relaxed ${
            telegramConfigured
              ? 'bg-green-50 text-green-800'
              : 'bg-amber-50 text-amber-900'
          }`}
        >
          {telegramConfigured
            ? '봇 토큰과 채팅 ID가 등록되어 있습니다. 위 체크를 켜면 알림이 갑니다.'
            : '아직 봇이 연결되지 않았습니다. 배포 환경의 환경변수에 TELEGRAM_BOT_TOKEN 과 TELEGRAM_CHAT_ID 를 넣어 주세요. 값이 없으면 알림만 건너뛰고 주문은 정상 저장됩니다.'}
        </p>

        <details className="mt-3 rounded-md bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-900">
            봇 만드는 법
          </summary>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
            <li>텔레그램에서 @BotFather 를 찾아 대화를 시작합니다.</li>
            <li>
              <code className="rounded bg-white px-1">/newbot</code> 을 보내고 이름을 정하면
              토큰을 줍니다. → TELEGRAM_BOT_TOKEN
            </li>
            <li>만들어진 봇과 대화를 한 번 시작합니다. (아무 메시지나 보내세요)</li>
            <li>
              브라우저에서{' '}
              <code className="rounded bg-white px-1">
                https://api.telegram.org/bot&lt;토큰&gt;/getUpdates
              </code>{' '}
              를 열어 <code className="rounded bg-white px-1">chat.id</code> 를 확인합니다. →
              TELEGRAM_CHAT_ID
            </li>
            <li>두 값을 배포 환경(Vercel 프로젝트 설정)의 환경변수에 넣고 재배포합니다.</li>
          </ol>
        </details>
      </section>

      {/* ── 구매안전서비스 ────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">구매안전서비스 표시</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          무통장입금 선결제는 결제대금예치(에스크로) 또는 소비자피해보상보험 가입 사실을
          표시해야 합니다. 값을 넣으면 푸터와 주문 완료 화면에 나오고, 비워 두면
          아무것도 표시하지 않습니다.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="admin-label" htmlFor="escrow-notice">안내 문구</label>
            <textarea
              id="escrow-notice"
              value={form.escrowNotice}
              onChange={(event) => set('escrowNotice', event.target.value)}
              rows={3}
              placeholder="고객님께서 현금으로 결제하신 금액에 대해 OO은행 채무지급보증계약을 체결하여 안전거래를 보장하고 있습니다."
              className="admin-input leading-relaxed"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="admin-label" htmlFor="escrow-image">인증 이미지 주소</label>
              <input
                id="escrow-image"
                type="url"
                value={form.escrowImageUrl}
                onChange={(event) => set('escrowImageUrl', event.target.value)}
                placeholder="https://…/escrow.png"
                className="admin-input"
              />
            </div>
            <div>
              <label className="admin-label" htmlFor="escrow-link">확인 페이지 주소 (선택)</label>
              <input
                id="escrow-link"
                type="url"
                value={form.escrowLinkUrl}
                onChange={(event) => set('escrowLinkUrl', event.target.value)}
                placeholder="https://…/confirm"
                className="admin-input"
              />
            </div>
          </div>

          {form.escrowImageUrl ? (
            <div>
              <span className="admin-label">미리보기</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.escrowImageUrl}
                alt="구매안전서비스 인증 이미지 미리보기"
                className="h-auto max-w-[160px] rounded border border-slate-200"
              />
            </div>
          ) : null}
        </div>
      </section>

      {message ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[14px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '결제·주문 설정 저장'}
        </button>
      </div>
    </form>
  );
}
