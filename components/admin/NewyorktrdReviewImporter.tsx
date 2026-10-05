'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * 뉴욕트렌딕 후기 가져오기 — 상품 하나짜리.
 *
 * ★ 표시광고법상 반드시 지킬 것
 *   · 뉴욕 쪽에서 가져온 후기는 손님 화면에 「뉴욕트렌딕 구매 후기」 배지가 붙습니다.
 *   · 평균 별점과 리뷰 개수에는 섞이지 않습니다 (lib/reviews.ts summarize).
 *   · 포인트는 지급되지 않습니다 (user_id=null 이라 points.ts 흐름에 안 들어감).
 *
 * ★ 흐름
 *   1~5페이지를 순서대로 돌면서 서버 라우트에 한 번씩 보냅니다.
 *   서버가 리뷰 ID 를 찾고, 이미 가져온 것은 건너뛰고, 새 후기만 저장합니다.
 *   사진은 그 자리에서 R2 로 복사합니다. 영상은 가져오지 않습니다.
 */
export default function NewyorktrdReviewImporter({
  productId,
  productSlug,
  productNo,
}: {
  productId: string;
  productSlug: string;
  /** 뉴욕트렌딕 쪽 상품번호 */
  productNo: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ page: 0, totalPages: 5 });
  const [summary, setSummary] = useState<{
    imported: number;
    skipped: number;
    failed: number;
    details: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSummary({ imported: 0, skipped: 0, failed: 0, details: [] });

    try {
      let totalPages = 5;
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      const details: string[] = [];

      for (let page = 1; page <= totalPages; page += 1) {
        setProgress({ page, totalPages });
        // eslint-disable-next-line no-await-in-loop
        const response = await fetch('/api/admin/import/newyorktrd-reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, productSlug, productNo, page }),
        });
        // eslint-disable-next-line no-await-in-loop
        const payload = (await response.json()) as {
          error?: string;
          page?: number;
          totalPages?: number;
          found?: number;
          summary?: { imported: number; skipped: number; failed: number };
          outcomes?: Array<
            | { ok: true; reviewId: string; attachments: number }
            | { ok: false; reviewId: string; reason: string }
            | { skipped: true; reviewId: string; reason: string }
          >;
        };

        if (!response.ok) {
          setError(payload.error ?? `${page}페이지를 가져오지 못했습니다.`);
          break;
        }

        if (payload.totalPages && payload.totalPages < totalPages) {
          totalPages = payload.totalPages;
        }
        if (payload.summary) {
          imported += payload.summary.imported;
          skipped += payload.summary.skipped;
          failed += payload.summary.failed;
        }
        for (const outcome of payload.outcomes ?? []) {
          if ('ok' in outcome && !outcome.ok) {
            details.push(`#${outcome.reviewId} — ${outcome.reason}`);
          }
        }
        setSummary({ imported, skipped, failed, details });

        if ((payload.found ?? 0) === 0) break;
      }
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : '리뷰를 가져오는 중 오류가 났습니다.'
      );
    } finally {
      setBusy(false);
      router.refresh();
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
            뉴욕트렌딕 상품 {productNo} 번의 최근 후기를 끌어 옵니다. 최대 25건입니다
            (뉴욕 쪽 UI 제약). 이미 가져온 후기는 건너뛰고, 사진은 우리 저장소로 복사
            합니다. 영상은 가져오지 않습니다.
            <br />
            등록된 뒤에는 손님 화면에 「뉴욕트렌딕 구매 후기」 배지가 눈에 띄게 붙고,
            평균 별점과 리뷰 개수에는 섞이지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="admin-btn-primary shrink-0"
        >
          {busy ? '가져오는 중…' : '후기 가져오기'}
        </button>
      </div>

      {busy ? (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuenow={progress.page}
            aria-valuemin={0}
            aria-valuemax={progress.totalPages}
            className="h-2 w-full overflow-hidden rounded-full bg-amber-200"
          >
            <div
              className="h-full bg-amber-700 transition-all"
              style={{
                width: `${Math.round((progress.page / progress.totalPages) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-[14px] tabular-nums text-amber-900">
            {progress.page}/{progress.totalPages} 페이지…
          </p>
        </div>
      ) : null}

      {summary && !busy ? (
        <p className="mt-3 text-[14px] text-amber-900">
          새로 가져온 후기 <strong>{summary.imported}건</strong>, 이미 있던 것{' '}
          <strong>{summary.skipped}건</strong>, 실패 <strong>{summary.failed}건</strong>.
          {summary.failed > 0 ? (
            <>
              <br />
              <span className="text-amber-800">
                실패한 후기: {summary.details.slice(0, 5).join(' / ')}
                {summary.details.length > 5
                  ? ` 외 ${summary.details.length - 5}건`
                  : ''}
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded bg-red-100 px-3 py-2 text-[14px] text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
