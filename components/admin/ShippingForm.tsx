'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveShippingAction } from '@/app/admin/settings-actions';
import { formatPrice } from '@/lib/product-utils';
import { productShippingLine, type ShippingSettings } from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

export default function ShippingForm({ initial }: { initial: ShippingSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ShippingSettings>(initial);
  const [message, setMessage] = useState<Message>(null);

  const set = <K extends keyof ShippingSettings>(key: K, value: ShippingSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const number = (value: string): number => {
    const parsed = Number(value.replace(/[^0-9]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveShippingAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다. 안내 페이지에 바로 반영됩니다.' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">배송비</h2>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="admin-label" htmlFor="ship-base">
              기본 배송비 (원)
            </label>
            <input
              id="ship-base"
              type="number"
              min={0}
              step={100}
              value={form.baseFee}
              onChange={(event) => set('baseFee', number(event.target.value))}
              className="admin-input tabular-nums"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="ship-free">
              무료배송 기준 금액 (원)
            </label>
            <input
              id="ship-free"
              type="number"
              min={0}
              step={1000}
              value={form.freeThreshold}
              onChange={(event) => set('freeThreshold', number(event.target.value))}
              className="admin-input tabular-nums"
            />
            <p className="mt-1 text-[14px] text-slate-500">
              0을 넣으면 무료배송 기능을 끕니다.
            </p>
          </div>
          <div>
            <label className="admin-label" htmlFor="ship-island">
              제주·도서산간 추가배송비 (원)
            </label>
            <input
              id="ship-island"
              type="number"
              min={0}
              step={100}
              value={form.islandFee}
              onChange={(event) => set('islandFee', number(event.target.value))}
              className="admin-input tabular-nums"
            />
          </div>
        </div>

        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700">
          지금 설정대로라면 안내 문구는 이렇게 나갑니다.
          <br />
          <span className="text-slate-900">
            {form.baseFee > 0 ? `배송비 ${formatPrice(form.baseFee)}원` : '배송비 무료'}
            {form.freeThreshold > 0
              ? ` · ${formatPrice(form.freeThreshold)}원 이상 구매 시 무료배송`
              : ''}
            {form.islandFee > 0
              ? ` · 제주·도서산간 ${formatPrice(form.islandFee)}원 추가`
              : ''}
          </span>
        </p>
      </section>

      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">반품·소요일</h2>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="admin-label" htmlFor="ship-return">
              반품 주소
            </label>
            <input
              id="ship-return"
              type="text"
              value={form.returnAddress}
              onChange={(event) => set('returnAddress', event.target.value)}
              className="admin-input"
            />
            <p className="mt-1 text-[14px] text-slate-500">
              사업장 주소와 달라도 됩니다. 반품 안내에 이 주소가 나갑니다.
            </p>
          </div>
          <div>
            <label className="admin-label" htmlFor="ship-lead">
              평균 배송 소요일 안내 문구
            </label>
            <textarea
              id="ship-lead"
              value={form.leadTime}
              onChange={(event) => set('leadTime', event.target.value)}
              rows={2}
              className="admin-input leading-relaxed"
            />
            <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
              배송 안내 페이지와 상품 상세의 [판매정보] 탭에 나갑니다. 길게 적으셔도
              됩니다. 상품 상세 구매 영역에는 아래의 짧은 문구가 대신 나갑니다.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="ship-product-line">
              상품 상세용 배송 한 줄 문구
            </label>
            <input
              id="ship-product-line"
              type="text"
              value={form.productLine}
              onChange={(event) => set('productLine', event.target.value)}
              placeholder="무료배송   또는   3,000원 · 50,000원 이상 무료"
              maxLength={40}
              className="admin-input"
            />
            <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
              상품 상세의 구매 영역(값·옵션·장바구니 버튼이 있는 자리) 한 줄에만
              나갑니다. 좁은 자리라 <strong>한 줄을 넘기면 잘립니다.</strong>{' '}
              <strong>비워 두면</strong> 위의 배송비 설정으로 자동으로 만듭니다.
              (무료배송 상품은 이 문구와 상관없이 &ldquo;무료배송&rdquo; 으로 나갑니다)
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
              지금 나갈 문구 —{' '}
              <span className="text-slate-800">
                {productShippingLine(false, {
                  baseFee: form.baseFee,
                  freeThreshold: form.freeThreshold,
                  productLine: form.productLine,
                })}
              </span>
            </p>
          </div>
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
          {pending ? '저장 중…' : '배송·반품 설정 저장'}
        </button>
      </div>
    </form>
  );
}
