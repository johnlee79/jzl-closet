import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { isAdmin } from '@/lib/admin-guard';
import { NewyorktrdError } from '@/lib/newyorktrd';
import { fetchReviewDetail, type ReviewDetail } from '@/lib/newyorktrd-reviews';
import { requireR2, toPublicUrl } from '@/lib/r2';
import {
  getImportedReviewsForProduct,
  updateImportedReviewAttachments,
} from '@/lib/reviews';
import { slugify } from '@/lib/product-utils';

/**
 * 이미 가져온 뉴욕트렌딕 후기의 사진을 다시 받습니다.
 *
 * ★ 왜 필요한가 — 뉴욕트렌딕이 Alpha Review(3rd-party JS 위젯) 로 손님 사진을 분리해서
 *   보관해, 저희가 처음 가져올 때 사진이 들어오지 않는 경우가 있습니다. 나중에 뉴욕이
 *   사진을 노출하거나 저희가 Alpha Review API 를 연결하면 이 라우트로 사진만 다시
 *   받아 올 수 있게 둡니다.
 *
 * ★ 안전장치
 *   · source_review_id 로 원본 리뷰 상세를 다시 받습니다.
 *   · 받은 사진이 **0 장이면 기존 attachments 를 건드리지 않습니다** (실수로 날리지 않게).
 *   · 사진이 있으면 통째로 교체합니다. (수가 늘거나 줄 수 있음)
 *   · 호스트는 /api/admin/import/newyorktrd-reviews 저장 라우트와 같은 세 곳으로 제한.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_WIDTH = 1600;
const WEBP_QUALITY = 82;
const PHOTO_FETCH_TIMEOUT = 15000;
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_PHOTO_HOSTS = new Set([
  'newyorktrd.co.kr',
  'theplanet.hgodo.com',
  'review-media.alphwidget.com',
]);

type Payload = {
  productId: string;
  productSlug: string;
  productNo: number;
};

function isAllowedPhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PHOTO_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function keyFor(slug: string): string {
  const safe = slugify(slug) || 'imported';
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `reviews/${safe}/${Date.now()}-${random}.webp`;
}

async function copyPhotoToR2(sourceUrl: string, slug: string): Promise<string | null> {
  if (!isAllowedPhotoUrl(sourceUrl)) return null;
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
    console.warn('[refetch-photos] 사진 복사 실패:', sourceUrl, error);
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
  if (!productId || !productSlug || !productNo) {
    return NextResponse.json(
      { error: 'productId · productSlug · productNo 가 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    const reviews = await getImportedReviewsForProduct(productId, 'newyorktrd');
    if (reviews.length === 0) {
      return NextResponse.json({ examined: 0, updated: 0, keptEmpty: 0, failed: 0, outcomes: [] });
    }

    const outcomes: Array<{
      reviewId: string;
      status: 'updated' | 'kept-empty' | 'failed' | 'unchanged';
      before: number;
      after: number;
      reason?: string;
    }> = [];

    for (const review of reviews) {
      const reviewId = review.sourceReviewId ?? '';
      if (!reviewId) continue;

      let detail: ReviewDetail;
      try {
        // eslint-disable-next-line no-await-in-loop
        detail = await fetchReviewDetail(reviewId, productNo);
      } catch (error) {
        outcomes.push({
          reviewId,
          status: 'failed',
          before: review.attachments.length,
          after: review.attachments.length,
          reason: error instanceof Error ? error.message : '내려받기 실패',
        });
        continue;
      }
      if ('skipped' in detail && detail.skipped) {
        outcomes.push({
          reviewId,
          status: 'failed',
          before: review.attachments.length,
          after: review.attachments.length,
          reason: detail.reason,
        });
        continue;
      }
      const parsed = detail as Exclude<ReviewDetail, { skipped: true }>;
      // ★ 받은 사진이 0 장이면 아무것도 안 합니다. 기존 attachments 를 날리지 않습니다.
      if (parsed.photos.length === 0) {
        outcomes.push({
          reviewId,
          status: 'kept-empty',
          before: review.attachments.length,
          after: review.attachments.length,
        });
        continue;
      }
      const uploaded: string[] = [];
      for (const photo of parsed.photos) {
        // eslint-disable-next-line no-await-in-loop
        const url = await copyPhotoToR2(photo, productSlug);
        if (url) uploaded.push(url);
      }
      if (uploaded.length === 0) {
        outcomes.push({
          reviewId,
          status: 'failed',
          before: review.attachments.length,
          after: review.attachments.length,
          reason: '사진을 받긴 했는데 전부 복사에 실패했습니다',
        });
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        await updateImportedReviewAttachments(review.id, uploaded);
        outcomes.push({
          reviewId,
          status: 'updated',
          before: review.attachments.length,
          after: uploaded.length,
        });
      } catch (error) {
        outcomes.push({
          reviewId,
          status: 'failed',
          before: review.attachments.length,
          after: review.attachments.length,
          reason: error instanceof Error ? error.message : '저장 실패',
        });
      }
    }

    return NextResponse.json(
      {
        examined: reviews.length,
        updated: outcomes.filter((o) => o.status === 'updated').length,
        keptEmpty: outcomes.filter((o) => o.status === 'kept-empty').length,
        failed: outcomes.filter((o) => o.status === 'failed').length,
        outcomes,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message =
      error instanceof NewyorktrdError
        ? error.message
        : error instanceof Error
          ? error.message
          : '사진을 다시 받지 못했습니다.';
    console.error('[refetch-photos]', productNo, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
