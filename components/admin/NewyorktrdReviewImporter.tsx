'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import NewyorktrdReviewPreview, {
  type PreviewReview,
  type ReviewSelection,
} from '@/components/admin/NewyorktrdReviewPreview';

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
  const [summary, setSummary] = useState<{
    imported: number;
    skipped: number;
    failed: number;
    details: string[];
    photoFailures: string[];
  } | null>(null);

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
        body: JSON.stringify({ productNo }),
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

    try {
      const byId = new Map(reviews.map((review) => [review.reviewId, review]));
      const body = {
        productId,
        productSlug,
        selections: selections
          .map((selection) => {
            const review = byId.get(selection.reviewId);
            if (!review) return null;
            return {
              reviewId: review.reviewId,
              sourceUrl: review.sourceUrl,
              writerName: review.writerName,
              rating: review.rating,
              content: review.content,
              photos: selection.photos,
              writtenAt: review.writtenAt,
              attachToExistingReviewId: review.attachToExistingReviewId,
            };
          })
          .filter(Boolean),
      };

      const response = await fetch('/api/admin/import/newyorktrd-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: string;
        imported?: number;
        skipped?: number;
        failed?: number;
        outcomes?: Array<
          | {
              ok: true;
              reviewId: string;
              attachments: number;
              photoFailures: { url: string; reason: string }[];
            }
          | { ok: false; reviewId: string; reason: string }
          | { skipped: true; reviewId: string; reason: string }
        >;
      };
      if (!response.ok) {
        setError(payload.error ?? '저장에 실패했습니다.');
        return;
      }
      const details = (payload.outcomes ?? [])
        .filter(
          (outcome): outcome is { ok: false; reviewId: string; reason: string } =>
            'ok' in outcome && !outcome.ok
        )
        .map((outcome) => `#${outcome.reviewId} — ${outcome.reason}`);
      const photoFailures: string[] = [];
      for (const outcome of payload.outcomes ?? []) {
        if ('ok' in outcome && outcome.ok && Array.isArray(outcome.photoFailures)) {
          for (const failure of outcome.photoFailures) {
            photoFailures.push(`#${outcome.reviewId} — ${failure.reason}`);
          }
        }
      }
      setSummary({
        imported: payload.imported ?? 0,
        skipped: payload.skipped ?? 0,
        failed: payload.failed ?? 0,
        details,
        photoFailures,
      });
      setReviews(null);
      setSelections([]);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : '저장에 실패했습니다.'
      );
    } finally {
      setSaving(false);
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
          />

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || selections.length === 0}
              className="admin-btn-primary"
            >
              {saving ? '저장 중…' : `선택한 ${selections.length}건 저장`}
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
        <div className="mt-3 rounded bg-white px-3 py-2 text-[14px] text-amber-900">
          <p>
            새로 가져온 후기 <strong>{summary.imported}건</strong>, 이미 있던 것{' '}
            <strong>{summary.skipped}건</strong>, 실패{' '}
            <strong>{summary.failed}건</strong>.
          </p>
          {summary.failed > 0 ? (
            <p className="mt-1 text-amber-800">
              저장 실패: {summary.details.slice(0, 3).join(' / ')}
              {summary.details.length > 3 ? ` 외 ${summary.details.length - 3}건` : ''}
            </p>
          ) : null}
          {summary.photoFailures.length > 0 ? (
            <p className="mt-1 text-amber-800">
              사진 복사 실패 {summary.photoFailures.length}장:{' '}
              {summary.photoFailures.slice(0, 3).join(' / ')}
              {summary.photoFailures.length > 3
                ? ` 외 ${summary.photoFailures.length - 3}장`
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
