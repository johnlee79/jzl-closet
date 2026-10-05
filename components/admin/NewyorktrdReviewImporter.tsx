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
 * ★ 2단계: 미리보기 → 저장
 *   1) 「미리 보기」 — /preview 라우트로 파싱만 받아 운영자에게 보여 줍니다. DB·R2 는 안 건드립니다.
 *   2) 체크한 후기·사진만 /newyorktrd-reviews (저장) 로 보냅니다.
 *
 * ★ 표시광고법 — 미리보기 컴포넌트가 저점 체크 해제를 안내합니다.
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
  const [saving, setSaving] = useState(false);
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
  const [refetching, setRefetching] = useState(false);
  const [refetchSummary, setRefetchSummary] = useState<{
    examined: number;
    updated: number;
    keptEmpty: number;
    failed: number;
  } | null>(null);

  const loadPreview = async () => {
    if (loading || saving) return;
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
      const list = payload.reviews ?? [];
      setReviews(list);
      // 초기 선택 — 이미 가져온 것 제외하고 모든 사진 포함
      setSelections(
        list
          .filter((review) => !review.alreadyImported)
          .map((review) => ({
            reviewId: review.reviewId,
            photos: [...review.photos],
          }))
      );
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
      // 선택 안에서 글·별점·날짜 등은 미리보기에서 받아 둔 값을 그대로 다시 보냅니다.
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

  const refetchPhotos = async () => {
    if (refetching) return;
    if (
      !window.confirm(
        '이미 가져온 뉴욕트렌딕 후기들의 사진을 다시 받아 올까요?\n\n' +
          '• 사진이 있는 리뷰만 교체합니다 (0 장이면 기존 사진 그대로 둠)\n' +
          '• R2 에 새 사진이 올라갑니다'
      )
    )
      return;
    setRefetching(true);
    setRefetchSummary(null);
    setError(null);
    try {
      const response = await fetch(
        '/api/admin/import/newyorktrd-reviews/refetch-photos',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, productSlug, productNo }),
        }
      );
      const data = (await response.json()) as {
        error?: string;
        examined?: number;
        updated?: number;
        keptEmpty?: number;
        failed?: number;
      };
      if (!response.ok) {
        setError(data.error ?? '사진을 다시 받지 못했습니다.');
        return;
      }
      setRefetchSummary({
        examined: data.examined ?? 0,
        updated: data.updated ?? 0,
        keptEmpty: data.keptEmpty ?? 0,
        failed: data.failed ?? 0,
      });
      router.refresh();
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : '사진을 다시 받지 못했습니다.'
      );
    } finally {
      setRefetching(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-amber-900">
            뉴욕트렌딕 후기 가져오기
          </h3>
          <p className="mt-1 text-[14px] leading-relaxed text-amber-900">
            상품 {productNo} 번의 최근 후기를 받아 미리 보여 드립니다 (최대 25건). 눈으로
            확인한 뒤 체크한 것만 저장합니다. 사진은 한 장씩 뺄 수 있습니다. 영상은
            가져오지 않습니다.
            <br />
            <span className="text-[13px] text-amber-800">
              ★ 뉴욕트렌딕은 손님 사진 후기를 외부 위젯(Alpha Review)에 두어, 현재
              서버 HTML 로는 사진이 들어오지 않을 수 있습니다. 사진이 나중에 올라오면
              「사진 다시 받기」 로 보충할 수 있습니다.
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {!reviews ? (
            <button
              type="button"
              onClick={() => void loadPreview()}
              disabled={loading || saving || refetching}
              className="admin-btn-primary"
            >
              {loading ? '불러오는 중…' : '미리 보기'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void refetchPhotos()}
            disabled={loading || saving || refetching}
            className="admin-btn"
          >
            {refetching ? '사진 받는 중…' : '사진 다시 받기'}
          </button>
        </div>
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
              {saving
                ? '저장 중…'
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

      {refetchSummary ? (
        <p className="mt-3 rounded bg-white px-3 py-2 text-[14px] text-amber-900">
          사진 다시 받기 — 확인 <strong>{refetchSummary.examined}건</strong> · 새 사진으로
          교체 <strong>{refetchSummary.updated}건</strong> · 사진 없어 그대로 둠{' '}
          <strong>{refetchSummary.keptEmpty}건</strong> · 실패{' '}
          <strong>{refetchSummary.failed}건</strong>
        </p>
      ) : null}
    </div>
  );
}
