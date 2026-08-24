import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { isAdmin } from '@/lib/admin-guard';
import { requireR2, toPublicUrl } from '@/lib/r2';
import {
  BRANDING_KEY,
  DEFAULT_BRANDING,
  SETTINGS_TAG,
  deleteSetting,
  getBranding,
  normalizeBranding,
  writeSetting,
} from '@/lib/settings';
import type { Branding } from '@/lib/types';

/** sharp 는 Node 런타임에서만 동작합니다. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // 파비콘은 작은 파일입니다
const FAVICON_SIZE = 32;
const APPLE_SIZE = 180;

/** MIME 타입 → 확장자. ico 는 브라우저·OS 마다 타입 이름이 달라 여러 개를 받습니다. */
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/ico': 'ico',
  'image/icon': 'ico',
  'text/ico': 'ico',
};

const ALLOWED_EXTENSIONS = new Set(['png', 'svg', 'ico']);

function unauthorized() {
  return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
}

/** 파일 타입을 먼저 보고, 없으면 확장자로 판단합니다. */
function resolveExtension(file: File): string | null {
  const byType = ALLOWED[file.type.toLowerCase()];
  if (byType) return byType;
  const byName = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.has(byName) ? byName : null;
}

/** 화면 갱신 — <head> 의 아이콘이 모든 페이지에 박혀 있으므로 전부 다시 굽습니다. */
function refreshSite(): void {
  revalidateTag(SETTINGS_TAG);
  revalidatePath('/', 'layout');
}

/** R2 에서 지우기. 실패해도 설정 저장은 계속합니다. (고아 파일만 남습니다) */
async function removeObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  let r2;
  try {
    r2 = requireR2();
  } catch {
    return;
  }
  for (const key of keys) {
    try {
      await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
    } catch (error) {
      console.error('[branding] 이전 파비콘 삭제 실패:', key, error);
    }
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();

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
    return NextResponse.json({ error: '업로드 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: '파비콘 이미지를 선택해 주세요.' }, { status: 400 });
  }

  const extension = resolveExtension(file);
  if (!extension) {
    return NextResponse.json(
      { error: 'png · ico · svg 파일만 올릴 수 있습니다.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: '파일이 너무 큽니다. 파비콘은 5MB까지 올릴 수 있습니다.' },
      { status: 400 }
    );
  }

  const input = Buffer.from(await file.arrayBuffer());
  const stamp = Date.now();

  // ── 32x32 · 180x180 두 벌을 만듭니다. ─────────────────────
  // sharp 는 ico 를 읽지 못합니다. 그럴 때는 원본을 그대로 파비콘으로 씁니다.
  let favicon: Buffer | null = null;
  let apple: Buffer | null = null;
  try {
    // svg 는 density 를 올려야 확대해도 깨지지 않습니다.
    const options = extension === 'svg' ? { density: 600 } : {};

    favicon = await sharp(input, options)
      .resize(FAVICON_SIZE, FAVICON_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    // 애플 터치 아이콘은 투명 배경을 검게 칠하므로 흰 배경을 깔아 둡니다.
    apple = await sharp(input, options)
      .resize(APPLE_SIZE, APPLE_SIZE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
  } catch (error) {
    if (extension !== 'ico') {
      console.error('[branding] 파비콘 변환 실패:', error);
      return NextResponse.json(
        { error: '이미지를 읽지 못했습니다. 다른 파일로 시도해 주세요.' },
        { status: 400 }
      );
    }
    favicon = null;
    apple = null;
  }

  const previous = await getBranding();
  const uploads: { key: string; body: Buffer; contentType: string }[] = [];

  const sourceKey = `branding/source-${stamp}.${extension}`;
  const sourceType =
    extension === 'svg'
      ? 'image/svg+xml'
      : extension === 'ico'
        ? 'image/x-icon'
        : 'image/png';
  uploads.push({ key: sourceKey, body: input, contentType: sourceType });

  let next: Branding;

  if (favicon && apple) {
    const faviconKey = `branding/favicon-${FAVICON_SIZE}-${stamp}.png`;
    const appleKey = `branding/apple-touch-icon-${stamp}.png`;
    uploads.push(
      { key: faviconKey, body: favicon, contentType: 'image/png' },
      { key: appleKey, body: apple, contentType: 'image/png' }
    );

    next = {
      favicon: {
        url: toPublicUrl(faviconKey),
        type: 'image/png',
        sizes: `${FAVICON_SIZE}x${FAVICON_SIZE}`,
      },
      appleTouchIcon: {
        url: toPublicUrl(appleKey),
        type: 'image/png',
        sizes: `${APPLE_SIZE}x${APPLE_SIZE}`,
      },
      // 로고는 파비콘과 별개 항목입니다. 덮어쓰지 않고 그대로 둡니다.
      logo: previous.logo,
      source: { url: toPublicUrl(sourceKey), type: sourceType, name: file.name },
      keys: uploads.map((item) => item.key),
      updatedAt: new Date(stamp).toISOString(),
    };
  } else {
    // ico 원본을 크기 변환 없이 그대로 씁니다.
    next = {
      favicon: { url: toPublicUrl(sourceKey), type: sourceType, sizes: 'any' },
      appleTouchIcon: DEFAULT_BRANDING.appleTouchIcon,
      logo: previous.logo,
      source: { url: toPublicUrl(sourceKey), type: sourceType, name: file.name },
      keys: [sourceKey],
      updatedAt: new Date(stamp).toISOString(),
    };
  }

  try {
    await Promise.all(
      uploads.map((item) =>
        r2.client.send(
          new PutObjectCommand({
            Bucket: r2.bucket,
            Key: item.key,
            Body: item.body,
            ContentType: item.contentType,
            // 파일명에 시간이 들어 있으므로 오래 캐시해도 안전합니다.
            CacheControl: 'public, max-age=31536000, immutable',
          })
        )
      )
    );
  } catch (error) {
    console.error('[branding] 업로드 실패:', error);
    return NextResponse.json(
      { error: '저장소에 올리지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }

  try {
    await writeSetting(BRANDING_KEY, next);
  } catch (error) {
    // DB 저장에 실패하면 방금 올린 파일은 쓸모가 없으므로 되돌립니다.
    await removeObjects(uploads.map((item) => item.key));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    );
  }

  await removeObjects(previous.keys);
  refreshSite();

  return NextResponse.json({
    branding: normalizeBranding(next),
    resized: Boolean(favicon && apple),
  });
}

/** 기본 파비콘으로 되돌립니다. */
export async function DELETE() {
  if (!(await isAdmin())) return unauthorized();

  const previous = await getBranding();
  // 파비콘만 기본값으로 되돌립니다. 로고는 따로 관리하므로 남겨 둡니다.
  const next: Branding = { ...DEFAULT_BRANDING, logo: previous.logo };

  try {
    if (previous.logo) {
      await writeSetting(BRANDING_KEY, next);
    } else {
      await deleteSetting(BRANDING_KEY);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '설정을 지우지 못했습니다.' },
      { status: 500 }
    );
  }

  await removeObjects(previous.keys);
  refreshSite();

  return NextResponse.json({ branding: next });
}
