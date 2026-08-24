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

  /*
   * ★★ 예전에는 숫자가 아닌 글자를 전부 지웠습니다. (replace(/[^0-9]/g, ''))
   *   그러면 -3000 이 3000 이 됩니다. 부호가 조용히 뒤집히는 겁니다.
   *   운영자는 자기가 넣은 값이 그대로 들어간 줄 알고 저장합니다.
   *
   * ★ 지금은 마이너스를 그대로 둡니다. 잘못된 값이 눈에 보여야
   *   아래 검사가 무엇이 잘못됐는지 말해 줄 수 있습니다.
   */
  const number = (value: string): number => {
    const cleaned = value.replace(/[^0-9-]/g, '');
    if (!cleaned || cleaned === '-') return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  };

  /** 0 미만인 금액 칸. 저장하기 전에 여기서 먼저 잡습니다. */
  const negativeField = (): string => {
    const amounts: [string, number][] = [
      ['기본 배송비', form.baseFee],
      ['무료배송 기준', form.freeThreshold],
      ['제주·도서산간 추가', form.islandFee],
      ['반품 배송비', form.returnFee],
      ['교환 배송비', form.exchangeFee],
    ];
    const wrong = amounts.find(([, value]) => value < 0);
    return wrong ? `${wrong[0]}는 0 이상으로 넣어 주세요. 지금 값: ${wrong[1]}` : '';
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    /*
     * ★ 서버에 보내기 전에 여기서 먼저 잡습니다. 서버도 같은 검사를 합니다.
     *   화면에서 막으면 왕복 없이 바로 알 수 있고, 서버 검사는 화면을 거치지
     *   않고 들어오는 값을 막습니다. 둘 다 있어야 합니다.
     */
    const wrong = negativeField();
    if (wrong) {
      setMessage({ tone: 'error', text: wrong });
      return;
    }

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

        {/*
          ★ 이 두 금액은 이용약관 제11조에도 그대로 들어갑니다.
            여기서 고치면 약관 문구가 함께 바뀝니다. 약관을 따로 고치지 마세요.
          ★ 손님이 부담하는 경우(단순 변심)에만 쓰입니다.
            하자·오배송은 회사가 부담하므로 이 금액이 나가지 않습니다.
        */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="admin-label" htmlFor="ship-return-fee">
              반품 배송비 (원)
            </label>
            <input
              id="ship-return-fee"
              type="number"
              min={0}
              step={500}
              value={form.returnFee}
              onChange={(event) => set('returnFee', number(event.target.value))}
              className="admin-input tabular-nums"
            />
            <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
              단순 변심으로 반품하실 때 손님이 부담하는 왕복 배송비입니다.
            </p>
          </div>
          <div>
            <label className="admin-label" htmlFor="ship-exchange-fee">
              교환 배송비 (원)
            </label>
            <input
              id="ship-exchange-fee"
              type="number"
              min={0}
              step={500}
              value={form.exchangeFee}
              onChange={(event) => set('exchangeFee', number(event.target.value))}
              className="admin-input tabular-nums"
            />
            <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
              단순 변심으로 교환하실 때 손님이 부담하는 왕복 배송비입니다.
            </p>
          </div>
        </div>

        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700">
          <strong>이 두 금액은 이용약관 제11조에도 그대로 나갑니다.</strong> 여기서
          고치면 약관도 함께 바뀝니다. 하자·오배송은 회사 부담이라 이 금액이 나가지
          않습니다.
        </p>

        {/* ── 배송완료 자동 전환 ─────────────────────────── */}
        <div className="mt-4">
          <label className="admin-label" htmlFor="ship-auto-delivered">
            배송완료 자동 전환 (일)
          </label>
          <input
            id="ship-auto-delivered"
            type="number"
            min={0}
            step={1}
            value={form.autoDeliveredDays}
            onChange={(event) => set('autoDeliveredDays', number(event.target.value))}
            className="admin-input tabular-nums md:max-w-[200px]"
          />
          {/*
            ★★ 이 시점에 구매 적립 포인트가 나갑니다.
              날짜를 줄이면 아직 못 받은 손님의 주문까지 배송완료가 되고,
              포인트가 먼저 나갑니다. 되돌리려면 포인트 회수까지 해야 합니다.
            ★ 기준은 주문일이 아니라 배송중으로 바뀐 시각입니다.
            ★ 송장이 없는 주문은 자동으로 넘기지 않습니다.
          */}
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            배송중이 된 지 이 일수가 지나면 자동으로 배송완료가 됩니다.{' '}
            <strong>이때 구매 적립 포인트가 지급됩니다.</strong> 송장이 있는 주문만
            넘어가고, 기준은 주문일이 아니라 배송중으로 바뀐 시각입니다. 0이면 자동
            전환을 하지 않고 사람이 직접 바꿔야 합니다. (3~90일)
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            손님은 주문 내역에서 [수령 확인] 을 눌러 더 일찍 받을 수 있습니다. 이 일수는
            그 안내 문구에도 그대로 나갑니다.
          </p>
        </div>

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
              placeholder="무료배송   또는   배송비 3,000원 (50,000원 이상 무료)"
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
