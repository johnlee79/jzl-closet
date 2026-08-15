#!/usr/bin/env node
/**
 * 코드가 참조하는 DB 컬럼이 실제 스키마에 있는지 대조합니다.
 *
 * ★ 왜 필요한가
 *   컬럼 이름을 하나 잘못 적으면 조회가 통째로 실패합니다.
 *   그런데 우리 코드는 조회 실패를 "빈 목록" 으로 넘기는 곳이 많습니다.
 *   화면이 깨지지 않고 그냥 비어 보이기 때문에 한참 뒤에야 알게 됩니다.
 *   실제로 products 의 thumbnails 를 images 라고 적어 두는 바람에
 *   관리자 상품 목록이 한동안 통째로 비어 있었습니다. (건수만 맞고 목록은 0건)
 *
 *   빌드는 이런 실수를 잡지 못합니다. 타입에는 맞고 DB 에만 안 맞기 때문입니다.
 *   그래서 실제 DB 에 물어보는 검사를 따로 둡니다.
 *
 * ★ 새 SQL 을 돌리기 전에도 통과해야 합니다.
 *   아직 만들지 않은 테이블은 건너뜁니다. 없는 테이블은 코드가 알아서 견딥니다.
 *
 * 쓰는 법
 *   npm run check:schema
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

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.log('Supabase 연결 정보가 없어 건너뜁니다. (.env.local 확인)');
  process.exit(0);
}

/* ── 실제 스키마 가져오기 ────────────────────────────────── */
/*
 * PostgREST 는 루트 주소에서 OpenAPI 문서를 내려 줍니다.
 * 여기에 테이블과 컬럼이 전부 들어 있어, 행이 하나도 없는 테이블도 확인됩니다.
 */
async function fetchSchema() {
  const response = await fetch(`${URL_}/rest/v1/`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!response.ok) throw new Error(`스키마를 읽지 못했습니다: HTTP ${response.status}`);
  const doc = await response.json();
  const defs = doc.definitions ?? doc.components?.schemas ?? {};
  const tables = {};
  for (const [name, def] of Object.entries(defs)) {
    tables[name] = Object.keys(def.properties ?? {});
  }
  const functions = Object.keys(doc.paths ?? {})
    .filter((p) => p.startsWith('/rpc/'))
    .map((p) => p.slice(5));
  return { tables, functions };
}

/* ── 소스 파일 모으기 ────────────────────────────────────── */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Row 타입 이름 → 테이블. 새 테이블을 만들면 여기에 한 줄 더합니다. */
const ROW_TYPES = {
  ProductRow: 'products',
  BrandRow: 'brands',
  CategoryRow: 'categories',
  OrderRow: 'orders',
  OrderItemRow: 'order_items',
  HistoryRow: 'order_status_history',
  ProfileRow: 'profiles',
  InquiryRow: 'inquiries',
  ReviewRow: 'reviews',
  NoticeRow: 'notices',
  PopupRow: 'popups',
  PointRow: 'point_transactions',
  TemplateRow: 'templates',
  GiftRow: 'referral_gifts',
  GoalRow: 'referral_goals',
  AchievementRow: 'referral_achievements',
};

/** 조인으로 붙인 이름이라 컬럼이 아닌 것들 */
const JOINED = new Set([
  'goal',
  'gift',
  'member',
  'invitee',
  'referrer',
  'product',
  'items',
]);

function scan(tables) {
  const roots = ['lib', 'app', 'components'];
  const files = roots.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));
  const findings = [];
  let checked = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');

    // const TABLE = 'products' 같은 상수를 풀어 둡니다.
    const consts = {};
    for (const m of src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'([a-z_]+)'/g)) {
      consts[m[1]] = m[2];
    }

    /*
     * .from(...) 이 나온 자리마다, 다음 .from() 또는 빈 줄까지를 그 쿼리의 범위로 봅니다.
     * 범위를 넉넉히 잡으면 옆 함수의 조건까지 끌어와 없는 컬럼처럼 보입니다.
     */
    const spots = [...src.matchAll(/\.from\(\s*(?:'([a-z_]+)'|([A-Z_][A-Z0-9_]*))\s*\)/g)];
    for (let i = 0; i < spots.length; i += 1) {
      const table = spots[i][1] ?? consts[spots[i][2]];
      // 테이블 이름이 변수면 무엇인지 알 수 없어 건너뜁니다.
      if (!table) continue;
      // 아직 만들지 않은 테이블은 검사하지 않습니다.
      if (!tables[table]) continue;

      const start = spots[i].index + spots[i][0].length;
      const nextFrom = i + 1 < spots.length ? spots[i + 1].index : src.length;
      const blank = src.indexOf('\n\n', start);
      const end = Math.min(nextFrom, blank < 0 ? src.length : blank);
      const chunk = src.slice(start, end);

      const has = (col) => tables[table].includes(col);
      const hit = (col, kind) => {
        checked += 1;
        if (!has(col)) findings.push({ file, table, col, kind });
      };

      // .select('a, b, c')
      const sel = chunk.match(/^\s*\.select\(\s*(['"`])([\s\S]*?)\1/);
      if (sel && sel[2].trim() !== '*') {
        // alias:table(col) / table(col) 같은 조인 문법은 떼어 냅니다.
        const cleaned = sel[2]
          .replace(/[a-z_]+:[a-z_!.]+\([^)]*\)/g, '')
          .replace(/[a-z_]+\([^)]*\)/g, '');
        for (const part of cleaned.split(',')) {
          const col = part.trim();
          if (/^[a-z][a-z0-9_]*$/.test(col)) hit(col, 'select');
        }
      }

      // .eq('col', …) · .order('col') 등
      for (const m of chunk.matchAll(
        /\.(?:eq|neq|gt|gte|lt|lte|is|in|like|ilike|order)\(\s*'([a-z][a-z0-9_]*)'/g
      )) {
        hit(m[1], 'filter');
      }

      // .insert({ col: … }) · .update({ col: … })
      for (const w of chunk.matchAll(/\.(?:insert|update|upsert)\(\s*\{([\s\S]*?)\n\s*\}/g)) {
        for (const line of w[1].split('\n')) {
          const k = line.match(/^\s*([a-z][a-z0-9_]*)\s*:/);
          if (k) hit(k[1], 'write');
        }
      }
    }

    /*
     * 컬럼 목록 상수.
     *   const LIST_COLUMNS = ['id', 'slug', …].join(', ');
     *   const BRAND_COLUMNS = 'id, slug, label, …';
     *
     * ★ 이 자리가 가장 위험합니다.
     *   .select() 에 변수로 넘어가기 때문에 위의 문자열 검사에 걸리지 않고,
     *   목록을 통째로 못 읽게 만듭니다. 실제로 여기서 사고가 났습니다.
     *
     * ★ 어느 테이블용인지 코드만 보고는 알 수 없습니다. (함수 인자로 건너다닙니다)
     *   그래서 "이 파일이 다루는 테이블 중 어디에도 없는 컬럼" 만 잡습니다.
     *   일부러 컬럼을 뺀 목록(예: 옛 스키마용 목록)은 부분집합이라 걸리지 않습니다.
     */
    const fileTables = new Set();
    for (const s of spots) {
      const t = s[1] ?? consts[s[2]];
      if (t && tables[t]) fileTables.add(t);
    }
    for (const t of Object.values(consts)) if (tables[t]) fileTables.add(t);

    if (fileTables.size > 0) {
      const known = new Set([...fileTables].flatMap((t) => tables[t]));

      for (const m of src.matchAll(
        /const\s+([A-Z_][A-Z0-9_]*(?:COLUMNS|SELECT|FIELDS))\s*=\s*([\s\S]*?);/g
      )) {
        const body = m[2]
          .replace(/[a-z_]+:[a-z_!.]+\([^)]*\)/g, '')
          .replace(/[a-z_]+\([^)]*\)/g, '');
        for (const lit of body.matchAll(/'([^']*)'/g)) {
          for (const part of lit[1].split(',')) {
            const col = part.trim();
            if (!/^[a-z][a-z0-9_]*$/.test(col)) continue;
            checked += 1;
            if (!known.has(col)) {
              findings.push({
                file,
                table: [...fileTables].join('|'),
                col,
                kind: `상수 ${m[1]}`,
              });
            }
          }
        }
      }
    }

    /* Row 타입 정의 — DB 행을 그대로 받는 모양이라 컬럼과 1:1 이어야 합니다. */
    for (const [type, table] of Object.entries(ROW_TYPES)) {
      if (!tables[table]) continue;
      const at = src.indexOf(`type ${type} = {`);
      if (at < 0) continue;
      const close = src.indexOf('\n};', at);
      if (close < 0) continue;
      for (const line of src.slice(at, close).split('\n')) {
        const k = line.match(/^ {2}([a-z][a-z0-9_]*)\??\s*:/);
        if (!k || JOINED.has(k[1])) continue;
        checked += 1;
        if (!tables[table].includes(k[1])) {
          findings.push({ file, table, col: k[1], kind: 'rowtype' });
        }
      }
    }
  }

  return { findings, checked };
}

/** 코드가 부르는 DB 함수가 실제로 있는지 */
function scanRpc(functions) {
  const roots = ['lib', 'app'];
  const files = roots.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));
  const missing = [];
  const seen = new Set();

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      if (!functions.includes(m[1])) missing.push({ file, fn: m[1] });
    }
  }
  return { missing, total: seen.size };
}

/* ── 실행 ────────────────────────────────────────────────── */
const { tables, functions } = await fetchSchema();
const { findings, checked } = scan(tables);
const { missing, total } = scanRpc(functions);

console.log(`테이블 ${Object.keys(tables).length}개 · 컬럼 참조 ${checked}건 · DB 함수 ${total}개 검사`);

if (findings.length === 0 && missing.length === 0) {
  console.log('실제 스키마와 어긋나는 참조가 없습니다.');
  process.exit(0);
}

console.log('');
for (const f of findings) {
  console.log(`  [컬럼 없음] ${f.table}.${f.col}  (${f.kind})  ${f.file}`);
}
for (const m of missing) {
  console.log(`  [함수 없음] ${m.fn}  ${m.file}`);
}
console.log('');
console.log('아직 안 돌린 SQL 이 있다면 supabase/ 의 schema-*.sql 을 순서대로 실행해 주세요.');
console.log('SQL 을 다 돌렸는데도 남아 있다면 코드의 이름이 틀린 것입니다.');
process.exit(1);
