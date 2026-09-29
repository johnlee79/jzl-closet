'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { submitInquiryAction } from '@/app/(shop)/inquiry/actions';
import MemberPhotoPicker from '@/components/MemberPhotoPicker';
import { formatPhone } from '@/lib/format';
import { INQUIRY_CATEGORIES, MAX_ATTACHMENTS } from '@/lib/inquiry-status';

/** 회원이 고를 수 있는 본인 주문 (서버가 넘겨 줍니다) */
export type OrderOption = { id: string; label: string };

export type InquiryFormProps = {
  /** 로그인 회원 정보. 비로그인이면 null */
  member: { name: string; phone: string; email: string } | null;
  /** 회원의 최근 주문 목록 */
  orders: OrderOption[];
  /** 상품 문의로 들어온 경우 */
  product?: { id: string; name: string } | null;
  /** 주문 상세에서 들어온 경우 미리 고를 주문 id */
  defaultOrderId?: string;
};

const inputClass =
  'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

export default function InquiryForm({
  member,
  orders,
  product = null,
  defaultOrderId = '',
}: InquiryFormProps) {
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    category: product ? 'product' : 'order',
    title: '',
    content: '',
    writerName: member?.name ?? '',
    writerPhone: member?.phone ?? '',
    writerEmail: member?.email ?? '',
    password: '',
    // ★ 기본으로 켜 둡니다. 개인정보가 담기기 쉬운 글이기 때문입니다.
    isSecret: true,
    orderId: defaultOrderId,
    orderNo: '',
  });

  const [attachments, setAttachments] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ inquiryNo: string; isMember: boolean } | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  /* ── 저장 ───────────────────────────────────────────── */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError('');
    startTransition(async () => {
      const result = await submitInquiryAction({
        ...form,
        attachments,
        productId: product?.id ?? '',
      });
      if (!result.ok) {
        setError(result.error);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setDone(result.data);
    });
  };

  if (done) {
    return (
      <div className="mt-12 max-w-[520px] border border-stone p-6 md:p-8">
        <h2 className="font-serif text-[22px] text-ink">문의를 접수했습니다</h2>
        <p className="mt-4 border border-stone px-5 py-4">
          <span className="text-[14px] tracking-[0.14em] text-muted">문의번호</span>
          <span className="mt-2 block select-all text-[26px] font-semibold tabular-nums tracking-[0.02em] text-ink">
            {done.inquiryNo}
          </span>
        </p>
        <p className="mt-5 text-[16px] leading-relaxed text-ink">
          영업일 기준 1~2일 안에 답변드립니다.
          {done.isMember
            ? ' 답변이 등록되면 마이페이지 > 문의 내역에서 확인하실 수 있습니다.'
            : ' 문의번호와 조회용 비밀번호를 적어 두세요. 답변 확인에 필요합니다.'}
        </p>
        <div className="btn-row mt-6">
          {done.isMember ? (
            <Link href="/mypage/inquiries" className="btn-primary">
              문의 내역 보기
            </Link>
          ) : (
            <Link href="/inquiry/lookup" className="btn-primary">
              문의 조회하기
            </Link>
          )}
          <Link href="/products" className="btn-secondary">
            쇼핑 계속하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-12 max-w-[640px]">
      {error ? (
        <p
          role="alert"
          className="mb-8 border border-wine bg-wine/5 px-5 py-4 text-[16px] leading-relaxed text-wine"
        >
          {error}
        </p>
      ) : null}

      {product ? (
        <p className="mb-8 border border-stone px-5 py-4 text-[16px] leading-relaxed text-ink">
          <span className="text-muted">상품 문의 · </span>
          {product.name}
        </p>
      ) : null}

      {/* ── 유형 ──────────────────────────────────────── */}
      <div>
        <span className="label-xs block">문의 유형 *</span>
        <ul className="mt-3 flex flex-wrap gap-2">
          {INQUIRY_CATEGORIES.map((item) => (
            <li key={item.key}>
              <label
                className={`flex min-h-[48px] cursor-pointer items-center gap-2 border px-5 py-3 text-[16px] transition-colors ${
                  form.category === item.key
                    ? 'border-ink text-ink'
                    : 'border-stone text-muted hover:border-ink hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  checked={form.category === item.key}
                  onChange={() => set('category', item.key)}
                  className="h-4 w-4"
                />
                {item.label}
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* ── 관련 주문 ─────────────────────────────────── */}
      <div className="mt-8">
        <label htmlFor="order" className="label-xs block">
          관련 주문 (선택)
        </label>
        {member ? (
          orders.length > 0 ? (
            <select
              id="order"
              value={form.orderId}
              onChange={(event) => set('orderId', event.target.value)}
              className={inputClass}
            >
              <option value="">선택 안 함</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-2 text-[15px] text-muted">주문 내역이 없습니다.</p>
          )
        ) : (
          <>
            <input
              id="order"
              type="text"
              value={form.orderNo}
              onChange={(event) => set('orderNo', event.target.value.toUpperCase())}
              placeholder="ORD-20260814-0001"
              className={inputClass}
            />
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              주문 관련 문의라면 주문번호를 적어 주세요. 아래 연락처와 함께 확인합니다.
            </p>
          </>
        )}
      </div>

      {/* ── 제목·내용 ─────────────────────────────────── */}
      <div className="mt-8">
        <label htmlFor="title" className="label-xs block">
          제목 *
        </label>
        <input
          id="title"
          type="text"
          value={form.title}
          onChange={(event) => set('title', event.target.value)}
          maxLength={120}
          className={inputClass}
        />
      </div>

      <div className="mt-6">
        <label htmlFor="content" className="label-xs block">
          내용 *
        </label>
        <textarea
          id="content"
          value={form.content}
          onChange={(event) => set('content', event.target.value)}
          rows={8}
          placeholder="문의하실 내용을 자세히 적어 주시면 더 빠르게 도와드릴 수 있습니다."
          className="mt-2 w-full resize-none border border-stone bg-transparent p-4 text-[16px] leading-relaxed text-ink outline-none focus:border-ink"
        />
      </div>

      {/* ── 첨부 ──────────────────────────────────────── */}
      <div className="mt-6">
        <span className="label-xs block">
          이미지 첨부 (선택, 최대 {MAX_ATTACHMENTS}장)
        </span>
        {member ? (
          <MemberPhotoPicker
            folder="inquiries"
            max={MAX_ATTACHMENTS}
            value={attachments}
            onChange={setAttachments}
            buttonLabel="이미지 선택"
            unit="장"
          />
        ) : (
          /*
           * ★ 비회원은 사진을 올릴 수 없습니다. 누구나 저장소에 파일을 쌓을 수
           *   있게 되기 때문입니다. 누르면 실패하는 버튼 대신 처음부터 알립니다.
           */
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            이미지 첨부는 로그인한 회원만 할 수 있습니다.{' '}
            <Link
              href="/login?next=%2Finquiry%2Fnew"
              className="text-ink underline underline-offset-4"
            >
              로그인하기
            </Link>
          </p>
        )}
      </div>

      {/* ── 작성자 ────────────────────────────────────── */}
      <section aria-labelledby="writer-heading" className="mt-12">
        <h2
          id="writer-heading"
          className="border-b border-stone pb-4 font-serif text-[19px] text-ink"
        >
          작성자 정보
        </h2>

        {member ? (
          <p className="mt-4 text-[16px] leading-relaxed text-ink">
            {member.name}
            {member.phone ? ` · ${member.phone}` : ''}
            {member.email ? ` · ${member.email}` : ''}
            <span className="mt-1 block text-[14px] text-muted">
              회원 정보로 등록됩니다. 답변은 마이페이지에서 확인하실 수 있습니다.
            </span>
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-5">
            <div>
              <label htmlFor="writerName" className="label-xs block">
                이름 *
              </label>
              <input
                id="writerName"
                type="text"
                value={form.writerName}
                onChange={(event) => set('writerName', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="writerPhone" className="label-xs block">
                연락처
              </label>
              <input
                id="writerPhone"
                type="tel"
                inputMode="numeric"
                value={form.writerPhone}
                onChange={(event) => set('writerPhone', formatPhone(event.target.value))}
                placeholder="010-1234-5678"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="writerEmail" className="label-xs block">
                이메일
              </label>
              <input
                id="writerEmail"
                type="email"
                value={form.writerEmail}
                onChange={(event) => set('writerEmail', event.target.value)}
                placeholder="hello@example.com"
                className={inputClass}
              />
              <p className="mt-2 text-[14px] text-muted">
                연락처와 이메일 중 하나는 꼭 남겨 주세요.
              </p>
            </div>
            <div>
              <label htmlFor="password" className="label-xs block">
                조회용 비밀번호 *
              </label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(event) => set('password', event.target.value)}
                placeholder="4자 이상"
                autoComplete="new-password"
                className={`${inputClass} max-w-[240px]`}
              />
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                답변을 확인할 때 문의번호와 함께 씁니다. 잊지 않도록 적어 두세요.
              </p>
            </div>
          </div>
        )}

        <label className="mt-6 flex cursor-pointer items-center gap-3 text-[16px] text-ink">
          <input
            type="checkbox"
            checked={form.isSecret}
            onChange={(event) => set('isSecret', event.target.checked)}
            className="h-4 w-4"
          />
          비밀글로 등록 (다른 손님에게 제목과 내용이 보이지 않습니다)
        </label>
      </section>

      <button type="submit" disabled={pending} className="btn-primary mt-10 w-full">
        {pending ? '접수 중…' : '문의 등록'}
      </button>

      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        문의 내용에는 주민등록번호·카드번호 같은 민감한 정보를 적지 말아 주세요.
      </p>
    </form>
  );
}
