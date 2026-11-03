/**
 * 뉴욕트렌딕 후기 저장 — 브라우저 쪽 도우미 (상품 수정 화면 · 상품 가져오기 화면 공용).
 *
 * ★ 왜 나눠서 보내나 (2026-11-03)
 *   저장 라우트는 사진을 한 장씩 R2 로 옮겨 느립니다 (maxDuration 60초).
 *   25건을 한 번에 보내면 중간에 시간 초과가 나 앞쪽 몇 건만 저장되고,
 *   화면은 「저장 실패」 한 줄만 보여 몇 건이 들어갔는지 알 수 없었습니다.
 *   그 뒤 미리보기를 다시 열면 들어간 것만 「가져옴」 으로 흐리게 나와 헷갈렸습니다.
 *   CHUNK 건씩 끊어 보내고, 묶음 하나가 통째로 실패해도 그 묶음만 실패로 셉니다.
 */

export type ReviewSaveItem = {
  reviewId: string;
  sourceUrl: string;
  writerName: string;
  rating: number;
  content: string;
  photos: string[];
  writtenAt: string;
  attachToExistingReviewId?: string;
  reimport?: boolean;
};

export type ReviewSaveSummary = {
  imported: number;
  reimported: number;
  skipped: number;
  failed: number;
  /** 실패한 후기 — 「#번호 — 사유」 */
  failures: string[];
  /** 건너뛴 후기 — 「#번호 — 사유」 */
  skips: string[];
  /** 사진만 실패 — 「#번호 — 사유」 */
  photoFailures: string[];
};

type Outcome =
  | {
      ok: true;
      reviewId: string;
      reimported?: boolean;
      photoFailures?: { url: string; reason: string }[];
    }
  | { ok: false; reviewId: string; reason: string }
  | { skipped: true; reviewId: string; reason: string };

const CHUNK = 5;

export async function saveNewyorktrdReviews(
  productId: string,
  productSlug: string,
  items: ReviewSaveItem[],
  onProgress?: (done: number, total: number) => void
): Promise<ReviewSaveSummary> {
  const summary: ReviewSaveSummary = {
    imported: 0,
    reimported: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    skips: [],
    photoFailures: [],
  };

  for (let start = 0; start < items.length; start += CHUNK) {
    const chunk = items.slice(start, start + CHUNK);
    let outcomes: Outcome[] | null = null;
    let chunkError = '';
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch('/api/admin/import/newyorktrd-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, productSlug, selections: chunk }),
      });
      // 시간 초과면 JSON 이 아닌 오류 페이지가 옵니다.
      // eslint-disable-next-line no-await-in-loop
      const text = await response.text();
      let payload: { error?: string; outcomes?: Outcome[] } = {};
      try {
        payload = JSON.parse(text) as typeof payload;
      } catch {
        payload = {};
      }
      if (!response.ok || !Array.isArray(payload.outcomes)) {
        chunkError =
          payload.error ??
          (response.status === 504
            ? '시간 초과 (사진이 많으면 생깁니다) — 일부는 저장됐을 수 있으니 미리보기를 다시 열어 확인해 주세요'
            : `서버 오류 (HTTP ${response.status})`);
      } else {
        outcomes = payload.outcomes;
      }
    } catch (error) {
      chunkError = error instanceof Error ? error.message : '네트워크 오류';
    }

    if (!outcomes) {
      summary.failed += chunk.length;
      for (const item of chunk) summary.failures.push(`#${item.reviewId} — ${chunkError}`);
    } else {
      const answered = new Set<string>();
      for (const outcome of outcomes) {
        answered.add(outcome.reviewId);
        if ('skipped' in outcome) {
          summary.skipped += 1;
          summary.skips.push(`#${outcome.reviewId} — ${outcome.reason}`);
        } else if (outcome.ok) {
          if (outcome.reimported) summary.reimported += 1;
          else summary.imported += 1;
          for (const failure of outcome.photoFailures ?? []) {
            summary.photoFailures.push(`#${outcome.reviewId} — ${failure.reason}`);
          }
        } else {
          summary.failed += 1;
          summary.failures.push(`#${outcome.reviewId} — ${outcome.reason}`);
        }
      }
      // 서버가 답을 안 준 건 (번호 비어 있음 등) 도 실패로 셉니다 — 조용히 사라지지 않게.
      for (const item of chunk) {
        if (!answered.has(item.reviewId)) {
          summary.failed += 1;
          summary.failures.push(`#${item.reviewId} — 서버가 결과를 돌려주지 않았습니다`);
        }
      }
    }
    onProgress?.(Math.min(start + CHUNK, items.length), items.length);
  }

  return summary;
}
