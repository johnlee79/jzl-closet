import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import {
  BrowserBusyError,
  scrapeNewyorktrdPhotos,
} from '@/lib/newyorktrd-browser';
import { getImportedReviewsForProduct } from '@/lib/reviews';

/**
 * 뉴욕트렌딕 상품 페이지를 헤드리스 Chrome 으로 열어 손님 사진을 긁어 미리보기로 돌려줍니다.
 * **저장은 하지 않습니다** — 사장님이 미리보기에서 체크한 뒤 /newyorktrd-reviews
 * (저장) 로 가야 저장됩니다.
 *
 * ★ 그룹핑 (2026-10-05)
 *   썸네일을 하나씩 클릭해 리뷰 상세 팝업을 열고 작성자·날짜·글·사진 세트를 뽑습니다.
 *   같은 손님 사진 5~6장이 한 그룹으로 묶여 돌아옵니다.
 *   가끔 팝업이 안 열리는 사진은 "글 없음 · 사진만" 단건 폴백으로 넣어 사장님이
 *   미리보기에서 보고 고를 수 있게 합니다.
 *
 * ★ 짝맞춤 — 뽑은 그룹의 (작성자 첫 글자 + 글 처음 15자) 로 저희 DB 의 기존 글 리뷰와
 *   비교합니다. 일치하면 그 리뷰의 source_review_id 를 돌려줘 저장 라우트가 **기존
 *   리뷰에 사진을 붙이게** 합니다. 일치 안 하면 새 리뷰로 들어갑니다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export type PreviewPhotoReview = {
  reviewId: string;
  sourceUrl: string;
  writerName: string;
  rating: number;
  content: string;
  photos: string[];
  writtenAt: string;
  alreadyImported: boolean;
  kind: 'photo-only';
  /**
   * 짝맞춤 결과 — 저희 DB 의 기존 뉴욕 글 리뷰와 매칭되면 그 source_review_id 가
   * 들어옵니다. 저장 라우트가 이 값을 보고 **기존 리뷰에 사진을 붙입니다** (새로 만들지 않음).
   */
  attachToExistingReviewId?: string;
};

type Payload = {
  productNo: number;
  productId?: string;
};

/** 사진 URL 에서 짧은 식별자(해시 꼬리말)를 뽑습니다. */
function photoKey(url: string): string {
  const basename = url.split('/').pop() ?? '';
  const stripped = basename.replace(/\.[a-z0-9]+$/i, '');
  return stripped.slice(0, 32) || Date.now().toString(36);
}

/** 글자 두 개 정도만 비교해도 되게끔 공백·구두점 지우고 소문자화. */
function foldForMatch(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s.,!?~^\-_()[\]{}'"‘’“”·…]/g, '');
}

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
    const { groups, elapsedMs } = await scrapeNewyorktrdPhotos(productNo);

    // 저희 DB 의 뉴욕 글 리뷰 모아 둡니다 — 짝맞춤에 씀
    const existingReviews = productId
      ? await getImportedReviewsForProduct(productId, 'newyorktrd')
      : [];
    const existingByFingerprint = new Map<
      string,
      { sourceReviewId: string }
    >();
    for (const review of existingReviews) {
      if (!review.sourceReviewId) continue;
      // 지문: 작성자 첫 한글 + 글 앞 15자 (fold)
      const firstChar = review.writerName.slice(0, 1);
      const contentHead = foldForMatch(review.content).slice(0, 15);
      if (!firstChar || contentHead.length < 5) continue;
      const key = `${firstChar}|${contentHead}`;
      existingByFingerprint.set(key, { sourceReviewId: review.sourceReviewId });
    }

    // 이미 어떤 식으로든 가져온 reviewId 전부 (중복 표시용)
    const existingIds = new Set<string>();
    for (const review of existingReviews) {
      if (review.sourceReviewId) existingIds.add(review.sourceReviewId);
    }

    const reviews: PreviewPhotoReview[] = [];

    for (const group of groups) {
      // 묶음 식별자 — 사진 URL 첫 개의 해시 꼬리말
      const groupKey = `photo-group-${photoKey(group.photos[0] ?? '')}`;
      // 짝맞춤 — 작성자 첫 글자 + 글 앞 15자
      const firstChar = group.writerName.slice(0, 1);
      const contentHead = foldForMatch(group.content).slice(0, 15);
      const matchKey =
        firstChar && contentHead.length >= 5 ? `${firstChar}|${contentHead}` : '';
      const match = matchKey ? existingByFingerprint.get(matchKey) : undefined;

      reviews.push({
        reviewId: match ? match.sourceReviewId : groupKey,
        sourceUrl: `https://newyorktrd.co.kr/product/detail.html?product_no=${productNo}`,
        writerName: group.writerName || '뉴욕트렌딕 손님',
        rating: 5,
        content: group.content,
        photos: group.photos,
        writtenAt: new Date().toISOString(),
        alreadyImported: existingIds.has(match?.sourceReviewId ?? groupKey),
        kind: 'photo-only',
        attachToExistingReviewId: match?.sourceReviewId,
      });
    }

    return NextResponse.json(
      {
        reviews,
        found: reviews.length,
        totalPhotos: reviews.reduce((n, r) => n + r.photos.length, 0),
        elapsedMs,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof BrowserBusyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message =
      error instanceof Error ? error.message : '사진 미리보기를 가져오지 못했습니다.';
    console.error('[import/newyorktrd-reviews/preview-photos]', productNo, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
