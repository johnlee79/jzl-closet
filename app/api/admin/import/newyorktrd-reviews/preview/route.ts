import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import { NewyorktrdError } from '@/lib/newyorktrd';
import {
  fetchReviewDetail,
  fetchReviewIdsPage,
  type ReviewDetail,
} from '@/lib/newyorktrd-reviews';
import { hasImportedReview } from '@/lib/reviews';

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
};

type Payload = {
  productNo: number;
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
      // eslint-disable-next-line no-await-in-loop
      const alreadyImported = await hasImportedReview('newyorktrd', reviewId);
      reviews.push({
        reviewId: review.reviewId,
        sourceUrl: review.sourceUrl,
        writerName: review.writerName,
        rating: review.rating,
        content: review.content,
        photos: review.photos,
        writtenAt: review.writtenAt,
        alreadyImported,
      });
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
