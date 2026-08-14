'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import RichTextEditor from '@/components/admin/RichTextEditor';
import {
  answerInquiryAction,
  updateInquiryStatusAction,
} from '@/app/admin/inquiry-actions';
import { formatDateTime } from '@/lib/format';
import {
  INQUIRY_STATUSES,
  INQUIRY_STATUS_META,
  inquiryBadgeClass,
  inquiryCategoryLabel,
  inquiryStatusLabel,
} from '@/lib/inquiry-status';
import { statusLabel } from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import type { Inquiry } from '@/lib/inquiries';
import type { Order, Template } from '@/lib/types';

type Message = { tone: 'ok' | 'error'; text: string } | null;

export default function InquiryDetail({
  inquiry,
  order,
  templates,
}: {
  inquiry: Inquiry;
  /** 관련 주문이 있으면 요약을 보여 줍니다. */
  order: Order | null;
  /** 자주 쓰는 답변 — 상품 상세 편집기의 templates 테이블을 그대로 씁니다. */
  templates: Template[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [answer, setAnswer] = useState(inquiry.answer);
  const [status, setStatus] = useState(inquiry.status);
  const [message, setMessage] = useState<Message>(null);

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      // ★ 현재 상태를 그대로 같이 보내면 '미답변'으로 덮어써집니다.
      //   '종료'로 내려 둔 문의만 그 상태를 유지하고, 나머지는 서버가 '답변완료'로 올립니다.
      const keep = status === 'closed' ? 'closed' : '';
      const result = await answerInquiryAction(inquiry.id, answer, keep);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      if (keep !== 'closed') setStatus('answered');
      setMessage({ tone: 'ok', text: '답변을 저장했습니다. 상태가 답변완료로 바뀌었습니다.' });
      router.refresh();
    });
  };

  const changeStatus = (next: string) => {
    setStatus(next);
    setMessage(null);
    startTransition(async () => {
      const result = await updateInquiryStatusAction(inquiry.id, next);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '상태를 바꿨습니다.' });
      router.refresh();
    });
  };

  /** 템플릿을 답변 뒤에 이어 붙입니다. */
  const insertTemplate = (body: string) => {
    setAnswer((prev) => (prev ? `${prev}${body}` : body));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="admin-card flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-[18px] font-semibold text-slate-900">
              {inquiry.inquiryNo}
            </h1>
            <span className={`admin-badge ${inquiryBadgeClass(inquiry.status)}`}>
              {inquiryStatusLabel(inquiry.status)}
            </span>
            {inquiry.isSecret ? (
              <span className="admin-badge bg-slate-100 text-slate-600">비밀글</span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            {inquiryCategoryLabel(inquiry.category)} ·{' '}
            {formatDateTime(inquiry.createdAt)}
          </p>
        </div>
        <Link href="/admin/inquiries" className="admin-btn">
          목록으로
        </Link>
      </div>

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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {/* ── 문의 내용 ──────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[16px] font-semibold text-slate-900">{inquiry.title}</h2>
            <div className="mt-4 whitespace-pre-line text-[14px] leading-[1.9] text-slate-800">
              {inquiry.content}
            </div>

            {inquiry.attachments.length > 0 ? (
              <ul className="mt-5 flex flex-wrap gap-3">
                {inquiry.attachments.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="문의 첨부 이미지"
                        className="h-[120px] w-[120px] rounded-md border border-slate-200 object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* ── 답변 ───────────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold text-slate-900">답변</h2>
              {inquiry.answeredAt ? (
                <span className="text-[12px] text-slate-500">
                  마지막 등록 {formatDateTime(inquiry.answeredAt)}
                </span>
              ) : null}
            </div>

            <div className="mt-3">
              <RichTextEditor
                value={answer}
                onChange={setAnswer}
                placeholder="답변을 입력하세요. 굵게 · 줄바꿈 · 링크를 쓸 수 있습니다."
              />
            </div>

            {templates.length > 0 ? (
              <div className="mt-4">
                <span className="admin-label">자주 쓰는 답변 넣기</span>
                <ul className="flex flex-wrap gap-2">
                  {templates.map((template) => (
                    <li key={template.id}>
                      <button
                        type="button"
                        onClick={() => insertTemplate(template.body)}
                        className="admin-btn"
                      >
                        {template.title}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-slate-500">
                  상품 상세 편집기에서 저장한 문구 템플릿을 그대로 씁니다.
                </p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="admin-btn-primary mt-4"
            >
              {pending ? '저장 중…' : '답변 저장'}
            </button>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
              답변을 저장하면 상태가 자동으로 <strong>답변완료</strong>가 되고, 손님의
              마이페이지·문의 조회 화면에 바로 나타납니다.
            </p>
          </section>
        </div>

        {/* ── 오른쪽 ─────────────────────────────────── */}
        <aside className="flex flex-col gap-5">
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[16px] font-semibold text-slate-900">작성자</h2>
            <dl className="mt-3 flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">이름</dt>
                <dd className="text-slate-900">{inquiry.writerName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">구분</dt>
                <dd className="text-slate-900">{inquiry.userId ? '회원' : '비회원'}</dd>
              </div>
              {inquiry.writerPhone ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">연락처</dt>
                  <dd>
                    <a href={`tel:${inquiry.writerPhone}`} className="text-blue-700">
                      {inquiry.writerPhone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {inquiry.writerEmail ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">이메일</dt>
                  <dd>
                    <a href={`mailto:${inquiry.writerEmail}`} className="text-blue-700">
                      {inquiry.writerEmail}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            {inquiry.userId ? (
              <Link
                href={`/admin/members/${inquiry.userId}`}
                className="admin-btn mt-3 w-full"
              >
                회원 상세 보기
              </Link>
            ) : null}
          </section>

          {order ? (
            <section className="admin-card p-4 md:p-5">
              <h2 className="text-[16px] font-semibold text-slate-900">관련 주문</h2>
              <dl className="mt-3 flex flex-col gap-2 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">주문번호</dt>
                  <dd className="font-mono text-slate-900">{order.orderNo}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">상태</dt>
                  <dd className="text-slate-900">{statusLabel(order.status)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">결제금액</dt>
                  <dd className="tabular-nums text-slate-900">
                    {formatPrice(order.totalAmount)}원
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">주문일</dt>
                  <dd className="text-slate-900">{formatDateTime(order.createdAt)}</dd>
                </div>
              </dl>

              <ul className="mt-3 border-t border-slate-200 pt-3 text-[13px] text-slate-700">
                {order.items
                  .filter((item) => item.itemStatus === 'normal')
                  .map((item) => (
                    <li key={item.id}>
                      · {item.productName}
                      {item.optionKey ? ` (${item.optionKey})` : ''} x{item.quantity}
                    </li>
                  ))}
              </ul>

              <Link href={`/admin/orders/${order.id}`} className="admin-btn mt-3 w-full">
                주문 상세 보기
              </Link>
            </section>
          ) : null}

          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[16px] font-semibold text-slate-900">상태</h2>
            <div className="mt-3 flex flex-col gap-2">
              {INQUIRY_STATUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={pending}
                  onClick={() => changeStatus(value)}
                  className={`rounded-md border px-3 py-2 text-left text-[14px] transition-colors ${
                    status === value
                      ? 'border-blue-700 bg-blue-700 font-semibold text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {INQUIRY_STATUS_META[value].label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
