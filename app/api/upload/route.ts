import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { requireR2, toObjectKey, toPublicUrl } from '@/lib/r2';
import { slugify } from '@/lib/product-utils';
import type { UploadedImage } from '@/lib/types';

/** sharp 는 Node 런타임에서만 동작합니다. */
export const runtime = 'nodejs';
/** 업로드는 캐시하지 않습니다. */
export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024; // 파일당 20MB
const MAX_WIDTH = 1600;
const THUMB_WIDTH = 400;
const WEBP_QUALITY = 82;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

async function requireAdmin(): Promise<boolean> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  return verifySessionToken(token);
}

function unauthorized() {
  return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
}

/** products/{slug}/{타임스탬프}-{랜덤6자}.webp */
function makeKeys(productSlug: string): { key: string; thumbKey: string } {
  const folder = slugify(productSlug) || 'untitled';
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  const fileName = `${Date.now()}-${random}.webp`;
  return {
    key: `products/${folder}/${fileName}`,
    thumbKey: `products/${folder}/thumb/${fileName}`,
  };
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return unauthorized();

  let r2;
  try {
    r2 = requireR2();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'R2 설정 오류' },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: '업로드 형식이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  const productSlug = String(form.get('slug') ?? 'untitled');
  const files = form.getAll('files').filter((item): item is File => item instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: '이미지를 선택해 주세요.' }, { status: 400 });
  }

  const uploaded: UploadedImage[] = [];

  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `${file.name}: jpg·png·webp·gif 이미지만 올릴 수 있습니다.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${file.name}: 파일이 너무 큽니다. 한 장당 20MB까지 올릴 수 있습니다.` },
        { status: 400 }
      );
    }

    const input = Buffer.from(await file.arrayBuffer());
    const animated = file.type === 'image/gif';

    try {
      // 원본을 그대로 올리지 않습니다. 가로 1600px 이하로 줄이고 webp 로 변환합니다.
      const base = sharp(input, { animated }).rotate();
      const metadata = await base.metadata();

      const full = await sharp(input, { animated })
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });

      const thumb = await sharp(input, { animated })
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const { key, thumbKey } = makeKeys(productSlug);

      await Promise.all([
        r2.client.send(
          new PutObjectCommand({
            Bucket: r2.bucket,
            Key: key,
            Body: full.data,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000, immutable',
          })
        ),
        r2.client.send(
          new PutObjectCommand({
            Bucket: r2.bucket,
            Key: thumbKey,
            Body: thumb,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000, immutable',
          })
        ),
      ]);

      uploaded.push({
        url: toPublicUrl(key),
        thumbUrl: toPublicUrl(thumbKey),
        key,
        thumbKey,
        width: full.info.width ?? metadata.width ?? 0,
        height: full.info.height ?? metadata.height ?? 0,
        bytes: full.data.byteLength,
      });
    } catch (error) {
      console.error('[upload] 실패:', error);
      return NextResponse.json(
        { error: `${file.name}: 이미지를 처리하지 못했습니다. 다른 파일로 시도해 주세요.` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ images: uploaded });
}

/**
 * 이미지 삭제. { urls: string[] } 또는 { keys: string[] } 를 받습니다.
 * URL 을 주면 썸네일(thumb/) 까지 함께 지웁니다.
 */
export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return unauthorized();

  let r2;
  try {
    r2 = requireR2();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'R2 설정 오류' },
      { status: 500 }
    );
  }

  let body: { urls?: unknown; keys?: unknown };
  try {
    body = (await request.json()) as { urls?: unknown; keys?: unknown };
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const fromUrls = Array.isArray(body.urls)
    ? body.urls.filter((item): item is string => typeof item === 'string')
    : [];
  const fromKeys = Array.isArray(body.keys)
    ? body.keys.filter((item): item is string => typeof item === 'string')
    : [];

  const keys = new Set<string>(fromKeys);
  for (const url of fromUrls) {
    const key = toObjectKey(url);
    if (!key) continue; // 우리 버킷 밖의 주소(예: /images/...)는 건드리지 않습니다
    keys.add(key);
  }

  // 원본 키에 대응하는 썸네일 키도 함께 지웁니다.
  for (const key of Array.from(keys)) {
    const match = /^(products\/[^/]+)\/([^/]+)$/.exec(key);
    if (match) keys.add(`${match[1]}/thumb/${match[2]}`);
  }

  if (keys.size === 0) {
    return NextResponse.json({ error: '삭제할 이미지가 없습니다.' }, { status: 400 });
  }

  const deleted: string[] = [];
  for (const key of Array.from(keys)) {
    try {
      await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
      deleted.push(key);
    } catch (error) {
      console.error('[upload] 삭제 실패:', key, error);
    }
  }

  return NextResponse.json({ deleted });
}
