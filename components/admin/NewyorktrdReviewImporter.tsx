'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import NewyorktrdReviewPreview, {
  type PreviewReview,
  type ReviewSelection,
} from '@/components/admin/NewyorktrdReviewPreview';
import {
  saveNewyorktrdReviews,
  type ReviewSaveItem,
  type ReviewSaveSummary,
} from '@/lib/newyorktrd-review-save';

/**
 * 뉴욕트렌딕 후기 가져오기 — 상품 수정 화면용.
 *
 * ★ 2 단계: 미리보기 → 저장
 *   1) 「미리 보기」 — /preview (글 후기, 빠름) + 선택적으로 /preview-photos (사진, 느림)
 *      를 받아 운영자에게 보여 줍니다. DB·R2 는 안 건드립니다.
 *   2) 체크한 후기·사진만 /newyorktrd-reviews (저장) 로 보냅니다.
 *
 * ★ 사진까지 받기 체크를 켜면 Vercel 에서 헤드리스 Chrome 을 띄워 알파 리뷰 위젯이
 *   그린 사진을 긁어 옵니다. 상품 1건당 15~30초가 걸리고 메모리를 많이 써, 두 명이
 *   동시에 누르면 뒤 사람은 409(바쁨) 로 돌려받습니다.
 */
export default function NewyorktrdReviewImporter({
  productId,
  productSlug,
  productNo,
}: {
  productId: string;
  productSlug: string;
  productNo: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [withPhotos, setWithPhotos] = useState(false);
  const [reviews, setReviews] = useState<PreviewReview[] | null>(null);
  const [selections, setSelections] = useState<ReviewSelection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReviewSaveSummary | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const defaultSelection = (list: PreviewReview[]): ReviewSelection[] =>
    list
      .filter((review) => !review.alreadyImported)
      .map((review) => ({
        reviewId: review.reviewId,
        photos: [...review.photos],
      }));

  const loadPreview = async () => {
    if (loading || saving || photoLoading) return;
    setLoading(true);
    setError(null);
    setReviews(null);
    setSummary(null);

    try {
      const response = await fetch('/api/admin/import/newyorktrd-reviews/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNo, productId }),
      });
      const payload = (await response.json()) as {
        error?: string;
        reviews?: PreviewReview[];
      };
      if (!response.ok) {
        setError(payload.error ?? '미리보기를 가져오지 못했습니다.');
        return;
      }
      let list: PreviewReview[] = (payload.reviews ?? []).map((review) => ({
        ...review,
        kind: 'text',
      }));

      // ★ 사진까지 받기 — 느립니다. 체크했을 때만 호출합니다.
      if (withPhotos) {
        setPhotoLoading(true);
        try {
          const photoResponse = await fetch(
            '/api/admin/import/newyorktrd-reviews/preview-photos',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ productNo, productId }),
            }
          );
          const photoPayload = (await photoResponse.json()) as {
            error?: string;
            reviews?: PreviewReview[];
          };
          if (!photoResponse.ok) {
            setError(photoPayload.error ?? '사진 미리보기를 가져오지 못했습니다.');
          } else {
            list = [...list, ...(photoPayload.reviews ?? [])];
          }
        } finally {
          setPhotoLoading(false);
        }
      }

      setReviews(list);
      setSelections(defaultSelection(list));
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : '미리보기를 가져오지 못했습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (saving || !reviews) return;
    if (selections.length === 0) {
      setError('선택한 후기가 없습니다.');
      return;
    }
    setSaving(true);
    setError(null);
    setProgress({ done: 0, total: selections.length });

    try {
      const byId = new Map(reviews.map((review) => [review.reviewId, review]));
      const items: ReviewSaveItem[] = [];
      for (const selection of selections) {
        const review = byId.get(selection.reviewId);
        if (!review) continue;
        items.push({
          reviewId: review.reviewId,
          sourceUrl: review.sourceUrl,
          writerName: review.writerName,
          rating: review.rating,
          content: review.content,
          photos: selection.photos,
          writtenAt: review.writtenAt,
          attachToExistingReviewId: review.attachToExistingReviewId,
          reimport: selection.reimport,
        });
      }

      // ★ 5건씩 나눠 보냅니다 — 하나가 시간 초과여도 나머지 결과는 정확히 셉니다.
      const result = await saveNewyorktrdReviews(productId, productSlug, items, (done, total) =>
        setProgress({ done, total })
      );
      setSummary(result);
      // ★ 미리보기는 저장이 끝난 뒤에만 닫습니다. 「가져옴」 표시는 다시 열 때 DB 에서 새로 읽습니다.
      setReviews(null);
      setSelections([]);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : '저장에 실패했습니다.'
      );
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const busy = loading || photoLoading || saving;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-amber-900">
            뉴욕트렌딕 후기 가져오기
          </h3>
          <p className="mt-1 text-[14px] leading-relaxed text-amber-900">
            상품 {productNo} 번의 최근 후기를 미리 보여 드립니다 (글 리뷰 최대 25건).
            체크한 것만 저장합니다. 사진은 한 장씩 뺄 수 있습니다. 영상은 가져오지
            않습니다.
          </p>
          <label className="mt-3 flex items-start gap-2 text-[14px] text-amber-900">
            <input
              type="checkbox"
              checked={withPhotos}
              onChange={(event) => setWithPhotos(event.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              사진까지 받기 (느림 · 15~30초)
              <span className="mt-1 block text-[13px] leading-relaxed text-amber-800">
                뉴욕트렌딕 알파 리뷰 위젯이 사진을 Shadow DOM 안에서 그려서, 글 후기
                따로·사진 따로 받습니다. 사진은 「글 없음 · 사진만」 뱃지가 붙어 미리
                보기에 섞여 나오고, 체크한 것만 저장됩니다.
              </span>
            </span>
          </label>
        </div>
        {!reviews ? (
          <button
            type="button"
            onClick={() => void loadPreview()}
            disabled={busy}
            className="admin-btn-primary shrink-0"
          >
            {loading && !photoLoading
              ? '글 받는 중…'
              : photoLoading
                ? '사진 받는 중… (느림)'
                : '미리 보기'}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded bg-red-100 px-3 py-2 text-[14px] text-red-800">
          {error}
        </p>
      ) : null}

      {reviews ? (
        <div className="mt-4 rounded-md bg-white p-3">
          <NewyorktrdReviewPreview
            reviews={reviews}
            onSelectionsChange={setSelections}
            allowReimport
          />

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || selections.length === 0}
              className="admin-btn-primary"
            >
              {saving
                ? progress
                  ? `저장 중… ${progress.done}/${progress.total}`
                  : '저장 중…'
                : `선택한 ${selections.length}건 저장`}
            </button>
            <button
              type="button"
              onClick={() => {
                setReviews(null);
                setSelections([]);
                setError(null);
              }}
              disabled={saving}
              className="admin-btn"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {summary && !reviews ? (
        <div
          role="status"
          className={`mt-3 rounded px-3 py-2 text-[14px] ${
            summary.failed > 0 ? 'bg-red-50 text-red-900' : 'bg-white text-amber-900'
          }`}
        >
          <p>
            {summary.failed > 0 ? '일부만 저장됐습니다 — ' : '저장했습니다 — '}
            새로 가져옴 <strong>{summary.imported}건</strong>
            {summary.reimported > 0 ? (
              <>
                , 다시 가져옴 <strong>{summary.reimported}건</strong>
              </>
            ) : null}
            , 이미 있던 것 <strong>{summary.skipped}건</strong>, 실패{' '}
            <strong>{summary.failed}건</strong>.
          </p>
          {summary.imported + summary.reimported > 0 ? (
            <p className="mt-1 text-[13px]">손님 상품 페이지도 바로 새로 그렸습니다.</p>
          ) : null}
          {summary.failures.length > 0 ? (
            <details className="mt-1" open>
              <summary className="cursor-pointer">실패 {summary.failures.length}건 사유</summary>
              <ul className="mt-1 list-disc pl-5 text-[13px]">
                {summary.failures.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {summary.skips.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer">건너뜀 {summary.skips.length}건 사유</summary>
              <ul className="mt-1 list-disc pl-5 text-[13px]">
                {summary.skips.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {summary.photoFailures.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer">
                사진 복사 실패 {summary.photoFailures.length}장
              </summary>
              <ul className="mt-1 list-disc pl-5 text-[13px]">
                {summary.photoFailures.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
