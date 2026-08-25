'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePaymentAction } from '@/app/admin/settings-actions';
import { KSNET_ADMIN_URL } from '@/lib/payments/ksnet/config';
import {
  DEFAULT_REMOTE_AREA_RULES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_HINTS,
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
  ksnet,
}: {
  initial: PaymentSettings;
  /** TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 채워져 있는지 */
  telegramConfigured: boolean;
  /**
   * KSNET 연결 상태 (4-A).
   * ★ 값은 환경변수에서만 옵니다. 여기서 고칠 수 없습니다.
   *   운영 상점아이디를 관리자 화면에서 바꿀 수 있게 하면,
   *   실수로 한 번 눌러 진짜 결제가 열리는 사고가 납니다.
   */
  ksnet: { mode: string; modeLabel: string; mid: string; problem: string | null };
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

  /** 결제수단 하나를 켜고 끕니다. */
  const toggleMethod = (key: string, on: boolean) =>
    setForm((prev) => ({ ...prev, methods: { ...prev.methods, [key]: on } }));

  /*
   * ★ 켜진 개수는 "코드가 열어 둔 수단" 중에서만 셉니다. (2026-08-25)
   *   닫아 둔 수단(ready:false)이 저장값으로는 켜져 있을 수 있는데,
   *   그것까지 세면 실제로는 주문서에 하나도 안 나오는데 "2개 켜져 있음" 이라고
   *   말하게 됩니다. 마지막 하나를 지키는 검사도 헛돕니다.
   */
  const onCount = PAYMENT_METHODS.filter(
    (method) => method.ready && form.methods[method.key]
  ).length;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ── 결제수단 켜고 끄기 (4-A) ──────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">결제수단</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          꺼진 결제수단은 주문서에 나오지 않습니다. 화면에서만 감추는 것이 아니라
          서버도 그 수단의 주문을 받지 않습니다.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {PAYMENT_METHODS.map((method) => {
            const on = form.methods[method.key] === true;
            /*
             * ★ 코드에서 닫아 둔 수단입니다. 여기서 켜도 주문서에 나오지 않습니다.
             *   목록에서 아예 감추지 않는 이유는, 예전에 받던 수단이 소리 없이
             *   사라지면 "내가 껐나?" 하고 헤매게 되기 때문입니다.
             *   보여 주되 못 켜게 하고, 왜 못 켜는지 적어 둡니다.
             */
            const closed = !method.ready;
            // 마지막 하나를 끄려는 순간을 막습니다. (주문을 못 받게 됩니다)
            const lastOne = on && onCount <= 1;
            return (
              <li key={method.key} className="border-b border-slate-100 pb-3 last:border-b-0">
                <label
                  className={`flex items-start gap-2 text-[16px] ${
                    closed ? 'text-slate-400' : 'text-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on && !closed}
                    disabled={lastOne || closed}
                    onChange={(event) => toggleMethod(method.key, event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <strong className="font-medium">{method.label}</strong>
                    {closed ? (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-600">
                        받지 않음
                      </span>
                    ) : null}
                    <span className="mt-1 block text-[14px] leading-relaxed text-slate-500">
                      {PAYMENT_METHOD_HINTS[method.key]}
                    </span>
                    {lastOne ? (
                      <span className="mt-1 block text-[14px] leading-relaxed text-amber-800">
                        마지막으로 남은 결제수단입니다. 이것까지 끄면 주문을 받을 수 없어
                        끌 수 없게 해 두었습니다.
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700">
          지금 켜져 있는 수단 {onCount}개. 무통장입금만 켜 둔 경우에는 아래 입금 계좌를
          반드시 채워야 주문을 받을 수 있습니다.
        </p>
      </section>

      {/* ── KSNET 연결 상태 (4-A) ─────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">KSNET 카드결제</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          상점아이디와 모드는 환경변수(Vercel 프로젝트 설정)에서만 바꿉니다. 여기서는
          지금 어떤 값으로 동작하는지 확인만 합니다.
        </p>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-[16px] md:grid-cols-2">
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <dt className="text-[14px] text-slate-500">모드 (KSNET_MODE)</dt>
            <dd
              className={`mt-0.5 font-semibold ${
                ksnet.mode === 'live' ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {ksnet.modeLabel}
              {ksnet.mode === 'live' ? ' — 실제 결제가 이루어집니다' : ' — 실제 결제가 아닙니다'}
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <dt className="text-[14px] text-slate-500">상점아이디 (KSNET_MID)</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900">{ksnet.mid}</dd>
          </div>
        </dl>

        {ksnet.problem ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[15px] leading-relaxed text-red-700">
            {ksnet.problem}
          </p>
        ) : null}

        {ksnet.mode !== 'live' ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[15px] leading-relaxed text-amber-900">
            지금은 <strong>테스트 상점아이디</strong>로 동작합니다. 테스트 결제는 수 초 뒤
            자동으로 취소되며, 국민카드와 계좌이체는 테스트할 수 없습니다. 운영으로
            바꾸려면 Vercel 환경변수에 <code className="rounded bg-white px-1">KSNET_MID</code>
            를 운영 상점아이디로, <code className="rounded bg-white px-1">KSNET_MODE</code> 를{' '}
            <code className="rounded bg-white px-1">live</code> 로 넣고 재배포하세요.
          </p>
        ) : null}

        {/* ── 노티 자동 완료 ─────────────────────────── */}
        <div className="mt-5 border-t border-slate-200 pt-5">
          <label className="flex items-start gap-2 text-[16px] text-slate-800">
            <input
              type="checkbox"
              checked={form.ksnetNotifyAutoComplete}
              onChange={(event) => set('ksnetNotifyAutoComplete', event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              KSNET 노티로 주문을 자동 완료 처리하기
              <span className="mt-1 block text-[14px] leading-relaxed text-slate-500">
                노티(거래내역통보)는 KSNET 이 결제 결과를 우리 서버로 알려 주는 기능입니다.
                꺼 두어도 결제는 정상 동작합니다. 노티는 항상 원문 그대로 저장되고
                텔레그램으로 알려 드립니다.
              </span>
              <span className="mt-1 block text-[14px] leading-relaxed text-red-700">
                ★ 노티에는 인증이 없습니다. 주소만 알면 누구나 보낼 수 있습니다.
                주문번호와 금액을 맞춘 가짜 노티로 입금하지 않은 주문이 결제완료가 될 수
                있습니다. KSNET 에서 노티 규격과 발신 IP 를 확인받은 뒤에만 켜세요.
              </span>
            </span>
          </label>
        </div>

        <details className="mt-3 rounded-md bg-slate-50 p-3 text-[15px] leading-relaxed text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-900">
            거래 확인 · 취소는 어떻게 하나요
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>
              거래 확인:{' '}
              <a
                href={KSNET_ADMIN_URL}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline"
              >
                {KSNET_ADMIN_URL}
              </a>{' '}
              (접속 계정은 영업담당자에게 문의하세요)
            </li>
            <li>
              <strong>취소는 관리자에서 직접 되지 않습니다.</strong> KSNET 이 가맹점에
              취소 권한을 주지 않습니다. 주문 상세에서 [취소 요청 접수] 를 누른 뒤,
              화면에 표시되는 KSNET 거래번호와 승인번호로 대행사에 연락해 주세요.
              환불이 실제로 끝나면 [취소 완료] 를 누르시면 됩니다.
            </li>
            <li>
              현금영수증은 PG 에서 발급되지 않습니다. 무통장입금 주문의 신청 건을
              주문 목록의 <strong>현금영수증</strong> 필터로 모아 홈택스에서 발급하세요.
            </li>
          </ul>
        </details>
      </section>

      {/* ── 입금 계좌 ─────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">입금 계좌</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
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
          <p className="mt-1 text-[14px] text-slate-500">
            주문 완료 화면에 “언제까지”로 환산해 보여 주고, 자동취소 기준으로도 씁니다.
          </p>
        </div>

        {/* ── 미입금 자동취소 ───────────────────────────── */}
        <div className="mt-5 border-t border-slate-200 pt-5">
          <label className="flex items-start gap-2 text-[16px] text-slate-800">
            <input
              type="checkbox"
              checked={form.autoCancelEnabled}
              onChange={(event) => set('autoCancelEnabled', event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              입금 기한이 지난 주문을 자동으로 취소하기
              <span className="mt-1 block text-[14px] leading-relaxed text-slate-500">
                위 <strong>입금 기한 {form.depositHours}시간</strong>이 지난 입금대기 주문을
                취소하고, 재고와 사용 포인트를 되돌립니다. 취소되면 텔레그램으로 알려 드립니다.
              </span>
              <span className="mt-1 block text-[14px] leading-relaxed text-amber-800">
                ★ 송장번호가 들어갔거나 주문 상세에서 <strong>자동취소 제외</strong>를 켜 둔
                주문은 건드리지 않습니다. 공급처에 발송 요청을 넘긴 건은 꼭 체크해 두세요.
              </span>
            </span>
          </label>
        </div>

        {/* ── 결제대기 카드 주문 정리 (4-B) ───────────────
          ★ 무통장입금 자동취소 바로 아래에 나란히 둡니다.
            둘 다 "결제대기로 남은 주문을 어떻게 할까" 를 정하는 값이라,
            떨어뜨려 두면 운영자가 하나만 보고 다른 쪽을 잊습니다.
          ★★ 스위치는 따로입니다. 무통장은 "취소", 카드는 "승인 여부 확인" 이라
            성격이 다릅니다. 한쪽만 끄고 싶은 경우가 실제로 있습니다.
        */}
        <div className="mt-5 border-t border-slate-200 pt-5">
          <label className="flex items-start gap-2 text-[16px] text-slate-800">
            <input
              type="checkbox"
              checked={form.cardSweepEnabled}
              onChange={(event) => set('cardSweepEnabled', event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              결제대기로 남은 카드 주문을 자동으로 정리하기
              <span className="mt-1 block text-[14px] leading-relaxed text-slate-500">
                아래 시간이 지난 <strong>신용카드</strong> 결제대기 주문을 KSNET 에
                확인해 정리합니다. <strong>무통장입금은 위 스위치가 따로 맡습니다.</strong>
              </span>
              <span className="mt-1 block text-[14px] leading-relaxed text-amber-800">
                ★ 끄면 결제되지 않은 카드 주문의 재고가 계속 묶입니다. 승인 여부 확인도
                멈추므로 권하지 않습니다.
              </span>
            </span>
          </label>

          <label className="admin-label mt-4 block" htmlFor="card-pending-minutes">
            카드 결제대기 정리 시간 (분)
          </label>
          <input
            id="card-pending-minutes"
            type="number"
            min={10}
            max={1440}
            value={form.cardPendingMinutes}
            onChange={(event) =>
              set('cardPendingMinutes', Math.max(10, Number(event.target.value) || 10))
            }
            className="admin-input tabular-nums"
          />
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            이 시간이 지난 <strong>결제대기 신용카드 주문</strong>은 KSNET 에 승인 여부를
            확인한 뒤 정리합니다. 승인이 났으면 결제완료로 바꾸고, 안 났으면 결제실패로 바꾸며
            재고와 사용 포인트를 되돌립니다.
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            무통장입금({form.depositHours}시간)과 다른 값입니다. 카드는 결제창을 닫으면 그걸로
            끝이라 오래 잡아 둘 이유가 없고, 그동안 재고가 묶여 팔 수 있는 물건이 품절로
            보입니다. <strong>10분 미만으로는 설정할 수 없습니다</strong> — 카드번호를 넣고
            은행 앱으로 인증하고 돌아오는 시간을 남겨 두어야 합니다.
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-amber-800">
            ★ 승인 여부를 확인하지 못한 주문은 <strong>그대로 둡니다.</strong> 임의로 정리하지
            않고 텔레그램으로 알려 드립니다. 돈이 빠져나갔을 수 있는 주문이라 사람이 확인해야
            합니다.
          </p>
        </div>

        {/* ── 승인 재조회 기간 ─────────────────────────── */}
        <div className="mt-4">
          <label className="admin-label" htmlFor="card-requery-hours">
            KSNET 승인 재조회 기간 (시간)
          </label>
          <input
            id="card-requery-hours"
            type="number"
            min={0}
            max={24 * 14}
            step={1}
            value={form.cardRequeryHours}
            onChange={(event) =>
              set('cardRequeryHours', Math.max(0, Number(event.target.value) || 0))
            }
            className="admin-input tabular-nums md:max-w-[200px]"
          />
          {/*
            ★★ 이 값은 "물어보지 말라" 는 뜻이 아닙니다.
              기간이 지나도 일단 물어봅니다. 조회는 공짜입니다.
              이 값이 정하는 것은 조회에 실패했을 때의 반응뿐입니다.
              그래서 KSNET 답변이 부정확했더라도 손해가 없습니다.
          */}
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            KSNET 에 확인한 답은 <strong>“결제 키로 재조회 가능한 기간은 결제 이후 대략 2일,
            결제 시간에 따라 일부 조정”</strong> 입니다. “대략” 이고 “조정될 수 있다” 라
            48시간으로 딱 자르지 않고 여유를 두어 <strong>36시간</strong>을 기본으로 둡니다.
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            ★ 이 기간이 지나도 <strong>조회는 그대로 해 봅니다.</strong> 물어보는 데 드는 것이
            없고, 되면 답이 옵니다. 이 값이 정하는 것은 <strong>조회에 실패했을 때의 반응</strong>
            뿐입니다 — 기간 안에서 실패하면 뭔가 잘못된 것이라 텔레그램으로 알리고, 기간이 지나
            실패하면 예상된 일이라 조용히 [확인 필요] 로 둡니다. 0이면 언제나 “기간 안” 으로 봅니다.
          </p>
        </div>

        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-[15px] leading-relaxed text-amber-900">
          계좌 정보는 주문 완료 화면과 주문 조회 화면에서만 보입니다. 상품 페이지나 푸터에는
          노출되지 않습니다.
        </p>
      </section>

      {/* ── 도서산간 ──────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">도서산간 우편번호 규칙</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          여기에 해당하는 주소면 설정 &gt; 배송·반품의 <strong>제주·도서산간 추가배송비</strong>
          가 더해집니다. 한 줄에 하나씩 적으세요.
        </p>

        <textarea
          value={rulesText}
          onChange={(event) => setRulesText(event.target.value)}
          rows={8}
          spellCheck={false}
          className="admin-input mt-3 font-mono text-[15px] leading-relaxed"
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
          <p className="pb-2 text-[15px]">
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

        <div className="mt-4 rounded-md bg-slate-50 p-3 text-[15px] leading-relaxed text-slate-700">
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
        <h2 className="text-[18px] font-semibold text-slate-900">알림 (텔레그램)</h2>

        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[16px] text-slate-800">
            <input
              type="checkbox"
              checked={form.telegramEnabled}
              onChange={(event) => set('telegramEnabled', event.target.checked)}
              className="h-4 w-4"
            />
            새 주문과 취소 요청을 텔레그램으로 받기
          </label>
          <label className="flex items-center gap-2 text-[16px] text-slate-800">
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
          className={`mt-3 rounded-md px-3 py-2 text-[15px] leading-relaxed ${
            telegramConfigured
              ? 'bg-green-50 text-green-800'
              : 'bg-amber-50 text-amber-900'
          }`}
        >
          {telegramConfigured
            ? '봇 토큰과 채팅 ID가 등록되어 있습니다. 위 체크를 켜면 알림이 갑니다.'
            : '아직 봇이 연결되지 않았습니다. 배포 환경의 환경변수에 TELEGRAM_BOT_TOKEN 과 TELEGRAM_CHAT_ID 를 넣어 주세요. 값이 없으면 알림만 건너뛰고 주문은 정상 저장됩니다.'}
        </p>

        <details className="mt-3 rounded-md bg-slate-50 p-3 text-[15px] leading-relaxed text-slate-700">
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
        <h2 className="text-[18px] font-semibold text-slate-900">구매안전서비스 표시</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
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
          className={`rounded-md px-3 py-2 text-[16px] ${
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
