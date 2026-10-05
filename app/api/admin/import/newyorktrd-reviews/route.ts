import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { isAdmin } from '@/lib/admin-guard';
import { NewyorktrdError } from '@/lib/newyorktrd';
import {
  fetchReviewDetail,
  fetchReviewIdsPage,
  type ReviewDetail,
} from '@/lib/newyorktrd-reviews';
import { requireR2, toPublicUrl } from '@/lib/r2';
import {
  createImportedReview,
  DuplicateReviewError,
  hasImportedReview,
} from '@/lib/reviews';
import { slugify } from '@/lib/product-utils';

/**
 * 뉴욕트렌딕 리뷰 가져오기 — 한 번에 한 페이지씩.
 *
 * ★ 왜 페이지 단위로 자르나
 *   한 상품에 최대 25건, 사진 포함이면 각 건마다 서버 요청·sharp 변환·R2 업로드가 붙어
 *   한 번에 다 처리하면 Vercel 60초 함수 제한을 넘을 수 있습니다. 화면이 1→2→3→4→5
 *   페이지를 돌리고 매번 진행률을 보여 줍니다.
 *
 * ★ 중복 방지
 *   같은 source + source_review_id 는 유일 인덱스로 막혀 있고, 저장 전에도 한 번 더
 *   조회해 "이미 가져온 후기" 로 건너뜁니다. 그래서 다시 눌러도 새 후기만 들어옵니다.
 *
 * ★ 표시광고법
 *   저장되는 리뷰는 source='newyorktrd' · user_id=null · order_id=null · is_sponsored=false
 *   입니다. 손님 화면은 source != null 을 보고 「뉴욕트렌딕 구매 후기」 배지를 띄웁니다.
 *   포인트는 지급되지 않습니다 (user_id 가 null 이라 points.ts 흐름에 들어가지 않습니다).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_WIDTH = 1600;
const WEBP_QUALITY = 82;
const PHOTO_FETCH_TIMEOUT = 15000;
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

type Payload = {
  productId: string;
  productSlug: string;
  productNo: number;
  page: number;
};

type ReviewOutcome =
  | { ok: true; reviewId: string; attachments: number }
  | { ok: false; reviewId: string; reason: string }
  | { skipped: true; reviewId: string; reason: string };

function keyFor(slug: string): string {
  const safe = slugify(slug) || 'imported';
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `reviews/${safe}/${Date.now()}-${random}.webp`;
}

/** 사진 하나를 받아 WebP 로 변환·R2 업로드. 실패하면 null. */
async function copyPhotoToR2(sourceUrl: string, slug: string): Promise<string | null> {
  try {
    const response = await fetch(sourceUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT),
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > PHOTO_MAX_BYTES) return null;

    const converted = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const r2 = requireR2();
    const key = keyFor(slug);
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: converted,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
    return toPublicUrl(key);
  } catch (error) {
    console.warn('[import/newyorktrd-reviews] 사진 복사 실패:', sourceUrl, error);
    return null;
  }
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

  const productId = typeof payload.productId === 'string' ? payload.productId : '';
  const productSlug = typeof payload.productSlug === 'string' ? payload.productSlug : '';
  const productNo = Number(payload.productNo ?? 0);
  const page = Math.max(1, Math.min(5, Number(payload.page ?? 1)));

  if (!productId || !productSlug || !productNo) {
    return NextResponse.json(
      { error: 'productId · productSlug · productNo 가 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    const { ids, totalPages } = await fetchReviewIdsPage(productNo, page);

    const outcomes: ReviewOutcome[] = [];

    for (const reviewId of ids) {
      // eslint-disable-next-line no-await-in-loop
      if (await hasImportedReview('newyorktrd', reviewId)) {
        outcomes.push({ skipped: true, reviewId, reason: '이미 가져온 후기' });
        continue;
      }

      let detail: ReviewDetail;
      try {
        // eslint-disable-next-line no-await-in-loop
        detail = await fetchReviewDetail(reviewId, productNo);
      } catch (error) {
        outcomes.push({
          ok: false,
          reviewId,
          reason: error instanceof Error ? error.message : '내려받기 실패',
        });
        continue;
      }

      if ('skipped' in detail && detail.skipped) {
        outcomes.push({ skipped: true, reviewId, reason: detail.reason });
        continue;
      }
      // 타입 가드 — 'skipped' 가 아닌 가지는 전체 리뷰입니다.
      const review = detail as Exclude<ReviewDetail, { skipped: true }>;

      // 사진을 R2 로 — 하나씩, 실패하면 건너뜁니다.
      const attachments: string[] = [];
      for (const photo of review.photos) {
        // eslint-disable-next-line no-await-in-loop
        const url = await copyPhotoToR2(photo, productSlug);
        if (url) attachments.push(url);
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        await createImportedReview({
          productId,
          productSlug,
          writerName: review.writerName,
          rating: review.rating,
          content: review.content,
          attachments,
          writtenAt: review.writtenAt,
          source: 'newyorktrd',
          sourceReviewId: reviewId,
          sourceUrl: review.sourceUrl,
        });
        outcomes.push({ ok: true, reviewId, attachments: attachments.length });
      } catch (error) {
        if (error instanceof DuplicateReviewError) {
          outcomes.push({ skipped: true, reviewId, reason: '이미 가져온 후기' });
        } else {
          outcomes.push({
            ok: false,
            reviewId,
            reason: error instanceof Error ? error.message : '저장 실패',
          });
        }
      }
    }

    return NextResponse.json(
      {
        page,
        totalPages,
        found: ids.length,
        outcomes,
        summary: {
          imported: outcomes.filter((o) => 'ok' in o && o.ok).length,
          skipped: outcomes.filter((o) => 'skipped' in o && o.skipped).length,
          failed: outcomes.filter((o) => 'ok' in o && !o.ok).length,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message =
      error instanceof NewyorktrdError
        ? error.message
        : error instanceof Error
          ? error.message
          : '리뷰를 가져오지 못했습니다.';
    console.error('[import/newyorktrd-reviews]', productNo, page, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
