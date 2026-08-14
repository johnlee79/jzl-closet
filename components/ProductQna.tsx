'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ProductInquiryForm from '@/components/ProductInquiryForm';
import { formatDate } from '@/lib/format';
import { inquiryCategoryLabel, inquiryStatusLabel } from '@/lib/inquiry-status';
import type { PublicInquiry } from '@/lib/inquiries';

/** 한 화면에 보여 줄 문의 수 */
const PAGE_SIZE = 10;

/** 자물쇠 — 이모지 대신 SVG 로 그립니다. */
function LockMark() {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
      className="mr-1.5 inline-block shrink-0 align-[-2px]"
    >
      <rect x="0.6" y="5.6" width="10.8" height="7.8" />
      <path d="M3 5.5V3.5a3 3 0 016 0v2" />
    </svg>
  );
}

/**
 * 상품 상세의 Q&A 탭.
 *
 * ★ 비밀글은 제목·내용·답변이 아예 넘어오지 않습니다. (서버에서 잘라 냅니다)
 *   본인은 마이페이지 또는 문의 조회에서 확인합니다.
 * ★ 작성자명은 서버에서 이미 가려서 내려옵니다.
 */
export default function ProductQna({
  inquiries,
  productId,
  productSlug,
  productName,
}: {
  inquiries: PublicInquiry[];
  productId: string;
  productSlug: string;
  productName: string;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState('');

  /**
   * 로그인 여부는 브라우저에서 따로 물어봅니다.
   * ★ 서버에서 쿠키를 읽으면 상품 상세가 정적 생성에서 빠집니다. (SEO 최우선)
   *   문의 작성 폼을 펼칠 때만 확인하면 되므로 늦게 와도 문제없습니다.
   */
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { loggedIn?: boolean } | null) => {
        if (alive && data?.loggedIn) setIsMember(true);
      })
      .catch(() => {
        /* 로그인 확인 실패는 비회원으로 봅니다. */
      });
    return () => {
      alive = false;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(inquiries.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const rows = inquiries.slice(start, start + PAGE_SIZE);

  return (
    <section aria-labelledby="inquiry-title" className="section">
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
        <button
          type="button"
          onClick={() => {
            setOpen((prev) => !prev);
            setDone('');
          }}
          className="btn-secondary"
        >
          {open ? '작성 닫기' : '상품 문의하기'}
        </button>
      </div>

      {done ? (
        <p
          role="status"
          className="mt-6 border border-stone bg-paper px-5 py-4 text-[15px] leading-relaxed text-ink"
        >
          {done}
        </p>
      ) : null}

      {/* ── 문의 작성 — 이 상품이 자동으로 연결됩니다 ───── */}
      {open ? (
        <div className="mt-8 border border-stone p-5 md:p-8">
          <ProductInquiryForm
            productId={productId}
            productSlug={productSlug}
            productName={productName}
            isMember={isMember}
            onDone={(message) => {
              setOpen(false);
              setDone(message);
              router.refresh();
            }}
          />
        </div>
      ) : null}

      {inquiries.length === 0 ? (
        <p className="mt-10 border-t border-stone pt-10 text-[16px] leading-relaxed text-ink">
          아직 등록된 문의가 없습니다. 사이즈나 소재가 궁금하시면 편하게 물어봐 주세요.
        </p>
      ) : (
        <>
          <ul className="mt-10 border-t border-stone">
            {rows.map((inquiry) => {
              const expanded = openId === inquiry.id;
              const canOpen = !inquiry.isSecret;

              return (
                <li key={inquiry.id} className="border-b border-stone">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-5">
                    <span className="w-[70px] shrink-0 text-[13px] tracking-[0.14em] text-muted">
                      {inquiryCategoryLabel(inquiry.category)}
                    </span>

                    <span className="min-w-0 flex-1 text-[16px] leading-snug">
                      {canOpen ? (
                        <button
                          type="button"
                          onClick={() => setOpenId(expanded ? null : inquiry.id)}
                          aria-expanded={expanded}
                          className="text-left text-ink underline-offset-4 hover:underline"
                        >
                          {inquiry.title}
                        </button>
                      ) : (
                        <span className="text-muted">
                          <LockMark />
                          {inquiry.title}
                        </span>
                      )}
                    </span>

                    <span className="w-[80px] shrink-0 text-[13px] text-muted">
                      {inquiry.writerName}
                    </span>
                    <span className="w-[92px] shrink-0 text-[13px] text-muted">
                      {formatDate(inquiry.createdAt)}
                    </span>
                    <span
                      className={`w-[68px] shrink-0 text-[13px] ${
                        inquiry.hasAnswer ? 'text-ink' : 'text-muted'
                      }`}
                    >
                      {inquiry.hasAnswer ? '답변완료' : inquiryStatusLabel(inquiry.status)}
                    </span>
                  </div>

                  {expanded && canOpen ? (
                    <div className="pb-7">
                      <p className="whitespace-pre-line text-[15px] leading-[1.9] text-ink">
                        {inquiry.content}
                      </p>

                      {inquiry.answer ? (
                        <div className="mt-5 border-l-2 border-stone pl-5">
                          <p className="text-[13px] tracking-[0.14em] text-muted">
                            판매자 답변
                            {inquiry.answeredAt
                              ? ` · ${formatDate(inquiry.answeredAt)}`
                              : ''}
                          </p>
                          <div
                            className="mt-2 text-[15px] leading-[1.9] text-ink [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: inquiry.answer }}
                          />
                        </div>
                      ) : (
                        <p className="mt-4 text-[13px] text-muted">
                          아직 답변이 등록되지 않았습니다. 영업일 기준 1~2일 안에
                          답변드리고 있습니다.
                        </p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <nav aria-label="문의 목록 페이지" className="mt-8 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setPage(number)}
                  aria-current={number === page ? 'page' : undefined}
                  className={`tap-target min-w-[40px] border px-3 py-2 text-[14px] tabular-nums transition-colors ${
                    number === page
                      ? 'border-ink text-ink'
                      : 'border-stone text-muted hover:text-ink'
                  }`}
                >
                  {number}
                </button>
              ))}
            </nav>
          ) : null}
        </>
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
