import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import { normalizeBrandLogo, LOGO_SCALE_MAX, LOGO_SCALE_MIN } from '@/lib/brand-logo';
import { requireR2, toPublicUrl } from '@/lib/r2';
import { slugify } from '@/lib/product-utils';

/**
 * ============================================================
 * 브랜드 로고 업로드 — 균일화해서 저장합니다
 * ============================================================
 *
 * ★★ 왜 /api/upload 를 안 쓰는가
 *   그 입구는 상품 사진용입니다. 가로 1600px 로 줄이고 썸네일을 함께 만듭니다.
 *   브랜드 로고는 크기를 "맞추는" 것이 목적이라 처리가 완전히 다릅니다.
 *   같은 입구에 조건을 붙이면 상품 사진 쪽이 위험해집니다.
 *
 * ★★ 원본을 먼저 안전한 곳에 올린 뒤에만 균일화 이미지를 만듭니다.
 *   균일화는 되돌릴 수 없습니다. 원본이 없으면 기준값을 바꿔 다시 구울 수 없고,
 *   이미 축소된 것을 다시 키우면 화질이 깨집니다.
 *
 * ★ 기존 키를 덮어쓰지 않습니다.
 *   Cloudflare 가 옛 이미지를 한동안 계속 내보냅니다. 매번 새 이름으로 올리고
 *   주소만 갈아 끼웁니다.
 *
 * 두 가지 방식으로 부릅니다.
 *   ① 파일을 올릴 때        file + slug (+ logoScale)
 *   ② 배율만 바꿔 다시 구울 때  originalUrl + slug + logoScale   ← 파일 없음
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/webp', 'image/jpeg', 'image/jpg', 'image/gif']);

function extOf(nameOrUrl: string): string {
  const m = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(nameOrUrl);
  const ext = m ? m[1].toLowerCase() : '';
  return ['png', 'webp', 'jpg', 'jpeg', 'gif'].includes(ext) ? ext : 'png';
}

const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  }

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

  const slug = slugify(String(form.get('slug') ?? '')) || 'brand';
  const rawScale = Number(form.get('logoScale') ?? 1);
  const logoScale = Number.isFinite(rawScale)
    ? Math.min(LOGO_SCALE_MAX, Math.max(LOGO_SCALE_MIN, rawScale))
    : 1;

  const file = form.get('file');
  const originalUrl = String(form.get('originalUrl') ?? '').trim();

  /* ── 원본 확보 ─────────────────────────────────────────── */
  let input: Buffer;
  let savedOriginalUrl = originalUrl;

  if (file instanceof File) {
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: `${file.name}: png·webp·jpg·gif 만 올릴 수 있습니다.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${file.name}: 파일이 너무 큽니다. 10MB까지 올릴 수 있습니다.` },
        { status: 400 }
      );
    }

    input = Buffer.from(await file.arrayBuffer());

    /*
     * ★★ 원본 저장이 먼저입니다. 실패하면 여기서 멈춥니다.
     *   원본 없이 균일화 이미지만 만들어 두면 되돌릴 방법이 없습니다.
     */
    const ext = extOf(file.name || file.type.replace('image/', '.'));
    const originalKey = `brands/original/${slug}-${Date.now()}.${ext}`;
    try {
      await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: originalKey,
          Body: input,
          ContentType: CONTENT_TYPE[ext] ?? 'application/octet-stream',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
    } catch (error) {
      console.error('[brand-logo] 원본 저장 실패:', error);
      return NextResponse.json(
        { error: '원본을 저장하지 못했습니다. 되돌릴 수 없게 되므로 여기서 멈췄습니다.' },
        { status: 500 }
      );
    }
    savedOriginalUrl = toPublicUrl(originalKey);
  } else if (originalUrl) {
    /* 배율만 바꿔 다시 굽는 경우 — 언제나 원본에서 시작합니다. */
    try {
      const res = await fetch(originalUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      input = Buffer.from(await res.arrayBuffer());
    } catch (error) {
      console.error('[brand-logo] 원본을 읽지 못했습니다:', error);
      return NextResponse.json(
        { error: '원본 이미지를 읽지 못했습니다. 로고를 다시 올려 주세요.' },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json({ error: '올릴 파일이 없습니다.' }, { status: 400 });
  }

  /* ── 균일화 ────────────────────────────────────────────── */
  try {
    const { buffer, report } = await normalizeBrandLogo(input, { logoScale, label: slug });

    const key = `brands/normalized/${slug}-${Date.now()}.webp`;
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    return NextResponse.json({
      logoUrl: toPublicUrl(key),
      logoOriginalUrl: savedOriginalUrl,
      report,
    });
  } catch (error) {
    console.error('[brand-logo] 균일화 실패:', error);
    return NextResponse.json(
      { error: '로고를 처리하지 못했습니다. 다른 파일로 시도해 주세요.' },
      { status: 500 }
    );
  }
}
