import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { isAdmin } from '@/lib/admin-guard';
import { requireR2, toPublicUrl } from '@/lib/r2';
import {
  createImportedReview,
  DuplicateReviewError,
  hasImportedReview,
} from '@/lib/reviews';
import { slugify } from '@/lib/product-utils';

/**
 * 뉴욕트렌딕 리뷰 저장 — 미리보기에서 운영자가 고른 것만 받아 저장.
 *
 * ★ 서버에 들어오는 모양
 *   { productId, productSlug, selections: [{ ...리뷰 전체, photos: [선택한 사진 URL] }] }
 *   사진은 운영자가 체크 해제한 것은 미리 뺀 상태로 옵니다. 서버는 그대로 R2 에 올리고 저장.
 *
 * ★ 안전장치
 *   · 서버에서 다시 hasImportedReview 로 중복 체크 (DB 유니크 인덱스가 최종 가드)
 *   · 사진 URL 은 newyorktrd.co.kr 또는 theplanet.hgodo.com 쪽만 받습니다
 *     — 다른 도메인으로 바꿔치면 R2 가 외부 자원 저장 수단이 되어 버립니다
 *   · 리뷰 글·별점·작성자명·날짜는 미리보기 때 서버가 파싱한 그대로 왔다고 믿습니다.
 *     운영자(관리자)가 손대지 못하는 입력이라, 상품 가져오기 payload 와 같은 신뢰 수준입니다.
 *
 * ★ 표시광고법
 *   저장되는 리뷰는 source='newyorktrd' · user_id=null · order_id=null · is_sponsored=false.
 *   손님 화면이 source != null 을 보고 「뉴욕트렌딕 구매 후기」 배지를 띄우고 평균 별점·
 *   개수에서 자동 제외합니다. 포인트 지급 흐름(points.ts)에도 안 들어갑니다.
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

type SelectionInput = {
  reviewId: string;
  sourceUrl: string;
  writerName: string;
  rating: number;
  content: string;
  photos: string[];
  writtenAt: string;
};

type Payload = {
  productId: string;
  productSlug: string;
  selections: SelectionInput[];
};

type ReviewOutcome =
  | {
      ok: true;
      reviewId: string;
      attachments: number;
      /** 사진 복사 실패 — 조용히 넘어가지 않고 사용자에게 보여 줍니다. */
      photoFailures: { url: string; reason: string }[];
    }
  | { ok: false; reviewId: string; reason: string }
  | { skipped: true; reviewId: string; reason: string };

function keyFor(slug: string): string {
  const safe = slugify(slug) || 'imported';
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `reviews/${safe}/${Date.now()}-${random}.webp`;
}

function isAllowedPhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PHOTO_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

type PhotoCopyResult = { url: string } | { error: string };

/**
 * 사진 하나를 R2 로 복사합니다. 실패하면 왜 실패했는지 문자열을 돌려줍니다.
 * ★ 예전엔 조용히 null 을 돌려 사용자가 왜 사진이 비는지 알 수 없었습니다 (사장님 지시, 2026-10-05).
 */
async function copyPhotoToR2(sourceUrl: string, slug: string): Promise<PhotoCopyResult> {
  if (!isAllowedPhotoUrl(sourceUrl)) {
    const reason = `허용되지 않은 호스트: ${sourceUrl.split('/')[2] ?? '(알 수 없음)'}`;
    console.warn('[import/newyorktrd-reviews]', reason, sourceUrl);
    return { error: reason };
  }
  try {
    const response = await fetch(sourceUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT),
    });
    if (!response.ok) {
      return { error: `내려받기 실패 (HTTP ${response.status})` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) return { error: '빈 파일' };
    if (buffer.byteLength > PHOTO_MAX_BYTES) {
      return { error: `용량 초과 (${Math.round(buffer.byteLength / 1024 / 1024)}MB)` };
    }
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
    return { url: toPublicUrl(key) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : '알 수 없는 오류';
    console.warn('[import/newyorktrd-reviews] 사진 복사 실패:', sourceUrl, reason);
    return { error: reason };
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
  const selections = Array.isArray(payload.selections) ? payload.selections : [];
  if (!productId || !productSlug) {
    return NextResponse.json(
      { error: 'productId · productSlug 가 필요합니다.' },
      { status: 400 }
    );
  }
  if (selections.length === 0) {
    return NextResponse.json(
      { imported: 0, skipped: 0, failed: 0, outcomes: [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const outcomes: ReviewOutcome[] = [];

  for (const selection of selections) {
    const reviewId = String(selection.reviewId ?? '').trim();
    if (!reviewId) continue;

    // 유효성 검사
    const rating = Math.min(5, Math.max(1, Math.trunc(Number(selection.rating) || 5)));
    const content = String(selection.content ?? '').trim();
    const writerName = String(selection.writerName ?? '').trim();
    const writtenAt = String(selection.writtenAt ?? new Date().toISOString());
    const sourceUrl = String(selection.sourceUrl ?? '').trim();
    const photos = Array.isArray(selection.photos)
      ? selection.photos.filter((photo): photo is string => typeof photo === 'string')
      : [];

    // eslint-disable-next-line no-await-in-loop
    if (await hasImportedReview('newyorktrd', reviewId)) {
      outcomes.push({ skipped: true, reviewId, reason: '이미 가져온 후기' });
      continue;
    }

    const attachments: string[] = [];
    const photoFailures: { url: string; reason: string }[] = [];
    for (const photo of photos) {
      // eslint-disable-next-line no-await-in-loop
      const result = await copyPhotoToR2(photo, productSlug);
      if ('url' in result) attachments.push(result.url);
      else photoFailures.push({ url: photo, reason: result.error });
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await createImportedReview({
        productId,
        productSlug,
        writerName,
        rating,
        content,
        attachments,
        writtenAt,
        source: 'newyorktrd',
        sourceReviewId: reviewId,
        sourceUrl,
      });
      outcomes.push({
        ok: true,
        reviewId,
        attachments: attachments.length,
        photoFailures,
      });
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
      outcomes,
      imported: outcomes.filter((o) => 'ok' in o && o.ok).length,
      skipped: outcomes.filter((o) => 'skipped' in o && o.skipped).length,
      failed: outcomes.filter((o) => 'ok' in o && !o.ok).length,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
