'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import CartChangeNotice from '@/components/CartChangeNotice';
import SafeImage from '@/components/SafeImage';
import SignupPointBadge from '@/components/SignupPointBadge';
import { useSite } from '@/components/SiteProvider';
import { placeOrderAction } from '@/app/(shop)/checkout/actions';
import { useCart } from '@/lib/cart';
import { useCartLive } from '@/lib/cart-live';
import {
  clearDraft,
  loadDraft,
  pickDraft,
  saveDraft,
  type CheckoutDraft,
} from '@/lib/checkout-draft';
import { postcodeFallbackNotice, usePostcodeScript } from '@/lib/postcode';
import { formatPhone } from '@/lib/format';
import { formatPrice } from '@/lib/product-utils';
import {
  acceptsCashReceipt,
  expectedPurchasePoints,
  maxUsablePoints,
  type PaymentMethod,
  type ShippingSettings,
} from '@/lib/site-config';
import type { CashReceiptType } from '@/lib/types';

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
/** 로그인 회원의 포인트 정보. 비회원이면 null 입니다. */
export type PointInfo = {
  balance: number;
  minUse: number;
  maxUseRate: number;
};

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
  points,
  methods,
}: {
  shipping: ShippingSettings;
  storePhone: string;
  /** 비로그인이면 null */
  member: MemberPrefill | null;
  /** 비로그인이거나 포인트가 없으면 null */
  points: PointInfo | null;
  /**
   * 관리자가 켜 둔 결제수단만 옵니다. (4-A)
   * ★ 여기 없는 수단은 서버도 받지 않습니다. 화면에서만 감추면 막은 것이 아닙니다.
   */
  methods: { key: PaymentMethod; label: string }[];
}) {
  const router = useRouter();
  const { items, ready } = useCart();
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
    /*
     * ★ 기본값은 관리자가 켜 둔 첫 번째 수단입니다. (4-A)
     *   'bank_transfer' 를 박아 두면, 무통장입금을 꺼 둔 날
     *   화면에는 카드만 보이는데 서버로는 무통장입금이 넘어갑니다.
     */
    paymentMethod: methods[0]?.key ?? 'bank_transfer',
    depositorName: member?.name ?? '',
    cashReceiptType: 'none',
    /*
     * 회원이면 가입 시 휴대폰번호를 미리 채워 둡니다.
     * 손님은 현금영수증 체크만 하면 됩니다. (번호를 다시 칠 필요가 없습니다)
     */
    cashReceiptNo: member?.phone ?? '',
    agreed: false,
  });

  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  /*
   * ★★ 금액은 전부 여기서 나옵니다. 담을 때 적어 둔 값으로 계산하지 않습니다.
   *   상품 합계 · 배송비 · 도서산간 추가비를 서버가 한 번에 냅니다.
   *   예전에는 화면이 들고 있던 옛 합계를 서버에 보내 배송비만 물어봤습니다.
   *   옛 합계가 무료배송 문턱을 넘고 실제 금액은 못 넘으면, 손님은 "무료" 를 보고
   *   주문했는데 배송비가 붙어 청구됐습니다.
   * ★ 우편번호는 숫자만 넘깁니다. 도서산간 판별이 숫자로 되어 있습니다.
   */
  const live = useCartLive(form.postcode.replace(/[^0-9]/g, ''));
  const total = live.itemsTotal;

  /**
   * 주소 검색 스크립트.
   * ★ 화면에 들어오는 순간 미리 받아 둡니다. 실패하면 자동으로 두 번 더 시도하고,
   *   그래도 안 되면 직접 입력으로 전환합니다. (lib/postcode.ts)
   */
  const postcode = usePostcodeScript();
  const manualAddress = postcode.state === 'failed';

  /** 임시저장본을 불러왔는지 — 상단 안내에 씁니다. */
  const [restored, setRestored] = useState(false);

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

  /* ── 임시저장 복구 ───────────────────────────────────
   * ★ 회원은 저장된 배송지가 우선입니다. 임시저장은 비어 있는 칸만 채웁니다.
   *   (회원 정보를 임시저장본이 덮어쓰면 예전 주소로 되돌아갑니다) */
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restoredOnce.current) return;
    restoredOnce.current = true;

    const draft = loadDraft();
    if (!draft) return;

    setForm((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const [key, value] of Object.entries(draft) as [
        keyof Form,
        string | boolean,
      ][]) {
        if (typeof value === 'boolean') {
          if (next[key] !== value) {
            (next[key] as boolean) = value;
            changed = true;
          }
          continue;
        }
        if (!value.trim()) continue;
        // 회원 정보로 이미 채워진 칸은 건드리지 않습니다.
        const current = next[key];
        if (typeof current === 'string' && current.trim()) continue;
        (next[key] as string) = value;
        changed = true;
      }

      if (changed) setRestored(true);
      return next;
    });
  }, []);

  /* ── 임시저장 ────────────────────────────────────────
   * 입력이 멈춘 뒤 0.6초에 한 번만 씁니다. 글자마다 저장하면 낭비입니다.
   * ★ 비밀번호·카드정보는 담기지 않습니다. (lib/checkout-draft.ts 가 걸러 냅니다) */
  useEffect(() => {
    const draft: CheckoutDraft = pickDraft(form as unknown as Record<string, unknown>);
    const timer = window.setTimeout(() => saveDraft(draft), 600);
    return () => window.clearTimeout(timer);
  }, [form]);

  /** [새로 입력하기] — 저장본을 버리고 빈 칸(회원이면 회원 정보)으로 되돌립니다. */
  const resetDraft = () => {
    clearDraft();
    setRestored(false);
    setForm((prev) => ({
      ...prev,
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
      cashReceiptType: 'none',
      cashReceiptNo: member?.phone ?? '',
    }));
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

  /*
   * 무통장입금을 골랐는지.
   * ★ 입금자명·현금영수증은 무통장입금에만 해당합니다.
   *   카드는 현금영수증 대상이 아닙니다. (카드 매출전표가 그 역할을 합니다)
   *   서버도 같은 기준으로 막습니다. (checkout/actions.ts)
   */
  const isBank = acceptsCashReceipt(form.paymentMethod);

  /*
   * 결제수단을 카드로 바꾸면 현금영수증 신청을 지웁니다.
   * ★ 안 지우면 화면에는 안 보이는데 값만 남아, 서버 검사에 걸려
   *   "카드는 현금영수증 대상이 아닙니다" 로 주문이 막힙니다.
   */
  useEffect(() => {
    if (isBank) return;
    setForm((prev) =>
      prev.cashReceiptType === 'none' ? prev : { ...prev, cashReceiptType: 'none' }
    );
  }, [isBank]);

  /* ── 포인트 사용 ─────────────────────────────────────
   * ★ 화면에서 미리 깎아 보여 주지만, 실제 금액은 서버가 다시 계산합니다. */
  const [usePoints, setUsePoints] = useState(0);
  /** 적립률은 사이트 설정에서 읽습니다. (조회를 추가하지 않습니다) */
  const { points: sitePoints, store } = useSite();

  const pointLimit = points ? maxUsablePoints(total, points.balance, points) : 0;
  const canUsePoints = Boolean(
    points && points.balance > 0 && pointLimit >= (points.minUse || 0)
  );
  const appliedPoints = canUsePoints ? Math.min(usePoints, pointLimit) : 0;

  // ★ 이번 주문으로 쌓일 예상 적립.
  //   기준은 배송비를 뺀 상품금액에서 쓴 포인트를 뺀 값입니다. (서버 계산과 같습니다)
  const expectedEarn = expectedPurchasePoints(
    Math.max(0, total - appliedPoints),
    sitePoints
  );

  const totalAmount = Math.max(
    0,
    total + live.shippingFee + live.extraShippingFee - appliedPoints
  );

  const freeShippingLeft = useMemo(() => {
    if (shipping.freeThreshold <= 0) return 0;
    return Math.max(0, shipping.freeThreshold - total);
  }, [shipping.freeThreshold, total]);

  const openPostcode = () => {
    if (manualAddress) {
      // 이미 실패한 뒤라면 버튼이 "다시 시도" 로 바뀌어 있습니다.
      postcode.retry();
      return;
    }
    void postcode.open((result) => {
      setForm((prev) => ({
        ...prev,
        postcode: result.postcode,
        address1: result.address,
      }));
      setInvalid((prev) => ({ ...prev, postcode: false, address1: false }));
      setError('');
    });
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
    if (isBank && !form.depositorName.trim())
      return { message: '입금자명을 입력해 주세요.', field: 'depositorName', section: 'payment' };
    if (isBank && form.cashReceiptType !== 'none') {
      const digits = form.cashReceiptNo.replace(/[^0-9]/g, '');
      if (!digits)
        return {
          message:
            form.cashReceiptType === 'personal'
              ? '현금영수증에 쓸 휴대폰 번호를 입력해 주세요.'
              : '사업자등록번호를 입력해 주세요.',
          field: 'cashReceiptNo',
          section: 'payment',
        };
      // 서버와 같은 기준으로 미리 걸러 냅니다. (주문을 눌렀다가 되돌아오지 않도록)
      if (form.cashReceiptType === 'personal' && (digits.length < 10 || digits.length > 11))
        return {
          message: '휴대폰 번호는 10~11자리 숫자로 입력해 주세요.',
          field: 'cashReceiptNo',
          section: 'payment',
        };
      if (form.cashReceiptType === 'business' && digits.length !== 10)
        return {
          message: '사업자등록번호는 10자리 숫자로 입력해 주세요.',
          field: 'cashReceiptNo',
          section: 'payment',
        };
    }
    if (!form.agreed)
      return { message: '구매조건 확인 및 결제진행에 동의해 주세요.', field: 'agreed', section: 'agree' };
    return null;
  };

  /**
   * 이번 주문에 실제로 들어갈 줄.
   * ★ 체크를 푼 것과 지금 살 수 없는 것은 뺍니다.
   *   장바구니에서는 지우지 않습니다. 여기서만 빠집니다.
   */
  const orderLines = live.lines.filter((line) => line.orderable);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    /*
     * ★★ 금액을 확인하지 못했으면 여기서 멈춥니다.
     *   버튼도 잠가 두지만, 엔터로도 보낼 수 있으니 한 번 더 막습니다.
     *   손님이 본 적 없는 금액이 결제되면 안 됩니다.
     */
    if (!live.canOrder) {
      setProblems([]);
      setError(live.blockReason);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

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
        // 입금자명은 무통장입금에만 씁니다.
        depositorName: isBank ? form.depositorName : '',
        paymentMethod: form.paymentMethod,
        cashReceiptType: isBank ? form.cashReceiptType : 'none',
        cashReceiptNo: isBank ? form.cashReceiptNo : '',
        /*
         * 가격은 보내지 않습니다. 서버가 상품 테이블에서 다시 읽습니다.
         * ★ 손님이 고른 것 중 지금 살 수 있는 줄만 보냅니다.
         *   품절된 줄까지 보내면 주문 전체가 막힙니다.
         */
        items: orderLines.map((line) => ({
          productSlug: line.productSlug,
          optionKey: line.optionKey,
          quantity: line.quantity,
        })),
        agreed: form.agreed,
        // 서버가 잔액·설정으로 다시 깎습니다. 여기 값은 요청일 뿐입니다.
        usePoints: appliedPoints,
      });

      if (!result.ok) {
        setError(result.error);
        setProblems(result.problems ?? []);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      /*
       * ★ 장바구니는 여기서 건드리지 않습니다. (4-A)
       *   주문이 확정된 뒤에 주문 완료 화면의 CartCleanupOnComplete 가
       *   "주문에 들어간 상품만" 골라 뺍니다.
       *
       *   여기서 비우면 안 되는 이유
       *     카드결제는 아직 결제창에 가기도 전입니다. 취소하거나 거절되면
       *     장바구니가 비어 있어 손님이 상품을 처음부터 다시 담아야 합니다.
       *     무통장입금도 완료 화면에서 빼면 되므로 굳이 두 곳에서 지울 이유가 없습니다.
       *     (두 곳에서 지우면 한쪽만 고쳤을 때 어긋납니다)
       */

      // ★ 어디로 갈지는 서버가 정합니다. (무통장 → 완료 화면 / 카드 → 결제창)
      router.replace(result.data.nextUrl);
    });
  };

  if (!ready) {
    return (
      <p className="border-t border-stone py-16 text-[17px] text-ink">
        장바구니를 불러오는 중입니다.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border-t border-stone py-16">
        <p className="text-[17px] leading-relaxed text-ink">장바구니가 비어 있습니다.</p>
        <p className="mt-2 text-[16px] leading-relaxed text-ink">
          상품을 담으신 뒤 다시 주문서를 열어 주세요.
        </p>
        <Link href="/products" className="btn-primary mt-8">
          전체 상품 보기
        </Link>
      </div>
    );
  }

  const inputClass = (field: keyof Form) =>
    `w-full min-h-[48px] border bg-transparent px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink ${
      invalid[field] ? 'border-wine' : 'border-stone'
    }`;

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        {/* ★ 새로고침·뒤로가기로 날아간 입력을 되살립니다. */}
        {restored ? (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-stone px-5 py-4">
            <p className="text-[15px] leading-relaxed text-ink">
              이전에 입력하시던 내용을 불러왔습니다.
            </p>
            <button
              type="button"
              onClick={resetDraft}
              className="btn-secondary min-h-[40px] px-4 py-0 text-[14px]"
            >
              새로 입력하기
            </button>
          </div>
        ) : null}

        {/* 회원이면 정보가 채워졌음을 알리고, 아니면 로그인을 권하되 강요하지 않습니다. */}
        {member ? (
          <p className="mb-8 border border-stone px-5 py-4 text-[15px] leading-relaxed text-ink">
            회원 정보로 미리 채웠습니다. 이번 주문에만 다르게 보내시려면 그대로 고치시면
            됩니다.
          </p>
        ) : (
          // ★ 로그인을 강요하지 않습니다. 한 줄 안내만 두고 그대로 넘어갈 수 있게 합니다.
          <div className="mb-8">
            <div className="flex">
              <SignupPointBadge href="/signup?next=/checkout" />
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              <Link href="/login?next=/checkout" className="link-wine">
                로그인
              </Link>
              하면 배송지가 자동 입력됩니다. 로그인 없이 그대로 주문하셔도 됩니다.
            </p>
          </div>
        )}

        {error ? (
          <div
            role="alert"
            className="mb-8 border border-wine bg-wine/5 px-5 py-4 text-[16px] leading-relaxed text-wine"
          >
            {error}
            {problems.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1 text-[15px]">
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

        {/*
          담아 두신 뒤 값이 바뀌었거나 못 사게 된 상품을 알립니다.
          ★ 장바구니 화면과 같은 안내를 씁니다. 두 화면이 다른 말을 하면 안 됩니다.
          ★ 값이 오른 경우 여기서도 [확인했습니다] 를 눌러야 결제로 넘어갑니다.
            장바구니를 건너뛰고 주문서로 바로 들어오는 길이 있기 때문입니다.
        */}
        <CartChangeNotice live={live} />

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px] lg:gap-16">
          <div className="flex flex-col gap-14">
            {/* ── 1. 주문 상품 ───────────────────────────── */}
            <section aria-labelledby="items-heading">
              <h2
                id="items-heading"
                className="border-b border-stone pb-4 font-serif text-[22px] text-ink"
              >
                주문 상품 {orderLines.length}건
              </h2>
              <ul>
                {/*
                  ★ 주문에 들어가지 않는 줄도 그대로 보여 줍니다. 흐리게 두고 이유를 답니다.
                    말없이 빼 버리면 손님이 담았던 것을 잃은 줄 압니다.
                */}
                {live.lines.map((line) => (
                  <li
                    key={line.key}
                    className={`flex gap-4 border-b border-stone py-5 ${
                      line.orderable ? '' : 'opacity-45'
                    }`}
                  >
                    <div className="h-[88px] w-[68px] shrink-0 overflow-hidden bg-stone">
                      <SafeImage
                        src={line.thumbnailUrl}
                        alt={`${line.brandLabel} ${line.productName}`}
                        label={line.productName}
                        width={160}
                        height={208}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      {line.brandLabel ? (
                        <p className="text-[13px] tracking-[0.16em] text-muted">
                          {line.brandLabel}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[17px] font-medium leading-snug text-ink">
                        {line.productName}
                      </p>
                      <p className="mt-1 text-[14px] text-muted">
                        {line.optionKey || '옵션 없음'} · {line.quantity}개
                      </p>
                      {line.orderable ? null : (
                        <p className="mt-1 text-[14px] font-medium text-wine">
                          {line.ok ? '이번 주문에서 뺐습니다' : line.reason}
                        </p>
                      )}
                    </div>
                    <p className="self-center whitespace-nowrap text-[16px] font-medium text-ink">
                      {formatPrice(line.unitPrice * line.quantity)}원
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[14px] leading-relaxed text-muted">
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
                className="border-b border-stone pb-4 font-serif text-[22px] text-ink"
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
                  <p className="mt-2 text-[14px] text-muted">
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
                <h2 id="receiver-heading" className="font-serif text-[22px] text-ink">
                  배송지
                </h2>
                <label className="flex items-center gap-2 text-[15px] text-ink">
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
                      disabled={postcode.state === 'loading'}
                      className="btn-secondary min-h-[48px] shrink-0 px-6 py-0 text-[15px] disabled:opacity-40"
                    >
                      {postcode.state === 'ready'
                        ? '주소 검색'
                        : postcode.state === 'loading'
                          ? '불러오는 중…'
                          : '주소 검색 다시 시도'}
                    </button>
                  </div>

                  {manualAddress ? (
                    <p
                      role="alert"
                      className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-wine"
                    >
                      {postcodeFallbackNotice(store.phone)}
                    </p>
                  ) : null}
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
                          className="border border-stone px-3 py-2 text-[14px] text-muted transition-colors hover:border-ink hover:text-ink"
                        >
                          {preset}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {live.remote ? (
                  <p className="border border-stone px-4 py-3 text-[15px] leading-relaxed text-ink">
                    제주·도서산간 지역입니다. 추가 배송비{' '}
                    {formatPrice(live.extraShippingFee)}원이 더해집니다.
                  </p>
                ) : null}
              </div>
            </section>

            {/* ── 4. 결제 수단 ───────────────────────────── */}
            <section aria-labelledby="payment-heading" ref={refs.payment}>
              <h2
                id="payment-heading"
                className="border-b border-stone pb-4 font-serif text-[22px] text-ink"
              >
                결제 수단
              </h2>

              {/* ★ 관리자가 켜 둔 수단만 나옵니다. 꺼진 수단은 서버도 받지 않습니다. */}
              <ul className="mt-6 flex flex-col gap-3">
                {methods.map((method) => (
                  <li key={method.key}>
                    <label
                      className={`flex min-h-[56px] cursor-pointer items-center gap-3 border px-5 py-4 text-[16px] transition-colors ${
                        form.paymentMethod === method.key
                          ? 'border-ink text-ink'
                          : 'border-stone text-ink'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.key}
                        checked={form.paymentMethod === method.key}
                        onChange={() => set('paymentMethod', method.key)}
                        className="h-4 w-4"
                      />
                      {method.label}
                    </label>
                  </li>
                ))}
              </ul>

              {/*
                ★ 입금자명과 현금영수증은 무통장입금에만 나옵니다. (4-A)
                  카드·간편결제는 현금영수증 대상이 아닙니다.
                  카드로 결제하는 손님에게 "입금자명" 을 물으면 무엇을 적어야 할지
                  모른 채 주문이 막힙니다.
              */}
              {isBank ? (
                <>
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
                    <p className="mt-2 text-[14px] leading-relaxed text-muted">
                      주문자와 입금자가 다르면 입금하시는 분 이름을 적어 주세요. 입금 확인이
                      빨라집니다. 계좌는 주문 완료 화면에서 안내드립니다.
                    </p>
                  </div>

                  {/*
                    현금영수증 (4-A)
                    ★ 기본값은 미체크입니다. 체크하지 않으면 아무 정보도 받지 않습니다.
                    ★ 체크하면 소득공제가 기본이고, 회원이면 가입 시 휴대폰번호가
                      이미 채워져 있어 체크만 하면 끝납니다.
                    ★ PG 가 현금영수증을 지원하지 않아 운영자가 홈택스에서 직접 발급합니다.
                      그래서 "신청 여부와 번호" 를 받아 두는 것이 전부입니다.
                  */}
                  <div className="mt-8 border-t border-stone pt-6">
                    <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-[16px] text-ink">
                      <input
                        type="checkbox"
                        checked={form.cashReceiptType !== 'none'}
                        onChange={(event) => {
                          // 체크를 켜면 소득공제가 기본입니다.
                          set('cashReceiptType', event.target.checked ? 'personal' : 'none');
                        }}
                        className="h-4 w-4"
                      />
                      현금영수증 신청
                    </label>

                    {form.cashReceiptType !== 'none' ? (
                      <div className="mt-5 border-l border-stone pl-5">
                        <ul className="flex flex-wrap gap-3">
                          {(
                            [
                              { key: 'personal', label: '소득공제 (휴대폰번호)' },
                              { key: 'business', label: '지출증빙 (사업자번호)' },
                            ] as { key: CashReceiptType; label: string }[]
                          ).map((option) => (
                            <li key={option.key}>
                              <label
                                className={`flex min-h-[48px] cursor-pointer items-center gap-2 border px-4 py-3 text-[15px] transition-colors ${
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
                              form.cashReceiptType === 'personal'
                                ? '010-1234-5678'
                                : '123-45-67890'
                            }
                            className={`mt-2 ${inputClass('cashReceiptNo')} max-w-[280px]`}
                          />
                          <p className="mt-2 text-[14px] leading-relaxed text-muted">
                            입금이 확인되면 신청하신 정보로 발급해 드립니다.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="mt-6 border border-stone px-5 py-4 text-[15px] leading-relaxed text-muted">
                  [주문하기]를 누르면 결제창이 열립니다. 결제가 끝나면 주문이 완료됩니다.
                  결제창을 닫으셔도 장바구니는 그대로 남아 있습니다.
                </p>
              )}
            </section>
          </div>

          {/* ── 5. 금액 요약 · 6. 동의 · 7. 주문하기 ────── */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="border border-stone p-6 md:p-8">
              <h2 className="font-serif text-[19px] text-ink">결제 금액</h2>

              <dl className="mt-6 flex flex-col gap-3 border-t border-stone pt-6 text-[16px]">
                <div className="flex justify-between">
                  <dt className="text-muted">상품 합계</dt>
                  <dd className="text-ink">{formatPrice(total)}원</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">배송비</dt>
                  <dd className="text-ink">
                    {live.shippingFee === 0 ? '무료' : `${formatPrice(live.shippingFee)}원`}
                  </dd>
                </div>
                {live.extraShippingFee > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted">도서산간 추가</dt>
                    <dd className="text-ink">{formatPrice(live.extraShippingFee)}원</dd>
                  </div>
                ) : null}
                {appliedPoints > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted">포인트 사용</dt>
                    <dd className="text-wine">− {formatPrice(appliedPoints)}원</dd>
                  </div>
                ) : null}
              </dl>

              {/* ── 포인트 사용 ─────────────────────────── */}
              {points ? (
                <div className="mt-6 border-t border-stone pt-6">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="use-points" className="label-xs">
                      포인트 사용
                    </label>
                    <span className="text-[14px] text-muted">
                      보유 {formatPrice(points.balance)}원
                    </span>
                  </div>

                  {canUsePoints ? (
                    <>
                      <div className="mt-2 flex gap-2">
                        <input
                          id="use-points"
                          type="number"
                          min={0}
                          max={pointLimit}
                          step={100}
                          value={usePoints === 0 ? '' : usePoints}
                          onChange={(event) => {
                            const next = Math.max(
                              0,
                              Math.min(pointLimit, Number(event.target.value) || 0)
                            );
                            setUsePoints(next);
                          }}
                          placeholder="0"
                          className="min-h-[48px] w-full border border-stone bg-transparent px-4 py-3 text-right text-[16px] tabular-nums text-ink outline-none focus:border-ink"
                        />
                        <button
                          type="button"
                          onClick={() => setUsePoints(pointLimit)}
                          className="btn-secondary min-h-[48px] shrink-0 px-4 py-0 text-[15px]"
                        >
                          전액
                        </button>
                      </div>
                      <p className="mt-2 text-[14px] leading-relaxed text-muted">
                        최대 {formatPrice(pointLimit)}원까지 쓸 수 있습니다.
                        {points.minUse > 0
                          ? ` ${formatPrice(points.minUse)}원 이상부터 사용 가능합니다.`
                          : ''}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-[14px] leading-relaxed text-muted">
                      {points.balance <= 0
                        ? '아직 사용할 수 있는 포인트가 없습니다.'
                        : `${formatPrice(points.minUse)}원 이상부터 사용하실 수 있습니다.`}
                    </p>
                  )}
                </div>
              ) : null}

              {/* ★ 이번 주문으로 쌓일 예상 적립. 화면에서 계산합니다. */}
              {expectedEarn > 0 ? (
                <p className="mt-4 border-t border-stone pt-4 text-[14px] leading-relaxed text-wine">
                  이번 주문으로 {formatPrice(expectedEarn)}P 가 적립될 예정입니다.
                  <span className="ml-1 text-muted">(배송완료 시점에 지급)</span>
                </p>
              ) : null}

              {freeShippingLeft > 0 ? (
                <p className="mt-4 text-[14px] leading-relaxed text-muted">
                  {formatPrice(freeShippingLeft)}원 더 담으시면 배송비가 무료입니다.
                </p>
              ) : null}

              <div className="mt-6 flex items-baseline justify-between border-t border-stone pt-6">
                <span className="text-[14px] tracking-[0.14em] text-muted">총 결제금액</span>
                <span className="font-display text-[30px] font-medium tracking-wide text-ink">
                  {formatPrice(totalAmount)}
                  <span className="ml-1 font-sans text-[16px]">원</span>
                </span>
              </div>

              <div ref={refs.agree} className="mt-6 border-t border-stone pt-6">
                <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed text-ink">
                  <input
                    type="checkbox"
                    checked={form.agreed}
                    onChange={(event) => set('agreed', event.target.checked)}
                    className={`mt-1 h-4 w-4 ${invalid.agreed ? 'outline outline-2 outline-wine' : ''}`}
                  />
                  <span>
                    주문 내용을 확인했으며, 구매조건 및 결제진행에 동의합니다. (필수)
                    <br />
                    <Link href="/terms" className="link-wine text-[14px]">
                      이용약관
                    </Link>{' '}
                    ·{' '}
                    <Link href="/privacy" className="link-wine text-[14px]">
                      개인정보처리방침
                    </Link>
                  </span>
                </label>
              </div>

              {/*
                ★★ 금액을 확인하지 못한 채로는 결제로 넘어가지 못하게 잠급니다.
                  아직 확인 중 · 확인 실패 · 값이 오른 상품을 아직 확인하지 않음 ·
                  주문할 상품이 하나도 없음 — 네 가지입니다.
              */}
              <button
                type="submit"
                disabled={pending || !live.canOrder}
                className="btn-primary mt-6 w-full"
              >
                {pending
                  ? isBank
                    ? '주문 접수 중…'
                    : '결제창을 여는 중…'
                  : `${formatPrice(totalAmount)}원 ${isBank ? '주문하기' : '결제하기'}`}
              </button>

              {live.canOrder ? null : (
                <p
                  role="status"
                  className="mt-3 text-center text-[14px] leading-relaxed text-wine"
                >
                  {live.blockReason}
                </p>
              )}

              <p className="mt-4 text-[14px] leading-relaxed text-muted">
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
