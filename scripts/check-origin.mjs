#!/usr/bin/env node
/**
 * 이미 등록된 상품 중 제조사 칸에 국가명이 들어간 것을 찾습니다.
 *
 * ★ 왜 필요한가
 *   원산지와 제조사는 다른 항목입니다.
 *     원산지 — 어느 나라에서 만들었나 (중국, 베트남 …)
 *     제조사 — 어느 회사가 만들었나 (○○어패럴 …)
 *   가져오기에서 이 둘이 섞여 국가명이 제조사 칸에 들어간 상품이 있었습니다.
 *
 * ★ 이 스크립트는 읽기만 합니다. 고치지 않습니다.
 *   무엇을 어떻게 고칠지는 사람이 보고 정할 일입니다. 상품마다 사정이 다릅니다.
 *   (실제 제조사를 아는 상품이면 국가명을 지우는 게 아니라 회사명을 넣어야 합니다)
 *
 * ★ 나라 목록은 lib/countries.json 을 그대로 씁니다. lib/origin.ts 와 같은 목록입니다.
 *   다듬는 규칙(normalize)만 여기 다시 적혀 있습니다. 이 파일은 TS 를 못 읽습니다.
 *   lib/origin.ts 의 normalizeCountryText 를 고치면 아래 normalize 도 같이 고쳐 주세요.
 *
 * 쓰는 법
 *   node scripts/check-origin.mjs
 *
 * 필요한 환경변수 (.env.local 에 이미 있습니다)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs';
import path from 'node:path';

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

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

/* ── 나라 목록 (lib/countries.json 과 같은 파일) ──────────── */
const COUNTRIES = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'lib', 'countries.json'), 'utf8')
);

/** lib/origin.ts 의 normalizeCountryText 와 같은 규칙입니다. */
function normalize(raw) {
  return String(raw)
    .toUpperCase()
    .replace(/^\s*MADE\s*IN\s*[:\-]?\s*/i, '')
    .replace(/[.,()[\]{}'"·/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/산$/, '');
}

const LOOKUP = new Map();
for (const entry of COUNTRIES) {
  for (const alias of entry.aliases) LOOKUP.set(normalize(alias), entry.ko);
}

const toKoreanCountry = (raw) => (raw ? LOOKUP.get(normalize(raw)) ?? null : null);

/* ── 조회 ────────────────────────────────────────────────── */
async function select(table, query) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

const rows = await select(
  'products',
  'select=id,slug,name,origin,manufacturer,brand_slug,sellstar_id,is_visible&order=created_at.asc&limit=2000'
);

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

/* ── 1. 제조사 칸에 국가명이 들어간 상품 ─────────────────── */
const misplaced = rows
  .filter((r) => toKoreanCountry(r.manufacturer))
  .map((r) => ({ ...r, suggested: toKoreanCountry(r.manufacturer) }));

console.log(`\n전체 상품 ${rows.length}건\n`);
console.log('='.repeat(78));
console.log('[1] 제조사 칸에 국가명이 들어간 상품');
console.log('='.repeat(78));
if (misplaced.length === 0) {
  console.log('없습니다.');
} else {
  console.log(
    `${pad('상품명', 30)} ${pad('현재 제조사', 12)} ${pad('현재 원산지', 12)} ${pad('제안 원산지', 10)} 출처`
  );
  console.log('-'.repeat(78));
  for (const r of misplaced) {
    console.log(
      `${pad(r.name, 30)} ${pad(r.manufacturer, 12)} ${pad(r.origin ?? '(없음)', 12)} ${pad(
        r.suggested,
        10
      )} ${r.sellstar_id ? `셀스타 ${r.sellstar_id}` : '직접등록'}`
    );
  }
  console.log(`\n총 ${misplaced.length}건`);
}

/* ── 2. 원산지가 영문으로 적힌 상품 ──────────────────────── */
const englishOrigin = rows.filter((r) => {
  const ko = toKoreanCountry(r.origin);
  return ko && ko !== String(r.origin).trim();
});
console.log('\n' + '='.repeat(78));
console.log('[2] 원산지가 영문·약자로 적힌 상품 (한글로 통일하면 좋은 것)');
console.log('='.repeat(78));
if (englishOrigin.length === 0) {
  console.log('없습니다.');
} else {
  for (const r of englishOrigin) {
    console.log(`${pad(r.name, 34)} ${pad(r.origin, 14)} → ${toKoreanCountry(r.origin)}`);
  }
  console.log(`\n총 ${englishOrigin.length}건`);
}

/* ── 3. 원산지가 비어 있는 상품 ──────────────────────────── */
const noOrigin = rows.filter((r) => !r.origin || !String(r.origin).trim());
console.log('\n' + '='.repeat(78));
console.log('[3] 원산지가 비어 있는 상품');
console.log('='.repeat(78));
console.log(
  `${noOrigin.length}건 / 전체 ${rows.length}건` +
    (noOrigin.length ? `  (노출 중 ${noOrigin.filter((r) => r.is_visible).length}건)` : '')
);

/* ── 4. 제조사에 남아 있는 값 전체 (국가명이 아닌 것) ────── */
const realMakers = [
  ...new Set(
    rows
      .map((r) => (r.manufacturer ?? '').trim())
      .filter((v) => v && !toKoreanCountry(v))
  ),
];
console.log('\n' + '='.repeat(78));
console.log('[4] 제조사 칸의 나머지 값 (회사명으로 보이는 것)');
console.log('='.repeat(78));
console.log(realMakers.length ? realMakers.join('\n') : '없습니다.');
console.log('');
