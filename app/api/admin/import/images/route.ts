import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { isAdmin } from '@/lib/admin-guard';
import { requireR2, toPublicUrl } from '@/lib/r2';
import { slugify } from '@/lib/product-utils';
import type { UploadedImage } from '@/lib/types';

/**
 * 외부 이미지(셀스타)를 우리 R2 로 복사합니다.
 *
 * ★ 왜 복사하는가
 *   주소를 그대로 쓰면 셀스타에서 이미지가 바뀌거나 지워지는 순간 우리 상품 페이지가 깨집니다.
 *   트래픽도 셀스타 쪽으로 나갑니다. 그래서 받아서 우리 저장소에 넣습니다.
 *
 * ★ gif 는 손대지 않고 그대로 올립니다.
 *   webp 로 바꾸면 움직임이 멈추거나 깨지는 경우가 있습니다.
 *
 * ★ 한 번에 몇 장씩만 받습니다.
 *   상세 이미지가 21장이 넘어가는데 한 요청에 다 넣으면 Vercel 함수 시간 제한에 걸립니다.
 *   화면에서 나눠 보내고 진행률을 표시합니다. (MAX_PER_REQUEST)
 *
 * ★ 한 장이 실패해도 나머지는 계속 진행하고, 실패한 것만 알려 줍니다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 한 요청에 처리할 최대 장수 */
const MAX_PER_REQUEST = 5;
/** 한 장당 최대 용량 */
const MAX_BYTES = 20 * 1024 * 1024;
/** 내려받기 제한 시간 */
const FETCH_TIMEOUT = 20000;

const MAX_WIDTH = 1600;
const WEBP_QUALITY = 82;

function keyFor(folder: string, extension: string): string {
  const safe = slugify(folder) || 'imported';
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `products/${safe}/${Date.now()}-${random}.${extension}`;
}

export type CopyResult =
  | { ok: true; source: string; image: UploadedImage }
  | { ok: false; source: string; error: string };

/** 한 장을 받아 R2 에 올립니다. 실패해도 예외를 던지지 않습니다. */
async function copyOne(source: string, folder: string): Promise<CopyResult> {
  try {
    const response = await fetch(source, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!response.ok) {
      return { ok: false, source, error: `내려받기 실패 (HTTP ${response.status})` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { ok: false, source, error: '빈 파일입니다.' };
    }
    if (buffer.byteLength > MAX_BYTES) {
      return { ok: false, source, error: '파일이 너무 큽니다. (20MB 초과)' };
    }

    const contentType = response.headers.get('content-type') ?? '';
    const isGif = /\.gif(\?|#|$)/i.test(source) || contentType.includes('image/gif');

    const r2 = requireR2();

    /* ── gif 는 원본 그대로 ───────────────────────────── */
    if (isGif) {
      // 크기만 읽고 파일은 건드리지 않습니다.
      let width = 0;
      let height = 0;
      try {
        const meta = await sharp(buffer, { animated: true }).metadata();
        width = meta.width ?? 0;
        // animated gif 의 height 는 전체 프레임을 이어 붙인 값이라 pageHeight 를 씁니다.
        height = meta.pageHeight ?? meta.height ?? 0;
      } catch {
        // 크기를 못 읽어도 업로드는 진행합니다. (자리 예약만 못 합니다)
      }

      const key = keyFor(folder, 'gif');
      await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/gif',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );

      const url = toPublicUrl(key);
      return {
        ok: true,
        source,
        image: {
          url,
          thumbUrl: url,
          key,
          thumbKey: key,
          width,
          height,
          bytes: buffer.byteLength,
        },
      };
    }

    /* ── 그 외에는 webp 로 줄여서 ─────────────────────── */
    const converted = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    const key = keyFor(folder, 'webp');
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: converted.data,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const url = toPublicUrl(key);
    return {
      ok: true,
      source,
      image: {
        url,
        thumbUrl: url,
        key,
        thumbKey: key,
        width: converted.info.width,
        height: converted.info.height,
        bytes: converted.info.size,
      },
    };
  } catch (error) {
    return {
      ok: false,
      source,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { urls?: unknown; slug?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const folder = typeof body.slug === 'string' ? body.slug : 'imported';

  if (urls.length === 0) {
    return NextResponse.json({ error: '가져올 이미지가 없습니다.' }, { status: 400 });
  }
  if (urls.length > MAX_PER_REQUEST) {
    return NextResponse.json(
      { error: `한 번에 ${MAX_PER_REQUEST}장까지만 처리합니다.` },
      { status: 400 }
    );
  }

  // ★ 나란히 받습니다. 5장이면 순차보다 훨씬 빠릅니다.
  const results = await Promise.all(urls.map((url) => copyOne(url, folder)));

  return NextResponse.json(
    { results },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
