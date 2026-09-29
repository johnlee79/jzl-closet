import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { isAdmin } from '@/lib/admin-guard';
import { getActiveMember } from '@/lib/auth';
import { MEMBER_FOLDERS, makeMemberKeys, ownMemberKeys } from '@/lib/member-upload-keys';
import { requireR2, toObjectKey, toPublicUrl } from '@/lib/r2';
import { rateLimit } from '@/lib/rate-limit';
import { slugify } from '@/lib/product-utils';
import type { UploadedImage } from '@/lib/types';

/**
 * ============================================================
 * ★★ 손님도 이 주소로 사진을 올립니다 (2026-09-29)
 * ============================================================
 *
 * ★★ 전에는 첫 줄에서 관리자만 통과시켰습니다.
 *   그런데 리뷰 쓰기(ReviewForm)와 1:1 문의(InquiryForm)도 이 주소를
 *   부르고 있었습니다. 손님은 처음부터 한 장도 올리지 못했고, 화면에는
 *   「관리자 로그인이 필요합니다」가 폼 맨 위에 떠서 잘 보이지도 않았습니다.
 *
 * ★★ 두 길을 완전히 나눕니다.
 *   · 관리자 길 — ?folder= 가 손님 폴더가 아닐 때(없을 때 포함). 예전 코드 그대로입니다.
 *                 상품 이미지가 막히면 더 큰 사고라 한 줄도 바꾸지 않았습니다.
 *   · 손님 길   — ?folder=reviews | inquiries 일 때만.
 *                 로그인한 쇼핑몰 회원이어야 하고, 한 번에 한 장,
 *                 저장 위치는 {폴더}/{회원 id}/… 입니다. (products/ 아래가 아닙니다)
 *                 지우기도 자기 폴더 안에서만 됩니다.
 *
 * ★ 손님 길에서는 isAdmin() 을 부르지 않습니다. 부르면 손님이 사진을 올릴
 *   때마다 「관리자 아닌 계정이 관리자 기능을 불렀습니다」가 찍혀 진짜
 *   사고(관리자 세션이 손님으로 덮어써진 것)와 구분이 안 됩니다.
 */

/** 한 회원이 10분에 올릴 수 있는 장수. 리뷰 5장 · 문의 3장을 몇 번 다시 골라도 넉넉합니다. */
const MEMBER_UPLOADS_PER_10MIN = 40;

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

/** ?folder= 가 손님 폴더면 그 이름, 아니면 null (관리자 길) */
function memberFolderOf(request: Request): string | null {
  const folder = new URL(request.url).searchParams.get('folder');
  return folder && folder in MEMBER_FOLDERS ? folder : null;
}

/**
 * 손님 업로드가 거절·실패한 이유를 남깁니다.
 * ★ 무엇을(리뷰/문의 사진) · 누가(회원 id 앞 8자, 비로그인) · 왜 를 한 줄로.
 *   파일 이름은 남기지 않습니다. 손님이 붙인 이름에 개인정보가 들어 있을 수 있습니다.
 */
function logMemberFailure(
  action: '올리기' | '지우기',
  folder: string,
  who: string,
  reason: string,
  file?: File
) {
  const detail = file ? ` | 파일: ${file.type || '형식 없음'} ${Math.round(file.size / 1024)}KB` : '';
  console.warn(`[upload] ${MEMBER_FOLDERS[folder]} ${action} 실패 — ${who} | ${reason}${detail}`);
}

/** 원본 이미지를 webp 두 벌(본 이미지 · 썸네일)로 만들어 R2 에 올립니다. */
async function processAndPut(
  r2: ReturnType<typeof requireR2>,
  file: File,
  keys: { key: string; thumbKey: string }
): Promise<UploadedImage> {
  const input = Buffer.from(await file.arrayBuffer());
  const animated = file.type === 'image/gif';

  const metadata = await sharp(input, { animated }).rotate().metadata();
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

  const put = (Key: string, Body: Buffer) =>
    r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key,
        Body,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
  await Promise.all([put(keys.key, full.data), put(keys.thumbKey, thumb)]);

  return {
    url: toPublicUrl(keys.key),
    thumbUrl: toPublicUrl(keys.thumbKey),
    key: keys.key,
    thumbKey: keys.thumbKey,
    width: full.info.width ?? metadata.width ?? 0,
    height: full.info.height ?? metadata.height ?? 0,
    bytes: full.data.byteLength,
  };
}

/** 손님 길 — 리뷰·문의 사진 한 장 */
async function memberPost(request: Request, folder: string): Promise<Response> {
  const member = await getActiveMember();
  if (!member) {
    logMemberFailure('올리기', folder, '비로그인', '로그인하지 않았거나 쇼핑몰 회원이 아닙니다');
    return NextResponse.json(
      { error: '로그인이 풀렸습니다. 다시 로그인한 뒤 사진을 올려 주세요.' },
      { status: 401 }
    );
  }
  const who = `회원 ${member.user.id.slice(0, 8)}`;

  if (!rateLimit(`upload:${member.user.id}`, MEMBER_UPLOADS_PER_10MIN, 10 * 60_000).ok) {
    logMemberFailure('올리기', folder, who, '10분 사이에 너무 많이 올렸습니다');
    return NextResponse.json(
      { error: '사진을 너무 많이 올리셨습니다. 잠시 뒤에 다시 시도해 주세요.' },
      { status: 429 }
    );
  }

  let r2;
  try {
    r2 = requireR2();
  } catch (error) {
    logMemberFailure('올리기', folder, who, `R2 설정 오류: ${error instanceof Error ? error.message : error}`);
    return NextResponse.json(
      { error: '지금은 사진을 올릴 수 없습니다. 잠시 뒤에 다시 시도해 주세요.' },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    logMemberFailure('올리기', folder, who, '요청 형식을 읽지 못했습니다');
    return NextResponse.json({ error: '사진을 읽지 못했습니다. 다시 골라 주세요.' }, { status: 400 });
  }

  const files = form.getAll('files').filter((item): item is File => item instanceof File);
  if (files.length !== 1) {
    logMemberFailure('올리기', folder, who, `한 번에 한 장만 받습니다 (받은 수: ${files.length})`);
    return NextResponse.json({ error: '사진은 한 장씩 올려 주세요.' }, { status: 400 });
  }

  const file = files[0];
  if (!ALLOWED_TYPES.has(file.type)) {
    logMemberFailure('올리기', folder, who, '받지 않는 형식', file);
    return NextResponse.json(
      { error: 'jpg·png·webp·gif 사진만 올릴 수 있습니다.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    logMemberFailure('올리기', folder, who, '파일이 너무 큼', file);
    return NextResponse.json({ error: '사진이 너무 큽니다.' }, { status: 400 });
  }

  try {
    const image = await processAndPut(r2, file, makeMemberKeys(folder, member.user.id));
    return NextResponse.json({ images: [image] });
  } catch (error) {
    logMemberFailure(
      '올리기',
      folder,
      who,
      `이미지 처리·저장 실패: ${error instanceof Error ? error.message : String(error)}`,
      file
    );
    return NextResponse.json(
      { error: '사진을 처리하지 못했습니다. 다른 사진으로 시도해 주세요.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const memberFolder = memberFolderOf(request);
  if (memberFolder) return memberPost(request, memberFolder);

  /* ── 관리자 길 — 아래는 예전 그대로입니다 ── */
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
  const memberFolder = memberFolderOf(request);
  if (memberFolder) return memberDelete(request, memberFolder);

  /* ── 관리자 길 — 아래는 예전 그대로입니다 ── */
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

/**
 * 손님 길 — 자기가 올린 사진 지우기.
 *
 * ★★ 자기 폴더({폴더}/{본인 id}/) 안의 것만 지웁니다.
 *   주소 하나라도 그 밖을 가리키면 하나도 지우지 않고 403 입니다.
 *   섞어서 보내 일부만 지워지게 두면, 남의 사진을 노린 요청이
 *   "일부 성공" 처럼 보여 알아채기 어렵습니다.
 */
async function memberDelete(request: Request, folder: string): Promise<Response> {
  const member = await getActiveMember();
  if (!member) {
    logMemberFailure('지우기', folder, '비로그인', '로그인하지 않았습니다');
    return NextResponse.json({ error: '로그인이 풀렸습니다. 다시 로그인해 주세요.' }, { status: 401 });
  }
  const who = `회원 ${member.user.id.slice(0, 8)}`;

  let r2;
  try {
    r2 = requireR2();
  } catch (error) {
    logMemberFailure('지우기', folder, who, `R2 설정 오류: ${error instanceof Error ? error.message : error}`);
    return NextResponse.json({ error: '지금은 사진을 지울 수 없습니다.' }, { status: 500 });
  }

  let body: { urls?: unknown };
  try {
    body = (await request.json()) as { urls?: unknown };
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls.filter((item): item is string => typeof item === 'string')
    : [];
  const keys: string[] = [];
  for (const url of urls) {
    const key = toObjectKey(url);
    const own = key ? ownMemberKeys(key, folder, member.user.id) : null;
    if (!own) {
      logMemberFailure('지우기', folder, who, `자기 폴더 밖의 사진이라 거절했습니다 (${key ?? '우리 주소 아님'})`);
      return NextResponse.json({ error: '지울 수 없는 사진입니다.' }, { status: 403 });
    }
    keys.push(...own);
  }

  if (keys.length === 0) {
    return NextResponse.json({ error: '삭제할 이미지가 없습니다.' }, { status: 400 });
  }

  const deleted: string[] = [];
  for (const key of keys) {
    try {
      await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
      deleted.push(key);
    } catch (error) {
      logMemberFailure('지우기', folder, who, `${key}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return NextResponse.json({ deleted });
}
