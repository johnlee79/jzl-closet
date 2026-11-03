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
 *
 * ★ 「가져옴」 을 네 갈래로 나눠 보여 줍니다 (2026-11-03)
 *   이 상품에 노출 / 숨김 / 다른 상품에 붙음 / 지워진 상품에 붙음.
 *   예전엔 전부 「가져옴」 하나라, 지워진 상품에 붙은 후기가 손님 화면에 안 보이는데도
 *   운영자는 저장이 된 줄로만 알았습니다.
 *   allowReimport 를 켜면 「다시 가져오기」 로 그 후기를 체크할 수 있게 풀어 줍니다.
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
  /** 미리보기 라우트가 알려 주는 「가져옴」 의 실제 위치. 없으면 예전처럼 「가져옴」 하나로. */
  importStatus?: 'new' | 'here' | 'here-hidden' | 'other' | 'orphan';
  /** importStatus='other' 일 때 붙어 있는 상품 slug */
  importedProductSlug?: string;
  /**
   * 'text' — 보통 글 리뷰 (사진이 있을 수도 없을 수도).
   * 'photo-only' — 사진 그룹 (글 짝맞춤 실패) 또는 "같은 손님 사진 묶음" 입니다.
   *   미리보기에 「글 없음 · 사진만」 뱃지로 표시해 사장님이 보고 고를 수 있게 합니다.
   */
  kind?: 'text' | 'photo-only';
  /**
   * 사진 그룹핑이 기존 글 리뷰와 짝맞춤에 성공했을 때 그 source_review_id.
   * 저장 라우트가 이 값을 보고 **기존 리뷰에 사진만 붙입니다** (새로 안 만듦).
   */
  attachToExistingReviewId?: string;
};

export type ReviewSelection = {
  reviewId: string;
  /** 체크된 사진 URL 들만 */
  photos: string[];
  /** 이미 있는 후기를 다시 가져오기 (이 상품으로 옮기고 덮어씀) */
  reimport?: boolean;
};

const IMPORT_BADGE: Record<string, { label: string; className: string; title: string }> = {
  here: {
    label: '가져옴',
    className: 'bg-slate-200 text-slate-700',
    title: '이 상품에 붙어 손님 화면에 보입니다',
  },
  'here-hidden': {
    label: '가져옴 · 숨김',
    className: 'bg-amber-100 text-amber-800',
    title: '이 상품에 붙어 있지만 숨김 상태라 손님 화면에 안 보입니다',
  },
  other: {
    label: '다른 상품에 붙음',
    className: 'bg-red-100 text-red-800',
    title: '다른 상품에 붙어 있어 이 상품 화면에는 안 보입니다',
  },
  orphan: {
    label: '지워진 상품에 붙음',
    className: 'bg-red-100 text-red-800',
    title: '지워진 상품에 붙어 있어 손님 화면 어디에도 안 보입니다',
  },
};

/** 손님 화면에 이 상품 후기로 안 보이는 「가져옴」 — 다시 가져오기를 권할 대상 */
function isMisplaced(review: PreviewReview): boolean {
  return (
    review.alreadyImported &&
    (review.importStatus === 'other' ||
      review.importStatus === 'orphan' ||
      review.importStatus === 'here-hidden')
  );
}

type SelectionState = {
  checked: boolean;
  /** 사진 index → 체크 여부 */
  photoChecked: boolean[];
};

export default function NewyorktrdReviewPreview({
  reviews,
  onSelectionsChange,
  allowReimport = false,
}: {
  reviews: PreviewReview[];
  /** 체크 상태가 바뀔 때마다 부모가 받아 둡니다. 저장은 부모가 터뜨립니다. */
  onSelectionsChange?: (selections: ReviewSelection[]) => void;
  /** 「다시 가져오기」 버튼을 보여 줄지 (상품 수정 화면에서만 켭니다) */
  allowReimport?: boolean;
}) {
  /** 「다시 가져오기」 를 누른 후기 — 이것들은 「가져옴」 이어도 체크할 수 있습니다. */
  const [reimportIds, setReimportIds] = useState<Set<string>>(() => new Set());
  const canReimport = (review: PreviewReview) =>
    allowReimport && review.alreadyImported && review.kind !== 'photo-only';
  /** 지금 체크할 수 있나 — 새 후기이거나, 다시 가져오기를 켠 후기 */
  const isSelectable = (review: PreviewReview, ids: Set<string> = reimportIds) =>
    !review.alreadyImported || ids.has(review.reviewId);

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

  const emit = (next: Record<string, SelectionState>, ids: Set<string> = reimportIds) => {
    if (!onSelectionsChange) return;
    const selections: ReviewSelection[] = reviews
      .filter((review) => isSelectable(review, ids) && next[review.reviewId]?.checked)
      .map((review) => ({
        reviewId: review.reviewId,
        photos: review.photos.filter(
          (_, index) => next[review.reviewId]?.photoChecked[index]
        ),
        ...(review.alreadyImported ? { reimport: true } : {}),
      }));
    onSelectionsChange(selections);
  };

  /** 다시 가져오기 켜기/끄기. 켜면 그 후기와 사진을 전부 체크합니다. */
  const setReimport = (targets: PreviewReview[], on: boolean) => {
    const ids = new Set(reimportIds);
    for (const review of targets) {
      if (!canReimport(review)) continue;
      if (on) ids.add(review.reviewId);
      else ids.delete(review.reviewId);
    }
    setReimportIds(ids);
    setState((prev) => {
      const next = { ...prev };
      for (const review of targets) {
        if (!canReimport(review)) continue;
        next[review.reviewId] = {
          checked: on,
          photoChecked: review.photos.map(() => on),
        };
      }
      emit(next, ids);
      return next;
    });
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
    if (!isSelectable(review)) return;
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
        (review) => isSelectable(review) && review.rating <= 3 && state[review.reviewId]?.checked
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
        if (!isSelectable(review)) continue;
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
        (review) =>
          (!review.alreadyImported || reimportIds.has(review.reviewId)) &&
          state[review.reviewId]?.checked
      ).length,
    [reviews, state, reimportIds]
  );
  const misplaced = useMemo(
    () => reviews.filter((review) => isMisplaced(review) && review.kind !== 'photo-only'),
    [reviews]
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

      {misplaced.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-50 px-3 py-2 text-[14px] leading-relaxed text-red-800">
          <span>
            「가져옴」 중 <strong>{misplaced.length}건</strong>은 이 상품 손님 화면에 안 보입니다
            (지워진 상품·다른 상품에 붙었거나 숨김).
          </span>
          {allowReimport ? (
            <button
              type="button"
              onClick={() => setReimport(misplaced, true)}
              className="admin-btn min-h-0 px-2 py-1 text-[13px]"
            >
              {misplaced.length}건 모두 다시 가져오기
            </button>
          ) : null}
        </div>
      ) : null}

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
          const reimporting = reimportIds.has(review.reviewId);
          const disabled = review.alreadyImported && !reimporting;
          const badge = review.alreadyImported
            ? IMPORT_BADGE[review.importStatus ?? 'here'] ?? IMPORT_BADGE.here
            : null;
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
                    {badge ? (
                      <span
                        title={badge.title}
                        className={`inline-flex items-center px-2 py-0.5 text-[12px] ${badge.className}`}
                      >
                        {badge.label}
                        {review.importStatus === 'other' && review.importedProductSlug
                          ? ` (${review.importedProductSlug})`
                          : ''}
                      </span>
                    ) : null}
                    {reimporting ? (
                      <span className="inline-flex items-center bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-700">
                        다시 가져올 예정 — 이 상품으로 옮기고 다시 보이게 합니다
                      </span>
                    ) : null}
                    {review.kind === 'photo-only' && !review.attachToExistingReviewId ? (
                      <span
                        title="알파 리뷰 위젯에서 받은 사진 묶음입니다 (글 짝맞춤 실패)"
                        className="inline-flex items-center bg-blue-50 px-2 py-0.5 text-[12px] text-blue-700"
                      >
                        글 없음 · 사진만
                      </span>
                    ) : null}
                    {review.kind === 'photo-only' && review.attachToExistingReviewId ? (
                      <span
                        title="이미 가져온 글 후기에 사진만 덧붙입니다"
                        className="inline-flex items-center bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-700"
                      >
                        기존 글 후기에 사진 추가
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

              {canReimport(review) ? (
                <div className="mt-2 pl-7">
                  <button
                    type="button"
                    onClick={() => setReimport([review], !reimporting)}
                    className="admin-btn min-h-0 px-2 py-1 text-[13px]"
                  >
                    {reimporting ? '다시 가져오기 취소' : '다시 가져오기'}
                  </button>
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
