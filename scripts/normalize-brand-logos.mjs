#!/usr/bin/env node
/**
 * 브랜드 로고를 균일한 크기로 다시 굽습니다.
 *
 * ★ 자동으로 돌지 않습니다. 손으로 한 번 돌리는 스크립트입니다.
 *
 * 쓰는 법
 *   node scripts/normalize-brand-logos.mjs --dry-run   계산 결과만 봅니다 (아무것도 안 바꿈)
 *   node scripts/normalize-brand-logos.mjs             실제로 올리고 DB 를 고칩니다
 *   node scripts/normalize-brand-logos.mjs --only ganni,palace   일부만
 *
 * ★★ 원본을 먼저 안전한 곳에 복사한 뒤에만 새 이미지를 만듭니다.
 *   복사가 실패하면 그 브랜드는 건너뜁니다. 원본 없이 덮어쓰면 되돌릴 수 없습니다.
 *
 * ★★ 기존 키를 덮어쓰지 않습니다.
 *   Cloudflare 가 옛 이미지를 한동안 계속 내보내기 때문입니다.
 *   매번 새 키(시각이 붙은 이름)로 올리고 logo_url 만 갈아 끼웁니다.
 *
 * 필요한 환경변수 (.env.local 에 이미 있습니다)
 *   NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 *   R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME · NEXT_PUBLIC_R2_PUBLIC_URL
 */

import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { normalizeBrandLogo } from '../lib/brand-logo.mjs';

/* ── .env.local 읽기 (dotenv 없이) ───────────────────────── */
function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^['"]|['"]$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnv();

const DRY = process.argv.includes('--dry-run');
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_PUBLIC = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

/* ── R2 ──────────────────────────────────────────────────── */
function makeR2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !R2_PUBLIC) return null;
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

const r2 = makeR2();
if (!DRY && !r2) {
  console.error('R2 설정이 없습니다. --dry-run 으로는 볼 수 있지만 실제 업로드는 못 합니다.');
  process.exit(1);
}

async function putObject(key, body, contentType) {
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return `${R2_PUBLIC}/${key}`;
}

/* ── Supabase ────────────────────────────────────────────── */
async function readBrands() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/brands?select=*&order=display_order`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`brands 조회 실패: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchBrand(id, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/brands?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`brands 수정 실패: ${res.status} ${await res.text()}`);
}

/* ── 도우미 ──────────────────────────────────────────────── */
const pad = (text, width) => {
  // 한글은 두 칸을 차지합니다. 표가 어긋나지 않게 실제 폭으로 셉니다.
  let w = 0;
  for (const ch of String(text)) w += /[ᄀ-ᇿ㄰-㆏가-힯＀-￯]/.test(ch) ? 2 : 1;
  return String(text) + ' '.repeat(Math.max(0, width - w));
};

const extOf = (url) => {
  const m = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(url);
  return m ? m[1].toLowerCase() : 'bin';
};

const contentTypeOf = (ext) =>
  ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' }[ext] ??
  'application/octet-stream');

/* ── 본체 ────────────────────────────────────────────────── */
async function main() {
  console.log(DRY ? '── 계산만 합니다 (--dry-run) ──\n' : '── 실제로 올리고 DB 를 고칩니다 ──\n');

  const brands = await readBrands();
  const targets = brands.filter(
    (b) => b.logo_url && (ONLY.length === 0 || ONLY.includes(b.slug))
  );

  console.log(`브랜드 ${brands.length}개 중 로고가 있는 ${targets.length}개를 처리합니다.`);
  if (brands.length !== targets.length && ONLY.length === 0) {
    const none = brands.filter((b) => !b.logo_url).map((b) => b.label);
    console.log(`로고 없음 (건너뜀): ${none.join(', ')}`);
  }
  console.log('');

  const header =
    pad('브랜드', 22) + pad('트리밍 전', 12) + pad('트리밍 후', 12) +
    pad('비율', 7) + pad('잉크', 7) + pad('보정k', 8) + pad('최종', 12) + '결과';
  console.log(header);
  console.log('─'.repeat(header.length + 10));

  const stamp = Date.now();
  const lowRes = [];
  const notTrimmed = [];
  const clamped = [];
  const failures = [];

  for (const brand of targets) {
    let line = pad(brand.label ?? brand.slug, 22);
    try {
      /* ① 원본 내려받기 — 이미 원본이 따로 있으면 그쪽을 씁니다. */
      const source = brand.logo_original_url || brand.logo_url;
      const res = await fetch(source);
      if (!res.ok) throw new Error(`내려받기 실패 ${res.status}`);
      const input = Buffer.from(await res.arrayBuffer());

      /* ② 계산 + 이미지 생성 */
      const scale = Number(brand.logo_scale ?? 1) || 1;
      const { buffer, report } = await normalizeBrandLogo(input, {
        logoScale: scale,
        label: brand.label ?? brand.slug,
      });

      line +=
        pad(`${report.before.width}×${report.before.height}`, 12) +
        pad(`${report.after.width}×${report.after.height}`, 12) +
        pad(report.ratio.toFixed(2), 7) +
        pad(`${Math.round(report.inkRatio * 100)}%`, 7) +
        pad(report.k.toFixed(2), 8) +
        pad(`${report.finalW}×${report.finalH}`, 12);

      if (report.rawScale > 3) lowRes.push(brand.label);
      if (!report.trimmed) notTrimmed.push(`${brand.label} (${report.trimReason})`);
      if (report.clampedByCanvas) clamped.push(brand.label);

      if (DRY) {
        console.log(line + '계산만');
        continue;
      }

      /* ③ ★ 원본을 먼저 안전한 곳에 복사합니다. 실패하면 건너뜁니다. */
      let originalUrl = brand.logo_original_url ?? '';
      if (!originalUrl) {
        const ext = extOf(brand.logo_url);
        originalUrl = await putObject(
          `brands/original/${brand.slug}.${ext}`,
          input,
          contentTypeOf(ext)
        );
        await patchBrand(brand.id, { logo_original_url: originalUrl });
      }

      /* ④ 새 키로 업로드 — 기존 키를 덮지 않습니다 (Cloudflare 캐시) */
      const newUrl = await putObject(
        `brands/normalized/${brand.slug}-${stamp}.webp`,
        buffer,
        'image/webp'
      );

      /* ⑤ logo_url 갈아 끼우기 */
      await patchBrand(brand.id, { logo_url: newUrl });

      console.log(line + '완료');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${brand.label}: ${message}`);
      console.log(line + `실패 — ${message}`);
    }
  }

  console.log('\n════ 요약 ════');
  console.log(`처리 대상        ${targets.length}개`);
  console.log(`확대 배율 3배 초과 (원본 해상도 낮음)  ${lowRes.length ? lowRes.join(', ') : '없음'}`);
  console.log(`트리밍 안 함     ${notTrimmed.length ? notTrimmed.join(', ') : '없음'}`);
  console.log(`캔버스 상한에 걸림  ${clamped.length ? clamped.join(', ') : '없음  ← 하나도 없어야 정상'}`);
  console.log(`실패             ${failures.length ? failures.join(' / ') : '없음'}`);
  if (DRY) console.log('\n--dry-run 이라 아무것도 바꾸지 않았습니다.');
}

main().catch((error) => {
  console.error('\n실패:', error instanceof Error ? error.message : error);
  process.exit(1);
});
