'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import SafeImage from '@/components/SafeImage';
import { placeOrderAction, quoteShippingAction } from '@/app/(shop)/checkout/actions';
import { useCart } from '@/lib/cart';
import { formatPhone } from '@/lib/format';
import { formatPrice } from '@/lib/product-utils';
import { PAYMENT_METHODS, type ShippingSettings } from '@/lib/site-config';
import type { CashReceiptType } from '@/lib/types';

/** 다음 우편번호 서비스 — 라이브러리를 설치하지 않고 스크립트만 불러 씁니다. */
const POSTCODE_SRC =
  'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

type DaumPostcodeResult = {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName?: string;
  apartment?: string;
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: DaumPostcodeResult) => void;
        onclose?: () => void;
      }) => { open: () => void };
    };
  }
}

type Form = {
  ordererName: string;
  ordererPhone: string;
  ordererEmail: string;
  sameAsOrderer: boolean;
  receiverName: string;
  receiverPhone: string;
  postcode: string;
  address1: string;
  address2: string;
  deliveryMemo: string;
  paymentMethod: string;
  depositorName: string;
  cashReceiptType: CashReceiptType;
  cashReceiptNo: string;
  agreed: boolean;
};

const MEMO_PRESETS = [
  '부재 시 경비실에 맡겨 주세요.',
  '부재 시 문 앞에 놓아 주세요.',
  '배송 전에 연락 주세요.',
  '파손 위험 상품입니다. 조심해 주세요.',
];

/** 로그인 회원이면 저장된 정보로 주문서를 미리 채웁니다. */
export type MemberPrefill = {
  name: string;
  phone: string;
  email: string;
  postcode: string;
  address1: string;
  address2: string;
};

export default function CheckoutForm({
  shipping,
  storePhone,
  member,
}: {
  shipping: ShippingSettings;
  storePhone: string;
  /** 비로그인이면 null */
  member: MemberPrefill | null;
}) {
  const router = useRouter();
  const { items, total, ready, clear } = useCart();
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState<Form>({
    ordererName: member?.name ?? '',
    ordererPhone: member?.phone ?? '',
    ordererEmail: member?.email ?? '',
    sameAsOrderer: true,
    receiverName: member?.name ?? '',
    receiverPhone: member?.phone ?? '',
    postcode: member?.postcode ?? '',
    address1: member?.address1 ?? '',
    address2: member?.address2 ?? '',
    deliveryMemo: '',
    paymentMethod: 'bank_transfer',
    depositorName: member?.name ?? '',
    cashReceiptType: 'none',
    cashReceiptNo: '',
    agreed: false,
  });

  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [fees, setFees] = useState({
    shippingFee: shipping.baseFee,
    extraShippingFee: 0,
    remote: false,
  });
  const [postcodeReady, setPostcodeReady] = useState(false);

  /** 오류가 났을 때 그 칸으로 스크롤하기 위한 참조 */
  const refs = {
    orderer: useRef<HTMLDivElement>(null),
    receiver: useRef<HTMLDivElement>(null),
    payment: useRef<HTMLDivElement>(null),
    agree: useRef<HTMLDivElement>(null),
  };
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setInvalid((prev) => ({ ...prev, [key]: false }));
    setError('');
  };

  /** 주문자 정보와 동일 — 체크되어 있으면 주문자 값을 그대로 따라갑니다. */
  useEffect(() => {
    if (!form.sameAsOrderer) return;
    setForm((prev) => ({
      ...prev,
      receiverName: prev.ordererName,
      receiverPhone: prev.ordererPhone,
    }));
  }, [form.sameAsOrderer, form.ordererName, form.ordererPhone]);

  /** 입금자명은 기본으로 주문자 이름을 따라갑니다. (직접 고치면 그대로 둡니다) */
  const depositorTouched = useRef(Boolean(member?.name));
  useEffect(() => {
    if (depositorTouched.current) return;
    setForm((prev) => ({ ...prev, depositorName: prev.ordererName }));
  }, [form.ordererName]);

  /**
   * 우편번호가 정해지면 서버에 배송비를 물어봅니다.
   * ★ 화면에 보여 주기 위한 값일 뿐이고, 실제 청구 금액은 주문 시 서버가 다시 계산합니다.
   */
  useEffect(() => {
    let alive = true;
    const postcode = form.postcode.replace(/[^0-9]/g, '');

    void (async () => {
      const quote = await quoteShippingAction(total, postcode);
      if (alive) setFees(quote);
    })();

    return () => {
      alive = false;
    };
  }, [form.postcode, total]);

  const totalAmount = total + fees.shippingFee + fees.extraShippingFee;

  const freeShippingLeft = useMemo(() => {
    if (shipping.freeThreshold <= 0) return 0;
    return Math.max(0, shipping.freeThreshold - total);
  }, [shipping.freeThreshold, total]);

  const openPostcode = () => {
    if (!window.daum?.Postcode) {
      setError('주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요.');
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        const base = data.roadAddress || data.jibunAddress;
        const building = data.buildingName ? ` (${data.buildingName})` : '';
        setForm((prev) => ({
          ...prev,
          postcode: data.zonecode,
          address1: `${base}${building}`,
        }));
        setInvalid((prev) => ({ ...prev, postcode: false, address1: false }));
        setError('');
      },
    }).open();
  };

  /** 필수값을 확인하고, 비어 있으면 해당 칸으로 스크롤합니다. */
  const findProblem = (): { message: string; field: keyof Form; section: keyof typeof refs } | null => {
    if (!form.ordererName.trim())
      return { message: '주문자 이름을 입력해 주세요.', field: 'ordererName', section: 'orderer' };
    if (!form.ordererPhone.trim())
      return { message: '주문자 연락처를 입력해 주세요.', field: 'ordererPhone', section: 'orderer' };
    if (!form.receiverName.trim())
      return { message: '받는 분 이름을 입력해 주세요.', field: 'receiverName', section: 'receiver' };
    if (!form.receiverPhone.trim())
      return { message: '받는 분 연락처를 입력해 주세요.', field: 'receiverPhone', section: 'receiver' };
    if (!form.postcode.trim())
      return { message: '주소를 검색해 주세요.', field: 'postcode', section: 'receiver' };
    if (!form.address1.trim())
      return { message: '주소를 검색해 주세요.', field: 'address1', section: 'receiver' };
    if (!form.depositorName.trim())
      return { message: '입금자명을 입력해 주세요.', field: 'depositorName', section: 'payment' };
    if (form.cashReceiptType !== 'none' && !form.cashReceiptNo.trim())
      return {
        message:
          form.cashReceiptType === 'personal'
            ? '현금영수증에 쓸 휴대폰 번호를 입력해 주세요.'
            : '사업자등록번호를 입력해 주세요.',
        field: 'cashReceiptNo',
        section: 'payment',
      };
    if (!form.agreed)
      return { message: '구매조건 확인 및 결제진행에 동의해 주세요.', field: 'agreed', section: 'agree' };
    return null;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setProblems([]);
    const problem = findProblem();
    if (problem) {
      setError(problem.message);
      setInvalid({ [problem.field]: true });
      refs[problem.section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setError('');
    startTransition(async () => {
      const result = await placeOrderAction({
        ordererName: form.ordererName,
        ordererPhone: form.ordererPhone,
        ordererEmail: form.ordererEmail,
        receiverName: form.receiverName,
        receiverPhone: form.receiverPhone,
        postcode: form.postcode,
        address1: form.address1,
        address2: form.address2,
        deliveryMemo: form.deliveryMemo,
        depositorName: form.depositorName,
        paymentMethod: form.paymentMethod,
        cashReceiptType: form.cashReceiptType,
        cashReceiptNo: form.cashReceiptNo,
        // 가격은 보내지 않습니다. 서버가 상품 테이블에서 다시 읽습니다.
        items: items.map((item) => ({
          productSlug: item.productId,
          optionKey: item.optionKey,
          quantity: item.quantity,
        })),
        agreed: form.agreed,
      });

      if (!result.ok) {
        setError(result.error);
        setProblems(result.problems ?? []);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // 주문이 저장되었으니 장바구니를 비우고 완료 화면으로 갑니다.
      clear();
      const query = new URLSearchParams({
        no: result.data.orderNo,
        k: result.data.token,
      });
      router.replace(`/checkout/complete?${query.toString()}`);
    });
  };

  if (!ready) {
    return (
      <p className="border-t border-stone py-16 text-[16px] text-ink">
        장바구니를 불러오는 중입니다.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border-t border-stone py-16">
        <p className="text-[16px] leading-relaxed text-ink">장바구니가 비어 있습니다.</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">
          상품을 담으신 뒤 다시 주문서를 열어 주세요.
        </p>
        <Link href="/products" className="btn-primary mt-8">
          전체 상품 보기
        </Link>
      </div>
    );
  }

  const inputClass = (field: keyof Form) =>
    `w-full min-h-[48px] border bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink ${
      invalid[field] ? 'border-wine' : 'border-stone'
    }`;

  return (
    <>
      <Script
        src={POSTCODE_SRC}
        strategy="afterInteractive"
        onLoad={() => setPostcodeReady(true)}
      />

      <form onSubmit={handleSubmit} noValidate>
        {/* 회원이면 정보가 채워졌음을 알리고, 아니면 로그인을 권하되 강요하지 않습니다. */}
        {member ? (
          <p className="mb-8 border border-stone px-5 py-4 text-[14px] leading-relaxed text-ink">
            회원 정보로 미리 채웠습니다. 이번 주문에만 다르게 보내시려면 그대로 고치시면
            됩니다.
          </p>
        ) : (
          <p className="mb-8 border border-stone px-5 py-4 text-[14px] leading-relaxed text-muted">
            <Link href="/login?next=/checkout" className="link-wine">
              로그인하고 주문하기
            </Link>
            — 주문 내역을 마이페이지에서 모아 보실 수 있습니다. 로그인하지 않아도 주문은
            그대로 진행됩니다.
          </p>
        )}

        {error ? (
          <div
            role="alert"
            className="mb-8 border border-wine bg-wine/5 px-5 py-4 text-[15px] leading-relaxed text-wine"
          >
            {error}
            {problems.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1 text-[14px]">
                {problems.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            ) : null}
            {problems.length > 0 ? (
              <Link href="/order" className="mt-4 inline-block underline underline-offset-4">
                장바구니로 돌아가 수정하기
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px] lg:gap-16">
          <div className="flex flex-col gap-14">
            {/* ── 1. 주문 상품 ───────────────────────────── */}
            <section aria-labelledby="items-heading">
              <h2
                id="items-heading"
                className="border-b border-stone pb-4 font-serif text-[20px] text-ink"
              >
                주문 상품 {items.length}건
              </h2>
              <ul>
                {items.map((item) => (
                  <li key={item.key} className="flex gap-4 border-b border-stone py-5">
                    <div className="h-[88px] w-[68px] shrink-0 overflow-hidden bg-stone">
                      <SafeImage
                        src={item.thumbnail}
                        alt={`${item.brand} ${item.name}`}
                        label={item.name}
                        width={160}
                        height={208}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      {item.brand ? (
                        <p className="text-[12px] tracking-[0.16em] text-muted">{item.brand}</p>
                      ) : null}
                      <p className="mt-1 font-serif text-[16px] leading-snug text-ink">
                        {item.name}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        {item.optionKey || '옵션 없음'} · {item.quantity}개
                      </p>
                    </div>
                    <p className="self-center whitespace-nowrap text-[15px] font-medium text-ink">
                      {formatPrice(item.price * item.quantity)}원
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                수량이나 옵션을 바꾸시려면{' '}
                <Link href="/order" className="link-wine">
                  장바구니
                </Link>
                로 돌아가 주세요.
              </p>
            </section>

            {/* ── 2. 주문자 정보 ─────────────────────────── */}
            <section aria-labelledby="orderer-heading" ref={refs.orderer}>
              <h2
                id="orderer-heading"
                className="border-b border-stone pb-4 font-serif text-[20px] text-ink"
              >
                주문자 정보
              </h2>
              <div className="mt-6 flex flex-col gap-5">
                <div>
                  <label htmlFor="ordererName" className="label-xs block">
                    이름 *
                  </label>
                  <input
                    id="ordererName"
                    type="text"
                    value={form.ordererName}
                    onChange={(event) => set('ordererName', event.target.value)}
                    autoComplete="name"
                    className={`mt-2 ${inputClass('ordererName')}`}
                  />
                </div>
                <div>
                  <label htmlFor="ordererPhone" className="label-xs block">
                    연락처 *
                  </label>
                  <input
                    id="ordererPhone"
                    type="tel"
                    inputMode="numeric"
                    value={form.ordererPhone}
                    onChange={(event) => set('ordererPhone', formatPhone(event.target.value))}
                    placeholder="010-1234-5678"
                    autoComplete="tel"
                    className={`mt-2 ${inputClass('ordererPhone')}`}
                  />
                  <p className="mt-2 text-[13px] text-muted">
                    주문 확인과 배송 안내를 이 번호로 보내드립니다.
                  </p>
                </div>
                <div>
                  <label htmlFor="ordererEmail" className="label-xs block">
                    이메일 (선택)
                  </label>
                  <input
                    id="ordererEmail"
                    type="email"
                    value={form.ordererEmail}
                    onChange={(event) => set('ordererEmail', event.target.value)}
                    placeholder="hello@example.com"
                    autoComplete="email"
                    className={`mt-2 ${inputClass('ordererEmail')}`}
                  />
                </div>
              </div>
            </section>

            {/* ── 3. 배송지 ──────────────────────────────── */}
            <section aria-labelledby="receiver-heading" ref={refs.receiver}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone pb-4">
                <h2 id="receiver-heading" className="font-serif text-[20px] text-ink">
                  배송지
                </h2>
                <label className="flex items-center gap-2 text-[14px] text-ink">
                  <input
                    type="checkbox"
                    checked={form.sameAsOrderer}
                    onChange={(event) => set('sameAsOrderer', event.target.checked)}
                    className="h-4 w-4"
                  />
                  주문자 정보와 동일
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-5">
                <div>
                  <label htmlFor="receiverName" className="label-xs block">
                    받는 분 *
                  </label>
                  <input
                    id="receiverName"
                    type="text"
                    value={form.receiverName}
                    onChange={(event) => set('receiverName', event.target.value)}
                    disabled={form.sameAsOrderer}
                    className={`mt-2 ${inputClass('receiverName')} disabled:text-muted`}
                  />
                </div>
                <div>
                  <label htmlFor="receiverPhone" className="label-xs block">
                    받는 분 연락처 *
                  </label>
                  <input
                    id="receiverPhone"
                    type="tel"
                    inputMode="numeric"
                    value={form.receiverPhone}
                    onChange={(event) => set('receiverPhone', formatPhone(event.target.value))}
                    disabled={form.sameAsOrderer}
                    placeholder="010-1234-5678"
                    className={`mt-2 ${inputClass('receiverPhone')} disabled:text-muted`}
                  />
                </div>

                <div>
                  <label htmlFor="postcode" className="label-xs block">
                    우편번호 *
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="postcode"
                      type="text"
                      inputMode="numeric"
                      value={form.postcode}
                      onChange={(event) =>
                        set('postcode', event.target.value.replace(/[^0-9]/g, '').slice(0, 5))
                      }
                      placeholder="12345"
                      className={`${inputClass('postcode')} max-w-[160px]`}
                    />
                    <button
                      type="button"
                      onClick={openPostcode}
                      disabled={!postcodeReady}
                      className="btn-secondary min-h-[48px] shrink-0 px-6 py-0 text-[14px] disabled:opacity-40"
                    >
                      {postcodeReady ? '주소 검색' : '불러오는 중…'}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="address1" className="label-xs block">
                    주소 *
                  </label>
                  <input
                    id="address1"
                    type="text"
                    value={form.address1}
                    onChange={(event) => set('address1', event.target.value)}
                    placeholder="주소 검색을 눌러 주세요"
                    autoComplete="street-address"
                    className={`mt-2 ${inputClass('address1')}`}
                  />
                </div>

                <div>
                  <label htmlFor="address2" className="label-xs block">
                    상세주소
                  </label>
                  <input
                    id="address2"
                    type="text"
                    value={form.address2}
                    onChange={(event) => set('address2', event.target.value)}
                    placeholder="동·호수 등"
                    className={`mt-2 ${inputClass('address2')}`}
                  />
                </div>

                <div>
                  <label htmlFor="deliveryMemo" className="label-xs block">
                    배송 메모
                  </label>
                  <input
                    id="deliveryMemo"
                    type="text"
                    value={form.deliveryMemo}
                    onChange={(event) => set('deliveryMemo', event.target.value)}
                    placeholder="배송 시 요청사항을 적어 주세요"
                    className={`mt-2 ${inputClass('deliveryMemo')}`}
                  />
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {MEMO_PRESETS.map((preset) => (
                      <li key={preset}>
                        <button
                          type="button"
                          onClick={() => set('deliveryMemo', preset)}
                          className="border border-stone px-3 py-2 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink"
                        >
                          {preset}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {fees.remote ? (
                  <p className="border border-stone px-4 py-3 text-[14px] leading-relaxed text-ink">
                    제주·도서산간 지역입니다. 추가 배송비{' '}
                    {formatPrice(fees.extraShippingFee)}원이 더해집니다.
                  </p>
                ) : null}
              </div>
            </section>

            {/* ── 4. 결제 수단 ───────────────────────────── */}
            <section aria-labelledby="payment-heading" ref={refs.payment}>
              <h2
                id="payment-heading"
                className="border-b border-stone pb-4 font-serif text-[20px] text-ink"
              >
                결제 수단
              </h2>

              <ul className="mt-6 flex flex-col gap-3">
                {PAYMENT_METHODS.map((method) => (
                  <li key={method.key}>
                    <label
                      className={`flex min-h-[56px] cursor-pointer items-center gap-3 border px-5 py-4 text-[15px] transition-colors ${
                        form.paymentMethod === method.key
                          ? 'border-ink text-ink'
                          : 'border-stone text-ink'
                      } ${method.ready ? '' : 'cursor-not-allowed border-stone text-muted'}`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.key}
                        checked={form.paymentMethod === method.key}
                        onChange={() => set('paymentMethod', method.key)}
                        disabled={!method.ready}
                        className="h-4 w-4"
                      />
                      {method.label}
                      {!method.ready ? (
                        <span className="ml-auto text-[13px] tracking-[0.14em] text-muted">
                          준비 중
                        </span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <label htmlFor="depositorName" className="label-xs block">
                  입금자명 *
                </label>
                <input
                  id="depositorName"
                  type="text"
                  value={form.depositorName}
                  onChange={(event) => {
                    depositorTouched.current = true;
                    set('depositorName', event.target.value);
                  }}
                  className={`mt-2 ${inputClass('depositorName')}`}
                />
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  주문자와 입금자가 다르면 입금하시는 분 이름을 적어 주세요. 입금 확인이
                  빨라집니다. 계좌는 주문 완료 화면에서 안내드립니다.
                </p>
              </div>

              {/* 현금영수증 */}
              <div className="mt-8 border-t border-stone pt-6">
                <p className="label-xs">현금영수증</p>
                <ul className="mt-4 flex flex-wrap gap-3">
                  {(
                    [
                      { key: 'none', label: '신청 안 함' },
                      { key: 'personal', label: '소득공제 (휴대폰번호)' },
                      { key: 'business', label: '지출증빙 (사업자번호)' },
                    ] as { key: CashReceiptType; label: string }[]
                  ).map((option) => (
                    <li key={option.key}>
                      <label
                        className={`flex min-h-[48px] cursor-pointer items-center gap-2 border px-4 py-3 text-[14px] transition-colors ${
                          form.cashReceiptType === option.key
                            ? 'border-ink text-ink'
                            : 'border-stone text-muted hover:border-ink hover:text-ink'
                        }`}
                      >
                        <input
                          type="radio"
                          name="cashReceiptType"
                          checked={form.cashReceiptType === option.key}
                          onChange={() => set('cashReceiptType', option.key)}
                          className="h-4 w-4"
                        />
                        {option.label}
                      </label>
                    </li>
                  ))}
                </ul>

                {form.cashReceiptType !== 'none' ? (
                  <div className="mt-4">
                    <label htmlFor="cashReceiptNo" className="label-xs block">
                      {form.cashReceiptType === 'personal'
                        ? '휴대폰 번호 *'
                        : '사업자등록번호 *'}
                    </label>
                    <input
                      id="cashReceiptNo"
                      type="text"
                      inputMode="numeric"
                      value={form.cashReceiptNo}
                      onChange={(event) => set('cashReceiptNo', event.target.value)}
                      placeholder={
                        form.cashReceiptType === 'personal' ? '010-1234-5678' : '123-45-67890'
                      }
                      className={`mt-2 ${inputClass('cashReceiptNo')} max-w-[280px]`}
                    />
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">
                      입금이 확인되면 신청하신 정보로 발급해 드립니다.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          {/* ── 5. 금액 요약 · 6. 동의 · 7. 주문하기 ────── */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="border border-stone p-6 md:p-8">
              <h2 className="font-serif text-[18px] text-ink">결제 금액</h2>

              <dl className="mt-6 flex flex-col gap-3 border-t border-stone pt-6 text-[15px]">
                <div className="flex justify-between">
                  <dt className="text-muted">상품 합계</dt>
                  <dd className="text-ink">{formatPrice(total)}원</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">배송비</dt>
                  <dd className="text-ink">
                    {fees.shippingFee === 0 ? '무료' : `${formatPrice(fees.shippingFee)}원`}
                  </dd>
                </div>
                {fees.extraShippingFee > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted">도서산간 추가</dt>
                    <dd className="text-ink">{formatPrice(fees.extraShippingFee)}원</dd>
                  </div>
                ) : null}
              </dl>

              {freeShippingLeft > 0 ? (
                <p className="mt-4 text-[13px] leading-relaxed text-muted">
                  {formatPrice(freeShippingLeft)}원 더 담으시면 배송비가 무료입니다.
                </p>
              ) : null}

              <div className="mt-6 flex items-baseline justify-between border-t border-stone pt-6">
                <span className="text-[13px] tracking-[0.14em] text-muted">총 결제금액</span>
                <span className="font-display text-[28px] font-medium tracking-wide text-ink">
                  {formatPrice(totalAmount)}
                  <span className="ml-1 font-sans text-[15px]">원</span>
                </span>
              </div>

              <div ref={refs.agree} className="mt-6 border-t border-stone pt-6">
                <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed text-ink">
                  <input
                    type="checkbox"
                    checked={form.agreed}
                    onChange={(event) => set('agreed', event.target.checked)}
                    className={`mt-1 h-4 w-4 ${invalid.agreed ? 'outline outline-2 outline-wine' : ''}`}
                  />
                  <span>
                    주문 내용을 확인했으며, 구매조건 및 결제진행에 동의합니다. (필수)
                    <br />
                    <Link href="/terms" className="link-wine text-[13px]">
                      이용약관
                    </Link>{' '}
                    ·{' '}
                    <Link href="/privacy" className="link-wine text-[13px]">
                      개인정보처리방침
                    </Link>
                  </span>
                </label>
              </div>

              <button type="submit" disabled={pending} className="btn-primary mt-6 w-full">
                {pending ? '주문 접수 중…' : `${formatPrice(totalAmount)}원 주문하기`}
              </button>

              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                주문 후 안내되는 계좌로 입금해 주시면 확인 후 발송해 드립니다. 문의는
                고객센터 {storePhone}.
              </p>
            </div>
          </aside>
        </div>
      </form>
    </>
  );
}
