'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
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

/** 확장자로 동영상인지 판단합니다. */
const VIDEO_PATTERN = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

function isVideo(url: string): boolean {
  return VIDEO_PATTERN.test(url);
}

type Media = {
  url: string;
  video: boolean;
  reviewId: string;
  /** 썸네일 위에 겹쳐 보여 줄 후기 앞부분 */
  excerpt: string;
  rating: number;
};

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

/** 재생 표시 — 이모지 대신 SVG 로 그립니다. */
function PlayMark() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/60">
        <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
          <path d="M0 0l12 7-12 7z" fill="#F6F5F2" />
        </svg>
      </span>
    </span>
  );
}

/**
 * 상품 상세의 리뷰 영역.
 *
 * ★ is_sponsored 인 리뷰에는 반드시 표시 문구를 붙입니다.
 *   표시광고법상 요구되는 표시라 숨기거나 흐리게 만들지 않습니다.
 * ★ 작성자명은 서버에서 이미 가려서 내려옵니다. (lib/reviews.ts)
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
  /** 확대해서 볼 미디어의 위치. -1 이면 닫힘 */
  const [zoom, setZoom] = useState(-1);

  /** 사진·영상이 붙은 후기의 미디어만 모읍니다. */
  const gallery = useMemo<Media[]>(() => {
    const list: Media[] = [];
    for (const review of reviews) {
      // 줄바꿈을 공백으로 바꿔 두 줄 안에 깔끔히 들어가게 합니다.
      const excerpt = review.content.replace(/\s+/g, ' ').trim();
      for (const url of review.attachments) {
        list.push({
          url,
          video: isVideo(url),
          reviewId: review.id,
          excerpt,
          rating: review.rating,
        });
      }
    }
    return list;
  }, [reviews]);

  /* ── 갤러리에서 후기로 이동 ──────────────────────────
   * ★ 썸네일을 누르면 확대가 아니라 그 후기 자리로 부드럽게 내려갑니다.
   *   사진만 크게 봐서는 무슨 후기인지 알 수 없어 맥락이 끊깁니다.
   *   확대 보기는 후기 카드 안의 사진을 눌렀을 때만 뜹니다. */
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [highlighted, setHighlighted] = useState('');

  const goToReview = useCallback(
    (reviewId: string) => {
      // 사진 없는 후기가 걸러져 있으면 먼저 필터를 풀어 줍니다.
      if (photoOnly) setPhotoOnly(false);

      // 목록이 다시 그려진 뒤에 스크롤해야 위치가 맞습니다.
      window.requestAnimationFrame(() => {
        const card = cardRefs.current[reviewId];
        if (!card) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlighted(reviewId);
        // 1.5초 뒤 강조를 풉니다.
        window.setTimeout(() => setHighlighted(''), 1500);
      });
    },
    [photoOnly]
  );

  const visible = useMemo(() => {
    const filtered = photoOnly
      ? reviews.filter((review) => review.attachments.length > 0)
      : [...reviews];

    if (sort === 'high') {
      filtered.sort((a, b) => b.rating - a.rating);
    } else if (sort === 'low') {
      filtered.sort((a, b) => a.rating - b.rating);
    } else {
      // 기본은 최신순. 관리자가 지정한 작성일(writtenAt)을 기준으로 봅니다.
      filtered.sort(
        (a, b) =>
          new Date(b.writtenAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.writtenAt ?? a.createdAt ?? 0).getTime()
      );
    }
    return filtered;
  }, [reviews, sort, photoOnly]);

  const current = zoom >= 0 && zoom < gallery.length ? gallery[zoom] : null;
  const move = (step: number) => {
    if (gallery.length === 0) return;
    setZoom((prev) => (prev + step + gallery.length) % gallery.length);
  };

  return (
    <section aria-labelledby="review-title" className="section">
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
          {/* ── 포토·영상 갤러리 ─────────────────────────
           * 미디어가 하나도 없으면 이 영역을 통째로 감춥니다. */}
          {gallery.length > 0 ? (
            <div className="mt-10 border-b border-stone pb-10">
              <p className="text-[13px] tracking-[0.14em] text-muted">
                후기 사진 · 영상 {gallery.length}
              </p>
              <ul className="mt-4 flex gap-2 overflow-x-auto pb-2 md:gap-3">
                {gallery.map((media, index) => (
                  <li key={`${media.reviewId}-${media.url}`} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => goToReview(media.reviewId)}
                      aria-label={`후기 보기 — 별점 ${media.rating}점`}
                      className="group relative block h-[132px] w-[132px] overflow-hidden border border-stone md:h-[156px] md:w-[156px]"
                    >
                      {media.video ? (
                        <>
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <video
                            src={media.url}
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                          <PlayMark />
                        </>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={media.url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                        />
                      )}

                      {/* ★ 무슨 후기인지 알 수 있게 본문 앞부분을 겹쳐 둡니다.
                          그림자가 아니라 그라데이션이라 규칙에 어긋나지 않습니다. */}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 via-ink/45 to-transparent px-2 pb-2 pt-6 text-left">
                        <span className="block text-[11px] tracking-[0.1em] text-paper/90">
                          {'★'.repeat(media.rating)}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-paper">
                          {media.excerpt}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* ── 요약 ─────────────────────────────────── */}
          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr] md:gap-12">
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
                <li
                  key={review.id}
                  ref={(node) => {
                    cardRefs.current[review.id] = node;
                  }}
                  className={`scroll-mt-24 border-b border-stone px-3 py-8 transition-colors duration-500 ${
                    highlighted === review.id ? 'bg-stone/40' : 'bg-transparent'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <StarRating value={review.rating} />
                    <span className="text-[14px] text-ink">{review.writerName}</span>
                    <span className="text-[13px] text-muted">
                      {formatDate(review.writtenAt ?? review.createdAt)}
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
                      {review.attachments.map((url) => {
                        const index = gallery.findIndex((media) => media.url === url);
                        return (
                          <li key={url}>
                            <button
                              type="button"
                              onClick={() => setZoom(index)}
                              aria-label={
                                isVideo(url) ? '후기 영상 보기' : '후기 사진 크게 보기'
                              }
                              className="relative block h-[110px] w-[110px] overflow-hidden border border-stone"
                            >
                              {isVideo(url) ? (
                                <>
                                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                  <video
                                    src={url}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="h-full w-full object-cover"
                                  />
                                  <PlayMark />
                                </>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={url}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-opacity hover:opacity-80"
                                />
                              )}
                            </button>
                          </li>
                        );
                      })}
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

      {/* ── 확대 보기 — 좌우로 넘길 수 있습니다 ────────── */}
      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="후기 사진"
          onClick={() => setZoom(-1)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-5"
        >
          {current.video ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={current.url}
              controls
              autoPlay
              playsInline
              onClick={(event) => event.stopPropagation()}
              className="max-h-[86vh] max-w-[90vw]"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.url}
              alt="후기 사진"
              onClick={(event) => event.stopPropagation()}
              className="max-h-[86vh] max-w-[90vw] object-contain"
            />
          )}

          {gallery.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  move(-1);
                }}
                aria-label="이전"
                className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-paper"
              >
                <svg width="14" height="24" viewBox="0 0 14 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M13 1L2 12l11 11" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  move(1);
                }}
                aria-label="다음"
                className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-paper"
              >
                <svg width="14" height="24" viewBox="0 0 14 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M1 1l11 11L1 23" />
                </svg>
              </button>
              <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[13px] tabular-nums text-paper">
                {zoom + 1} / {gallery.length}
              </p>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => setZoom(-1)}
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
