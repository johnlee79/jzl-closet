'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveSalesAction } from '@/app/admin/settings-actions';
import { formatPrice } from '@/lib/product-utils';
import type { SalesSettings, ShippingSettings, StoreSettings } from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/** 여러 줄 입력 한 칸 */
function Field({
  id,
  label,
  hint,
  rows,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  rows: number;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="admin-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="admin-input leading-relaxed"
      />
      {hint ? <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

/**
 * 상품 상세 [판매정보] 탭에 실리는 안내.
 *
 * ★ 전 상품 공통입니다. 상품마다 따로 적지 않습니다.
 * ★ 판매자 정보는 여기서 입력받지 않습니다. 설정 > 스토어 정보 값을 그대로 씁니다.
 */
export default function SalesInfoForm({
  initial,
  shipping,
  store,
}: {
  initial: SalesSettings;
  shipping: ShippingSettings;
  store: StoreSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<SalesSettings>(initial);
  const [message, setMessage] = useState<Message>(null);

  const set = <K extends keyof SalesSettings>(key: K, value: SalesSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveSalesAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '판매정보를 저장했습니다.' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[17px] font-semibold text-slate-900">배송</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
          줄바꿈은 그대로 화면에 나옵니다. 전 상품에 똑같이 적용됩니다.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <Field
            id="sales-shipping"
            label="배송비 안내"
            rows={3}
            value={form.shippingNote}
            placeholder={`비워 두면 배송 설정 값으로 자동 안내합니다. (기본 ${formatPrice(
              shipping.baseFee
            )}원 · ${formatPrice(shipping.freeThreshold)}원 이상 무료)`}
            onChange={(next) => set('shippingNote', next)}
            hint="비워 두는 것을 권합니다. 배송 설정을 고치면 이쪽도 함께 바뀝니다."
          />
          <Field
            id="sales-period"
            label="배송 기간"
            rows={3}
            value={form.deliveryPeriod}
            onChange={(next) => set('deliveryPeriod', next)}
          />
        </div>
      </section>

      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[17px] font-semibold text-slate-900">교환 · 반품</h2>

        <div className="mt-4 flex flex-col gap-4">
          <Field
            id="sales-exchange"
            label="교환·반품 조건"
            rows={4}
            value={form.exchangePolicy}
            onChange={(next) => set('exchangePolicy', next)}
          />
          <Field
            id="sales-cost"
            label="교환·반품 비용"
            rows={3}
            value={form.exchangeCost}
            onChange={(next) => set('exchangeCost', next)}
          />
          <Field
            id="sales-not-allowed"
            label="교환·반품이 불가한 경우"
            rows={5}
            value={form.notAllowed}
            onChange={(next) => set('notAllowed', next)}
            hint="전자상거래법상 청약철회가 제한되는 사유를 구체적으로 적어 두세요."
          />
          <Field
            id="sales-return-address"
            label="반품 주소"
            rows={2}
            value={form.returnAddress}
            placeholder={`비워 두면 배송 설정의 주소를 씁니다. (${shipping.returnAddress})`}
            onChange={(next) => set('returnAddress', next)}
          />
          <Field
            id="sales-as"
            label="A/S 안내"
            rows={3}
            value={form.asInfo}
            onChange={(next) => set('asInfo', next)}
          />
        </div>
      </section>

      {/* ── 판매자 정보 — 여기서는 보여 주기만 합니다 ───── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[17px] font-semibold text-slate-900">판매자 정보</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
          ★ 여기서는 고치지 않습니다.{' '}
          <Link href="/admin/settings?tab=store" className="text-blue-700 underline">
            설정 &gt; 스토어 정보
          </Link>{' '}
          의 값을 그대로 가져다 씁니다. 같은 내용을 두 군데 적어 두면 한쪽만 고쳐져
          어긋납니다.
        </p>

        <dl className="mt-4 grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-2">
          <div className="flex gap-3">
            <dt className="w-[104px] shrink-0 text-slate-500">상호</dt>
            <dd className="text-slate-900">{store.business.company}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[104px] shrink-0 text-slate-500">대표자</dt>
            <dd className="text-slate-900">{store.business.ceo}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[104px] shrink-0 text-slate-500">사업자등록번호</dt>
            <dd className="text-slate-900">{store.business.regNumber}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[104px] shrink-0 text-slate-500">통신판매업신고</dt>
            <dd className="text-slate-900">{store.business.mailOrder || '미입력'}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[104px] shrink-0 text-slate-500">연락처</dt>
            <dd className="text-slate-900">{store.phone}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[104px] shrink-0 text-slate-500">사업장 주소</dt>
            <dd className="text-slate-900">{store.business.address}</dd>
          </div>
        </dl>
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
          {pending ? '저장 중…' : '판매정보 저장'}
        </button>
      </div>
    </form>
  );
}
