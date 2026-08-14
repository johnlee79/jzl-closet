'use client';

import { useMemo, useState } from 'react';
import StarRating from '@/components/StarRating';
import { formatDate } from '@/lib/format';
import { SPONSORED_NOTICE } from '@/lib/site-config';
import type { Review, ReviewSummary } from '@/lib/reviews';

type SortKey = 'new' | 'high' | 'low';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'new', label: '최신순' },
  { key: 'high', label: '별점 높은순' },
  { key: 'low', label: '별점 낮은순' },
];

/** 별점 분포 막대 — 라이브러리 없이 폭만 조절해 그립니다. */
function DistributionBar({
  rating,
  count,
  total,
}: {
  rating: number;
  count: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <li className="flex items-center gap-3 text-[13px]">
      <span className="w-8 shrink-0 text-muted">{rating}점</span>
      <span className="h-2 flex-1 overflow-hidden bg-stone">
        <span
          className="block h-full bg-wine"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-muted">{count}</span>
    </li>
  );
}

/**
 * 상품 상세의 리뷰 영역.
 *
 * ★ is_sponsored 인 리뷰에는 반드시 표시 문구를 붙입니다.
 *   표시광고법상 요구되는 표시라 숨기거나 흐리게 만들지 않습니다.
 */
export default function ProductReviews({
  reviews,
  summary,
}: {
  reviews: Review[];
  summary: ReviewSummary;
}) {
  const [sort, setSort] = useState<SortKey>('new');
  const [photoOnly, setPhotoOnly] = useState(false);
  /** 확대해서 볼 이미지 */
  const [zoom, setZoom] = useState<string | null>(null);

  const visible = useMemo(() => {
    const filtered = photoOnly
      ? reviews.filter((review) => review.attachments.length > 0)
      : [...reviews];

    if (sort === 'high') {
      filtered.sort((a, b) => b.rating - a.rating);
    } else if (sort === 'low') {
      filtered.sort((a, b) => a.rating - b.rating);
    } else {
      filtered.sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      );
    }
    return filtered;
  }, [reviews, sort, photoOnly]);

  return (
    <section aria-labelledby="review-title" className="section border-t border-stone">
      <p className="label-xs">REVIEW</p>
      <h2
        id="review-title"
        className="mt-3 font-serif text-[22px] leading-snug text-ink md:text-[28px]"
      >
        상품 후기
      </h2>

      {summary.count === 0 ? (
        <p className="mt-10 border-t border-stone pt-10 text-[16px] leading-relaxed text-ink">
          아직 등록된 후기가 없습니다. 상품을 받아 보신 뒤 첫 후기를 남겨 주세요.
        </p>
      ) : (
        <>
          {/* ── 요약 ─────────────────────────────────── */}
          <div className="mt-10 grid grid-cols-1 gap-8 border-t border-stone pt-10 md:grid-cols-[220px_1fr] md:gap-12">
            <div>
              <p className="font-display text-[44px] leading-none text-ink">
                {summary.average.toFixed(1)}
              </p>
              <div className="mt-3">
                <StarRating value={summary.average} size={18} />
              </div>
              <p className="mt-2 text-[14px] text-muted">후기 {summary.count}개</p>
            </div>

            <div>
              <ul className="flex flex-col gap-2">
                {[5, 4, 3, 2, 1].map((rating) => (
                  <DistributionBar
                    key={rating}
                    rating={rating}
                    count={summary.distribution[rating] ?? 0}
                    total={summary.count}
                  />
                ))}
              </ul>

              {summary.topTags.length > 0 ? (
                <div className="mt-6">
                  <p className="text-[13px] tracking-[0.14em] text-muted">
                    많이 선택한 점
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {summary.topTags.map((item) => (
                      <li
                        key={item.tag}
                        className="border border-stone px-3 py-1.5 text-[14px] text-ink"
                      >
                        {item.tag}
                        <span className="ml-1.5 text-muted">{item.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── 정렬·필터 ────────────────────────────── */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-b border-stone pb-4">
            <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink">
              <input
                type="checkbox"
                checked={photoOnly}
                onChange={(event) => setPhotoOnly(event.target.checked)}
                className="h-4 w-4"
              />
              사진 있는 후기만 ({summary.photoCount})
            </label>

            <div className="flex items-center gap-4">
              {SORTS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSort(option.key)}
                  aria-pressed={sort === option.key}
                  className={`tap-target text-[14px] tracking-[0.1em] transition-colors duration-200 ${
                    sort === option.key ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── 목록 ─────────────────────────────────── */}
          {visible.length === 0 ? (
            <p className="py-14 text-[16px] leading-relaxed text-ink">
              사진이 있는 후기가 아직 없습니다.
            </p>
          ) : (
            <ul>
              {visible.map((review) => (
                <li key={review.id} className="border-b border-stone py-8">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <StarRating value={review.rating} />
                    <span className="text-[14px] text-ink">{review.writerName}</span>
                    <span className="text-[13px] text-muted">
                      {formatDate(review.createdAt)}
                    </span>
                  </div>

                  {review.tags.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {review.tags.map((tag) => (
                        <li
                          key={tag}
                          className="bg-stone/40 px-2.5 py-1 text-[13px] text-ink"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <p className="mt-4 whitespace-pre-line text-[16px] leading-[1.9] text-ink">
                    {review.content}
                  </p>

                  {review.attachments.length > 0 ? (
                    <ul className="mt-4 flex flex-wrap gap-3">
                      {review.attachments.map((url) => (
                        <li key={url}>
                          <button
                            type="button"
                            onClick={() => setZoom(url)}
                            aria-label="후기 사진 크게 보기"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className="h-[110px] w-[110px] border border-stone object-cover transition-opacity hover:opacity-80"
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {/* ★ 체험단·무상제공 후기 표시. 법적으로 요구되는 표시입니다. */}
                  {review.isSponsored ? (
                    <p className="mt-4 text-[12px] leading-relaxed text-muted">
                      {SPONSORED_NOTICE}
                    </p>
                  ) : null}

                  {review.adminReply ? (
                    <div className="mt-5 border-l-2 border-stone pl-5">
                      <p className="text-[13px] tracking-[0.14em] text-muted">
                        판매자 답변
                      </p>
                      <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.9] text-ink">
                        {review.adminReply}
                      </p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── 이미지 확대 보기 ─────────────────────────── */}
      {zoom ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="후기 사진"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoom}
            alt="후기 사진"
            className="max-h-[90vh] max-w-[90vw] object-contain"
          />
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label="닫기"
            className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center text-paper"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" aria-hidden="true">
              <path d="M1 1l16 16M17 1L1 17" />
            </svg>
          </button>
        </div>
      ) : null}
    </section>
  );
}
