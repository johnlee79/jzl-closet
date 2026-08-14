'use client';

import { useState, useTransition } from 'react';
import { submitInquiryAction } from '@/app/(shop)/inquiry/actions';
import { formatPhone } from '@/lib/format';
import { INQUIRY_CATEGORIES } from '@/lib/inquiry-status';

const inputClass =
  'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

/**
 * 상품 상세 Q&A 탭에서 바로 쓰는 문의 폼.
 *
 * ★ 어느 상품인지 화면에서 고르지 않습니다. 보고 있던 상품이 자동으로 붙습니다.
 * ★ 비회원도 쓸 수 있습니다. 다만 비회원 글은 비밀글로 고정하고
 *   나중에 조회할 때 쓸 비밀번호를 받습니다.
 *   (공개글로 두면 이름·연락처가 아무에게나 보입니다)
 */
export default function ProductInquiryForm({
  productId,
  productName,
  isMember,
  onDone,
}: {
  productId: string;
  productName: string;
  isMember: boolean;
  onDone: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    category: 'product',
    title: '',
    content: '',
    writerName: '',
    writerPhone: '',
    writerEmail: '',
    password: '',
    // 회원은 공개/비밀을 고를 수 있습니다. 비회원은 비밀글 고정입니다.
    isSecret: !isMember,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError('');

    startTransition(async () => {
      const result = await submitInquiryAction({
        category: form.category,
        title: form.title,
        content: form.content,
        writerName: form.writerName,
        writerPhone: form.writerPhone,
        writerEmail: form.writerEmail,
        password: form.password,
        // 비회원은 언제나 비밀글입니다.
        isSecret: isMember ? form.isSecret : true,
        attachments: [],
        orderId: '',
        orderNo: '',
        productId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onDone(
        isMember
          ? `문의가 접수되었습니다. (${result.data.inquiryNo}) 답변은 마이페이지 > 문의 내역에서 확인하실 수 있습니다.`
          : `문의가 접수되었습니다. 문의번호 ${result.data.inquiryNo} 와 입력하신 비밀번호로 [문의 조회] 에서 답변을 확인하실 수 있습니다.`
      );
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <p className="text-[13px] tracking-[0.14em] text-muted">문의할 상품</p>
      <p className="mt-1.5 text-[16px] leading-snug text-ink">{productName}</p>

      <div className="mt-6 flex max-w-[560px] flex-col gap-5">
        <div>
          <label htmlFor="qna-category" className="label-xs block">
            문의 유형
          </label>
          <select
            id="qna-category"
            value={form.category}
            onChange={(event) => set('category', event.target.value)}
            className={inputClass}
          >
            {INQUIRY_CATEGORIES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="qna-title" className="label-xs block">
            제목
          </label>
          <input
            id="qna-title"
            type="text"
            value={form.title}
            onChange={(event) => set('title', event.target.value)}
            maxLength={120}
            placeholder="사이즈 문의드립니다"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="qna-content" className="label-xs block">
            내용
          </label>
          <textarea
            id="qna-content"
            value={form.content}
            onChange={(event) => set('content', event.target.value)}
            rows={5}
            placeholder="키·몸무게나 평소 입으시는 사이즈를 함께 알려 주시면 더 정확히 안내해 드릴 수 있습니다."
            className="mt-2 w-full resize-none border border-stone bg-transparent p-4 text-[15px] leading-relaxed text-ink outline-none placeholder:text-muted focus:border-ink"
          />
        </div>

        {isMember ? (
          <label className="flex cursor-pointer items-center gap-3 text-[15px] text-ink">
            <input
              type="checkbox"
              checked={form.isSecret}
              onChange={(event) => set('isSecret', event.target.checked)}
              className="h-4 w-4"
            />
            비밀글로 남기기 (나와 관리자만 볼 수 있습니다)
          </label>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="qna-name" className="label-xs block">
                  이름
                </label>
                <input
                  id="qna-name"
                  type="text"
                  value={form.writerName}
                  onChange={(event) => set('writerName', event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="qna-phone" className="label-xs block">
                  연락처
                </label>
                <input
                  id="qna-phone"
                  type="tel"
                  inputMode="numeric"
                  value={form.writerPhone}
                  onChange={(event) => set('writerPhone', formatPhone(event.target.value))}
                  placeholder="010-1234-5678"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="qna-email" className="label-xs block">
                  이메일
                </label>
                <input
                  id="qna-email"
                  type="email"
                  value={form.writerEmail}
                  onChange={(event) => set('writerEmail', event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="qna-password" className="label-xs block">
                  조회용 비밀번호
                </label>
                <input
                  id="qna-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => set('password', event.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              연락처와 이메일 중 하나는 꼭 적어 주세요. 비회원 문의는 비밀글로 저장되며,
              문의번호와 비밀번호로만 확인하실 수 있습니다.
            </p>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-5 text-[14px] leading-relaxed text-wine">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !form.title.trim() || !form.content.trim()}
        className="btn-primary mt-8"
      >
        {pending ? '등록 중…' : '문의 등록'}
      </button>
    </form>
  );
}
