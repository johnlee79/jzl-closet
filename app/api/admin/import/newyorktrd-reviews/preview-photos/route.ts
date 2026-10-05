import fs from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import {
  BrowserBusyError,
  scrapeNewyorktrdPhotos,
} from '@/lib/newyorktrd-browser';
import { getImportedReviewsForProduct } from '@/lib/reviews';

/**
 * 뉴욕트렌딕 상품 페이지를 헤드리스 Chrome 으로 열어 손님 사진을 긁고, 미리보기용으로
 * 돌려줍니다. **저장은 하지 않습니다** — 사장님이 미리보기 화면에서 체크한 뒤
 * /api/admin/import/newyorktrd-reviews (저장) 로 가야 저장됩니다.
 *
 * ★ 응답 모양 — NewyorktrdReviewPreview 가 그대로 받을 수 있는 PreviewReview[] 입니다.
 *   사진은 "글 없음 · 사진만" 리뷰 하나씩 돌려줍니다 (알파 위젯이 사진-글 짝을 쉽게
 *   내놓지 않아, 지금 단계에서는 그룹핑 없이 사진 단건으로 보여 드립니다).
 *
 * ★ 중복 방지 — 저희 DB 에 이미 들어가 있는 뉴욕트렌딕 리뷰의 attachments 를 보고
 *   같은 사진 URL (R2 로 복사된 뒤의 URL 이 아니라 원본 URL) 을 체크한 적이 없어
 *   이 자리에서는 "이미 가져온" 처리를 못 합니다. 유일 인덱스가 reviewId 기반이라
 *   사진만 리뷰는 "photo-{url해시}" 같은 식별자를 쓰고, 저장 라우트가 중복이면
 *   건너뜁니다.
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

/**
 * 진단용 — 배포된 함수 안의 Chromium 파일이 실제로 들어갔는지 확인합니다.
 *   관리자 로그인된 상태에서 /api/admin/import/newyorktrd-reviews/preview-photos
 *   에 GET 하면 됩니다. 바이너리를 실행하지는 않습니다 — 파일 유무만 봅니다.
 *   next.config 의 outputFileTracingIncludes 가 맞게 걸렸는지 바로 보입니다.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  }

  const env = {
    VERCEL: process.env.VERCEL ?? null,
    AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME ?? null,
    cwd: process.cwd(),
  };

  // @sparticuz/chromium — 설치 여부 · bin 경로 · bin 폴더 안의 파일 목록
  let sparticuz: Record<string, unknown>;
  try {
    // 모듈이 require 가능한지만 확인 (실제 바이너리 실행은 안 합니다).
    await import('@sparticuz/chromium');
    const pkgPath = path.dirname(require.resolve('@sparticuz/chromium/package.json'));
    const binPath = path.join(pkgPath, 'bin');
    const binExists = fs.existsSync(binPath);
    sparticuz = {
      moduleLoaded: true,
      pkgPath,
      binPath,
      binExists,
      binContents: binExists ? fs.readdirSync(binPath).slice(0, 20) : null,
    };
  } catch (error) {
    sparticuz = {
      moduleLoaded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // puppeteer-core 설치 여부
  let puppeteer: Record<string, unknown>;
  try {
    const pkgPath = path.dirname(require.resolve('puppeteer-core/package.json'));
    puppeteer = { pkgPath, loaded: true };
  } catch (error) {
    puppeteer = {
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return NextResponse.json(
    { env, sparticuz, puppeteer },
    { headers: { 'Cache-Control': 'no-store' } }
  );
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
    const { photos, elapsedMs } = await scrapeNewyorktrdPhotos(productNo);

    // 이미 가져온 뉴욕 리뷰의 reviewId 를 모아 둡니다 — 사진만 리뷰 식별자가 겹치면
    // "가져옴" 으로 표시합니다. (사진 URL 자체가 바뀌면 중복 못 잡지만, 보통 바뀌지 않습니다)
    const existingIds = new Set<string>();
    if (productId) {
      const existing = await getImportedReviewsForProduct(productId, 'newyorktrd');
      for (const review of existing) {
        if (review.sourceReviewId) existingIds.add(review.sourceReviewId);
      }
    }

    const reviews: PreviewPhotoReview[] = photos.map((url) => {
      const reviewId = `photo-${photoKey(url)}`;
      return {
        reviewId,
        sourceUrl: `https://newyorktrd.co.kr/product/detail.html?product_no=${productNo}`,
        writerName: '뉴욕트렌딕 손님',
        rating: 5,
        content: '',
        photos: [url],
        writtenAt: new Date().toISOString(),
        alreadyImported: existingIds.has(reviewId),
        kind: 'photo-only',
      };
    });

    return NextResponse.json(
      {
        reviews,
        found: photos.length,
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
