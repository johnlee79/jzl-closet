import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { inquiryCategoryLabel, inquiryStatusLabel } from '@/lib/inquiry-status';
import type { PublicInquiry } from '@/lib/inquiries';

/**
 * 상품 상세의 문의 목록.
 *
 * ★ 비밀글은 제목이 "비밀글입니다." 로 이미 바뀐 상태로 넘어옵니다.
 *   (lib/inquiries.ts 의 getProductInquiries 가 서버에서 가립니다)
 *   여기서는 클릭할 수 있는 링크도 만들지 않습니다.
 */
export default function ProductInquiries({
  inquiries,
  productSlug,
}: {
  inquiries: PublicInquiry[];
  productSlug: string;
}) {
  return (
    <section aria-labelledby="inquiry-title" className="section border-t border-stone">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Q&amp;A</p>
          <h2
            id="inquiry-title"
            className="mt-3 font-serif text-[22px] leading-snug text-ink md:text-[28px]"
          >
            상품 문의
          </h2>
        </div>
        <Link href={`/inquiry/new?product=${productSlug}`} className="btn-secondary">
          상품 문의하기
        </Link>
      </div>

      {inquiries.length === 0 ? (
        <p className="mt-10 border-t border-stone pt-10 text-[16px] leading-relaxed text-ink">
          아직 등록된 문의가 없습니다. 사이즈나 소재가 궁금하시면 편하게 물어봐 주세요.
        </p>
      ) : (
        <ul className="mt-10 border-t border-stone">
          {inquiries.map((inquiry) => (
            <li
              key={inquiry.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-stone py-5"
            >
              <span className="w-[80px] shrink-0 text-[13px] tracking-[0.14em] text-muted">
                {inquiryCategoryLabel(inquiry.category)}
              </span>
              <span className="min-w-0 flex-1 text-[16px] leading-snug text-ink">
                {inquiry.isSecret ? (
                  <span className="text-muted">🔒 {inquiry.title}</span>
                ) : (
                  inquiry.title
                )}
              </span>
              <span className="w-[90px] shrink-0 text-[13px] text-muted">
                {inquiry.writerName}
              </span>
              <span className="w-[100px] shrink-0 text-[13px] text-muted">
                {formatDate(inquiry.createdAt)}
              </span>
              <span
                className={`w-[70px] shrink-0 text-[13px] ${
                  inquiry.hasAnswer ? 'text-ink' : 'text-muted'
                }`}
              >
                {inquiryStatusLabel(inquiry.status)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        비밀글은 작성하신 분과 관리자만 볼 수 있습니다. 답변은{' '}
        <Link href="/mypage/inquiries" className="link-wine">
          마이페이지
        </Link>{' '}
        또는{' '}
        <Link href="/inquiry/lookup" className="link-wine">
          문의 조회
        </Link>
        에서 확인해 주세요.
      </p>
    </section>
  );
}
