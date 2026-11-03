import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import { NewyorktrdError } from '@/lib/newyorktrd';
import {
  fetchReviewDetail,
  fetchReviewIdsPage,
  type ReviewDetail,
} from '@/lib/newyorktrd-reviews';
import { getImportedReviewLocations, getReviewDedupIndex } from '@/lib/reviews';
import { reviewDedupKey } from '@/lib/review-dedup';

/**
 * 뉴욕트렌딕 리뷰 미리보기 — DB 는 건드리지 않고 파싱만 해서 돌려줍니다.
 *
 * ★ 왜 분리했나
 *   운영자가 "손님 얼굴이 나온 사진은 빼고" "다른 상품 쪽 후기는 빼고" 처럼 눈으로 보고
 *   골라 담을 수 있어야 합니다. 미리보기 없이 바로 저장하면 그 선택을 할 자리가 없습니다.
 *   저장은 /save 라우트가 받아 처리합니다.
 *
 * ★ 왜 사진은 R2 로 안 옮기나
 *   운영자가 뺄 수도 있는 사진을 미리 올려 두면 R2 에 쓰레기가 쌓입니다. 저장 단계에서
 *   선택된 사진만 올립니다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export type ParsedReview = {
  reviewId: string;
  sourceUrl: string;
  writerName: string;
  rating: number;
  content: string;
  photos: string[];
  writtenAt: string;
  alreadyImported: boolean;
  /**
   * 「가져옴」 이 실제로 어디에 있나 (2026-11-03).
   *   here        — 이 상품에 붙어 손님 화면에 보임
   *   here-hidden — 이 상품에 붙었지만 숨김
   *   other       — 다른 상품에 붙음 (같은 뉴욕 상품을 두 번 등록한 경우 등)
   *   orphan      — 지워진 상품에 붙음 (상품을 지워도 후기는 남습니다)
   * 'new' 면 alreadyImported=false.
   */
  importStatus: ImportStatus;
  /** other 일 때 붙어 있는 상품 slug */
  importedProductSlug?: string;
  /** duplicate 일 때 — 무엇과 겹치는지 (화면 안내용) */
  duplicateOf?: string;
};

/**
 * duplicate — 같은 작성자·같은 날짜·같은 글(이모지·공백·문장부호 무시) 이
 *   이 상품에 이미 저장돼 있거나, 이번 목록 앞쪽에 이미 있음 (2026-11-03, lib/review-dedup.ts).
 *   체크할 수 없습니다. 저장 라우트도 한 번 더 거릅니다.
 */
export type ImportStatus = 'new' | 'here' | 'here-hidden' | 'other' | 'orphan' | 'duplicate';

type Payload = {
  productNo: number;
  /** 지금 보고 있는 상품. 없으면 here/other 를 못 가려 전부 'here' 로 봅니다. */
  productId?: string;
};

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  }

  let payload: Partial<Payload>;
  try {
    payload = (await request.json()) as Partial<Payload>;
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const productNo = Number(payload.productNo ?? 0);
  const productId = typeof payload.productId === 'string' ? payload.productId : '';
  if (!productNo) {
    return NextResponse.json({ error: '상품번호가 필요합니다.' }, { status: 400 });
  }

  try {
    /*
     * 뉴욕트렌딕은 상품 상세의 리뷰 영역이 최대 5페이지 × 5건입니다.
     * 1페이지부터 돌면서 ID 를 모으고, totalPages 가 뜨면 그 수만큼만 돕니다.
     */
    const reviewIds: string[] = [];
    let totalPages = 5;
    for (let page = 1; page <= totalPages; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { ids, totalPages: tp } = await fetchReviewIdsPage(productNo, page);
      if (tp && tp < totalPages) totalPages = tp;
      for (const id of ids) if (!reviewIds.includes(id)) reviewIds.push(id);
      if (ids.length === 0) break;
    }

    // 이미 가져온 후기가 어디에 붙어 있는지 한 번에 조회 (DB 가 기준 — 화면 표시만 남는 일이 없게).
    const locations = await getImportedReviewLocations('newyorktrd', reviewIds);

    // 각 리뷰 상세를 받고, 다른 상품 쪽이면 건너뜁니다.
    const reviews: ParsedReview[] = [];
    const skipped: { reviewId: string; reason: string }[] = [];

    for (const reviewId of reviewIds) {
      let detail: ReviewDetail;
      try {
        // eslint-disable-next-line no-await-in-loop
        detail = await fetchReviewDetail(reviewId, productNo);
      } catch (error) {
        skipped.push({
          reviewId,
          reason: error instanceof Error ? error.message : '내려받기 실패',
        });
        continue;
      }
      if ('skipped' in detail && detail.skipped) {
        skipped.push({ reviewId, reason: detail.reason });
        continue;
      }
      const review = detail as Exclude<ReviewDetail, { skipped: true }>;
      const location = locations.get(reviewId);
      let importStatus: ImportStatus = 'new';
      if (location) {
        if (!location.productExists) importStatus = 'orphan';
        else if (productId && location.productId !== productId) importStatus = 'other';
        else importStatus = location.isVisible ? 'here' : 'here-hidden';
      }
      reviews.push({
        reviewId: review.reviewId,
        sourceUrl: review.sourceUrl,
        writerName: review.writerName,
        rating: review.rating,
        content: review.content,
        photos: review.photos,
        writtenAt: review.writtenAt,
        alreadyImported: Boolean(location),
        importStatus,
        importedProductSlug: importStatus === 'other' ? location?.productSlug : undefined,
      });
    }

    /*
     * ── 중복 표시 (2026-11-03) ──────────────────────────────
     * 뉴욕트렌딕에 같은 글이 번호만 다르게 두 번 올라와 있으면 번호로는 못 거릅니다.
     * 이 상품에 이미 저장된 후기(우리 후기·외부·숨김 전부) 와 겹치거나,
     * 이번 목록 앞쪽과 겹치면 'duplicate' 로 바꿉니다. 이미 이 상품에 있는 본인(here) 은 그대로.
     * 상품 가져오기 화면(아직 상품이 없음, productId 없음) 에서도 목록 안 중복은 거릅니다.
     */
    {
      const saved = productId ? await getReviewDedupIndex(productId) : new Map();
      const seenInBatch = new Map<string, string>();
      for (const review of reviews) {
        const key = reviewDedupKey(review);
        if (!key) continue;
        const hit = saved.get(key);
        const isSelf = hit?.source === 'newyorktrd' && hit.sourceReviewId === review.reviewId;
        if (review.importStatus === 'here' || review.importStatus === 'here-hidden') {
          // 이미 이 상품에 저장된 후기. 먼저 저장된 다른 후기와 같은 글이면 그것도 「중복」 으로
          // 보여 줍니다 (이미 들어간 중복 — 정리 대상. 지우지는 않습니다).
          if (hit && !isSelf) {
            review.importStatus = 'duplicate';
            review.duplicateOf = hit.sourceReviewId
              ? `이미 저장된 후기 #${hit.sourceReviewId} 와 같은 글 (둘 다 저장돼 있음)`
              : '이미 저장된 우리 손님 후기와 같은 글 (둘 다 저장돼 있음)';
          } else if (!seenInBatch.has(key)) {
            seenInBatch.set(key, review.reviewId);
          }
          continue;
        }
        if (hit && !isSelf) {
          review.importStatus = 'duplicate';
          review.duplicateOf = hit.sourceReviewId
            ? `이미 저장된 후기 #${hit.sourceReviewId} 와 같은 글`
            : '이미 저장된 우리 손님 후기와 같은 글';
          continue;
        }
        const earlier = seenInBatch.get(key);
        if (earlier) {
          review.importStatus = 'duplicate';
          review.duplicateOf = `이번 목록의 #${earlier} 와 같은 글`;
          continue;
        }
        seenInBatch.set(key, review.reviewId);
      }
    }

    return NextResponse.json(
      { reviews, skipped, totalPages, found: reviewIds.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message =
      error instanceof NewyorktrdError
        ? error.message
        : error instanceof Error
          ? error.message
          : '리뷰를 가져오지 못했습니다.';
    console.error('[import/newyorktrd-reviews/preview]', productNo, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
