import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { inquiryCategoryLabel, inquiryStatusLabel } from '@/lib/inquiry-status';
import { sanitizeRichText } from '@/lib/product-utils';
import type { Inquiry } from '@/lib/inquiries';

/**
 * 손님에게 보여 주는 문의 한 건.
 * 마이페이지와 비회원 문의 조회가 함께 씁니다.
 * 훅을 쓰지 않아 서버·클라이언트 어디서든 쓸 수 있습니다.
 */
export default function InquiryDetailView({
  inquiry,
  backHref,
}: {
  inquiry: Inquiry;
  backHref?: string;
}) {
  const answerHtml = inquiry.answer ? sanitizeRichText(inquiry.answer) : '';

  return (
    <article>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-stone pb-4">
        <div>
          <p className="text-[14px] tracking-[0.14em] text-muted">
            {inquiryCategoryLabel(inquiry.category)} · {inquiry.inquiryNo}
          </p>
          <h2 className="mt-2 font-serif text-[24px] leading-snug text-ink md:text-[28px]">
            {inquiry.title}
          </h2>
        </div>
        {backHref ? (
          <Link href={backHref} className="text-[15px] text-muted underline underline-offset-4">
            목록으로
          </Link>
        ) : null}
      </div>

      <p className="mt-4 text-[15px] text-muted">
        {formatDateTime(inquiry.createdAt)} · {inquiryStatusLabel(inquiry.status)}
      </p>

      <div className="mt-8 whitespace-pre-line text-[17px] leading-[1.9] text-ink">
        {inquiry.content}
      </div>

      {inquiry.attachments.length > 0 ? (
        <ul className="mt-8 flex flex-wrap gap-3">
          {inquiry.attachments.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="문의 첨부 이미지"
                  className="h-[120px] w-[120px] border border-stone object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {answerHtml ? (
        <section aria-labelledby="answer-heading" className="mt-12 border-t border-stone pt-8">
          <h3 id="answer-heading" className="font-serif text-[19px] text-ink">
            답변
          </h3>
          <p className="mt-1 text-[14px] text-muted">
            {formatDateTime(inquiry.answeredAt)}
          </p>
          <div
            className="detail-body mt-5 text-[17px] leading-[1.9] text-ink"
            dangerouslySetInnerHTML={{ __html: answerHtml }}
          />
        </section>
      ) : (
        <section className="mt-12 border-t border-stone pt-8">
          <p className="text-[16px] leading-relaxed text-muted">
            아직 답변이 등록되지 않았습니다. 영업일 기준 1~2일 안에 답변드립니다.
          </p>
        </section>
      )}
    </article>
  );
}
