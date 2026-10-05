'use client';

import { useMemo, useState } from 'react';
import StarRating from '@/components/StarRating';
import { formatDate } from '@/lib/format';

/** 손님 화면과 똑같은 ◇ 아이콘. 작게 — 큰 배지는 더 이상 쓰지 않습니다. */
const PARTNER_REVIEW_NOTICE =
  '제휴 매장에서 구매한 고객님의 후기입니다 (뉴욕트렌딕)';
function PartnerReviewMark() {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center text-slate-500"
      title={PARTNER_REVIEW_NOTICE}
      aria-label={PARTNER_REVIEW_NOTICE}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        aria-hidden="true"
      >
        <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" />
      </svg>
    </span>
  );
}

/**
 * 뉴욕트렌딕 리뷰 미리보기 — 운영자가 눈으로 보고 체크해서 저장.
 *
 * ★ 반드시 지킬 것 — 표시광고법
 *   별점이 낮다는 이유만으로 체크 해제하면 공정위가 "불리한 후기 삭제" 로 봅니다.
 *   저점(3점 이하) 체크를 풀면 **한 번만** 안내를 띄웁니다. 막지는 않습니다.
 *   얼굴 노출·욕설·다른 상품 후기처럼 분명한 이유가 있을 때만 빼야 합니다.
 *
 * ★ 사진 하나하나도 체크 가능
 *   손님 얼굴이 나온 사진만 빼고 싶을 때가 있어서. 사진 미체크는 저점 경고 대상이 아닙니다.
 *
 * ★ 이미 가져온 후기 (alreadyImported) 는 흐리게·체크 못 하게 (「가져옴」 배지).
 *   다시 눌러도 새 후기만 담깁니다.
 */

export type PreviewReview = {
  reviewId: string;
  sourceUrl: string;
  writerName: string;
  rating: number;
  content: string;
  photos: string[];
  writtenAt: string;
  alreadyImported: boolean;
  /**
   * 'text' — 보통 글 리뷰 (사진이 있을 수도 없을 수도).
   * 'photo-only' — 사진 리뷰인데 글·작성자·날짜를 짝맞춤 못한 경우. 미리보기에
   *   「글 없음 · 사진만」 뱃지로 표시해 사장님이 보고 고를 수 있게 합니다.
   */
  kind?: 'text' | 'photo-only';
};

export type ReviewSelection = {
  reviewId: string;
  /** 체크된 사진 URL 들만 */
  photos: string[];
};

type SelectionState = {
  checked: boolean;
  /** 사진 index → 체크 여부 */
  photoChecked: boolean[];
};

export default function NewyorktrdReviewPreview({
  reviews,
  onSelectionsChange,
}: {
  reviews: PreviewReview[];
  /** 체크 상태가 바뀔 때마다 부모가 받아 둡니다. 저장은 부모가 터뜨립니다. */
  onSelectionsChange?: (selections: ReviewSelection[]) => void;
}) {
  // 상태 초기값 — 이미 가져온 것은 체크 꺼짐, 나머지는 전부 체크 켜짐.
  const [state, setState] = useState<Record<string, SelectionState>>(() => {
    const init: Record<string, SelectionState> = {};
    for (const review of reviews) {
      init[review.reviewId] = {
        checked: !review.alreadyImported,
        photoChecked: review.photos.map(() => !review.alreadyImported),
      };
    }
    return init;
  });

  const [lowRatingNoticed, setLowRatingNoticed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const emit = (next: Record<string, SelectionState>) => {
    if (!onSelectionsChange) return;
    const selections: ReviewSelection[] = reviews
      .filter((review) => !review.alreadyImported && next[review.reviewId]?.checked)
      .map((review) => ({
        reviewId: review.reviewId,
        photos: review.photos.filter(
          (_, index) => next[review.reviewId]?.photoChecked[index]
        ),
      }));
    onSelectionsChange(selections);
  };

  const maybeWarnLowRating = (review: PreviewReview) => {
    if (lowRatingNoticed) return;
    if (review.rating > 3) return;
    setLowRatingNoticed(true);
    setNotice(
      '별점이 낮다는 이유만으로 빼면 표시광고법 위반이 될 수 있습니다. ' +
        '얼굴 노출 · 욕설 · 다른 상품 후기 같은 이유일 때만 빼 주세요.'
    );
  };

  const toggleReview = (review: PreviewReview, nextChecked: boolean) => {
    if (review.alreadyImported) return;
    if (!nextChecked) maybeWarnLowRating(review);
    setState((prev) => {
      const next = {
        ...prev,
        [review.reviewId]: {
          checked: nextChecked,
          photoChecked: review.photos.map(() => nextChecked),
        },
      };
      emit(next);
      return next;
    });
  };

  const togglePhoto = (reviewId: string, index: number, nextChecked: boolean) => {
    setState((prev) => {
      const current = prev[reviewId];
      if (!current) return prev;
      const photoChecked = [...current.photoChecked];
      photoChecked[index] = nextChecked;
      const next = { ...prev, [reviewId]: { ...current, photoChecked } };
      emit(next);
      return next;
    });
  };

  const selectAll = (value: boolean) => {
    // 저점(3점 이하) 리뷰가 끼어 있는데 전부 해제라면 안내를 띄웁니다.
    if (!value && !lowRatingNoticed) {
      const hasLow = reviews.some(
        (review) => !review.alreadyImported && review.rating <= 3 && state[review.reviewId]?.checked
      );
      if (hasLow) {
        setLowRatingNoticed(true);
        setNotice(
          '별점이 낮다는 이유만으로 빼면 표시광고법 위반이 될 수 있습니다. ' +
            '얼굴 노출 · 욕설 · 다른 상품 후기 같은 이유일 때만 빼 주세요.'
        );
      }
    }
    setState((prev) => {
      const next: Record<string, SelectionState> = { ...prev };
      for (const review of reviews) {
        if (review.alreadyImported) continue;
        next[review.reviewId] = {
          checked: value,
          photoChecked: review.photos.map(() => value),
        };
      }
      emit(next);
      return next;
    });
  };

  const selectableCount = useMemo(
    () => reviews.filter((review) => !review.alreadyImported).length,
    [reviews]
  );
  const checkedCount = useMemo(
    () =>
      reviews.filter(
        (review) => !review.alreadyImported && state[review.reviewId]?.checked
      ).length,
    [reviews, state]
  );

  if (reviews.length === 0) {
    return (
      <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-[15px] text-slate-600">
        가져올 수 있는 후기가 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[13px] text-slate-500">
        <PartnerReviewMark />
        <span>표시는 제휴 매장에서 구매한 고객님의 후기입니다 — 손님 화면에도 같은 표시가 나갑니다</span>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-[14px] text-slate-700">
        <span>
          새 후기 <strong>{selectableCount}건</strong> 중{' '}
          <strong className="text-slate-900">{checkedCount}건</strong> 선택
          {selectableCount < reviews.length ? (
            <>
              {' '}· 이미 가져온 후기 {reviews.length - selectableCount}건 (「가져옴」)
            </>
          ) : null}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => selectAll(true)}
            className="admin-btn min-h-0 px-2 py-1 text-[13px]"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={() => selectAll(false)}
            className="admin-btn min-h-0 px-2 py-1 text-[13px]"
          >
            전체 해제
          </button>
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-md bg-red-50 px-3 py-2 text-[14px] leading-relaxed text-red-800"
        >
          ★ {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-2 text-[13px] text-red-700 underline"
          >
            알겠습니다
          </button>
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {reviews.map((review) => {
          const sel = state[review.reviewId];
          const checked = sel?.checked ?? false;
          const disabled = review.alreadyImported;
          return (
            <li
              key={review.reviewId}
              className={`rounded-md border p-3 ${
                disabled
                  ? 'border-slate-200 bg-slate-50 opacity-70'
                  : checked
                    ? 'border-slate-300 bg-white'
                    : 'border-dashed border-slate-300 bg-white'
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => toggleReview(review, event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StarRating value={review.rating} size={14} />
                    <span className="text-[15px] text-slate-800">{review.writerName}</span>
                    <span className="text-[13px] text-slate-500">
                      {formatDate(review.writtenAt)}
                    </span>
                    <PartnerReviewMark />
                    {disabled ? (
                      <span className="inline-flex items-center bg-slate-200 px-2 py-0.5 text-[12px] text-slate-700">
                        가져옴
                      </span>
                    ) : null}
                    {review.kind === 'photo-only' ? (
                      <span
                        title="알파 리뷰 위젯이 사진-글 짝을 안 내놓아, 사진 단건으로 가져옵니다"
                        className="inline-flex items-center bg-blue-50 px-2 py-0.5 text-[12px] text-blue-700"
                      >
                        글 없음 · 사진만
                      </span>
                    ) : null}
                    {review.kind !== 'photo-only' && review.rating <= 3 ? (
                      <span
                        title="저점 후기 — 체크 해제 전에 사유를 확인해 주세요"
                        className="inline-flex items-center bg-red-50 px-2 py-0.5 text-[12px] text-red-700"
                      >
                        저점
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800">
                    {review.content || '(글 없음)'}
                  </p>
                </div>
              </label>

              {review.photos.length > 0 ? (
                <div className="mt-3 pl-7">
                  <p className="mb-1.5 text-[13px] text-slate-500">
                    사진 — 한 장씩 뺄 수 있습니다 (손님 얼굴 노출 등)
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {review.photos.map((url, index) => {
                      const photoChecked = sel?.photoChecked[index] ?? false;
                      return (
                        <li key={url} className="relative">
                          <label className="block cursor-pointer">
                            <input
                              type="checkbox"
                              checked={photoChecked}
                              disabled={disabled || !checked}
                              onChange={(event) =>
                                togglePhoto(review.reviewId, index, event.target.checked)
                              }
                              className="absolute left-1 top-1 z-10 h-4 w-4"
                            />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className={`h-[100px] w-[100px] border border-slate-200 object-cover ${
                                !photoChecked ? 'opacity-30' : ''
                              }`}
                              loading="lazy"
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {review.sourceUrl ? (
                <div className="mt-2 pl-7">
                  <a
                    href={review.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[13px] text-slate-500 underline hover:text-slate-700"
                  >
                    원본 보기
                  </a>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
