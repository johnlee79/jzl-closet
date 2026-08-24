/**
 * ============================================================
 * 관리자 문이 하나도 빠짐없이 잠겨 있는지 확인합니다
 * ============================================================
 *
 * 실행: npm run check:guard
 *
 * ★★ 왜 필요한가
 *   예전에는 똑같은 관리자 검사가 서버 액션 9곳과 API 8곳에 제각각
 *   복사되어 있었습니다. 전부 17벌입니다. 새 액션을 하나 만들면서 검사를
 *   깜빡하면 그게 그대로 구멍인데, 화면으로는 절대 안 보입니다.
 *   관리자 화면은 잘 돌아가고, 아무 일도 일어나지 않는 것처럼 보입니다.
 *
 *   실제로 이 저장소에서 await 하나를 빠뜨려 인증이 통째로 무력화된 적이
 *   있습니다. (app/api/admin/import/sellstar/route.ts 의 주석 참고)
 *
 * ★ 그래서 사람이 아니라 이 스크립트가 셉니다.
 *   내보내는 서버 액션 하나하나, 라우트 핸들러 하나하나가
 *   isAdmin() 을 부르는지 봅니다.
 *
 * ★ DB 도 네트워크도 건드리지 않습니다. 파일만 읽습니다.
 */
import fs from 'node:fs';
import path from 'node:path';

const problems = [];
const checked = { actions: 0, routes: 0 };

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function listFiles(dir, match) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full, match));
    else if (match(full)) found.push(full);
  }
  return found;
}

/** 함수 본문을 대충 잘라 냅니다. 다음 export 가 나오기 전까지입니다. */
function bodyAfter(text, index) {
  const rest = text.slice(index + 1);
  const next = rest.indexOf('\nexport ');
  return next === -1 ? rest : rest.slice(0, next);
}

/* ------------------------------------------------------------------
 * 1. 관리자 서버 액션 — app/admin/*.ts
 * ------------------------------------------------------------------ */

const ACTION_FILES = fs
  .readdirSync('app/admin')
  .filter((name) => name.endsWith('-actions.ts') || name === 'actions.ts')
  .map((name) => path.join('app/admin', name));

for (const file of ACTION_FILES) {
  const text = read(file);

  /*
   * ★ 로그인 액션은 예외입니다. 로그인하기 전에 부르는 것이라
   *   관리자여야 부를 수 있다면 아무도 못 들어옵니다.
   *   대신 그 파일은 스스로 시도 횟수를 제한하고 이메일 목록을 봅니다.
   */
  if (file.endsWith('login-actions.ts')) continue;

  if (!text.includes("from '@/lib/admin-guard'")) {
    problems.push(`${file} — admin-guard 를 가져오지 않습니다`);
    continue;
  }

  const pattern = /export async function (\w+)\s*\(/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    checked.actions += 1;
    const name = match[1];
    if (!bodyAfter(text, match.index).includes('await isAdmin()')) {
      problems.push(`${file} — ${name}() 이 isAdmin() 을 부르지 않습니다`);
    }
  }
}

/* ------------------------------------------------------------------
 * 2. 관리자 API 라우트 — app/api/admin/** 과 app/api/upload
 * ------------------------------------------------------------------
 *
 * ★★ 이 라우트들은 middleware 를 지나지 않습니다.
 *   matcher 가 '/admin/:path*' 이라 '/api/admin/...' 은 안 걸립니다.
 *   그래서 라우트 하나하나가 스스로 막아야 합니다.
 */
const ROUTE_FILES = [
  ...listFiles('app/api/admin', (file) => file.endsWith('route.ts')),
  'app/api/upload/route.ts',
];

for (const file of ROUTE_FILES) {
  const text = read(file);

  // 로그인 입구는 예외입니다. (위와 같은 이유)
  if (file.replace(/\\/g, '/').endsWith('api/admin/login/route.ts')) continue;

  if (!text.includes("from '@/lib/admin-guard'")) {
    problems.push(`${file} — admin-guard 를 가져오지 않습니다`);
    continue;
  }

  const pattern = /export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    checked.routes += 1;
    const method = match[1];
    if (!bodyAfter(text, match.index).includes('await isAdmin()')) {
      problems.push(`${file} — ${method} 가 isAdmin() 을 부르지 않습니다`);
    }
  }
}

/* ------------------------------------------------------------------
 * 3. 옛 검사가 남아 있지 않은지
 * ------------------------------------------------------------------ */

/*
 * 옛 검사를 써도 되는 곳.
 * ★ 로그인 입구는 쿠키를 발급하는 자리라 ADMIN_COOKIE 를 씁니다.
 *   막는 것이 아니라 열어 주는 곳이라 예외입니다.
 * ★ 4단계에서 옛 길을 닫으면 이 목록도 비게 됩니다.
 */
const ALLOWED_OLD = [
  'lib/admin-auth.ts',
  'lib/admin-guard.ts',
  'middleware.ts',
  'api/admin/login/route.ts',
];

for (const file of [...ACTION_FILES, ...ROUTE_FILES]) {
  const text = read(file);
  const normalized = file.replace(/\\/g, '/');
  if (ALLOWED_OLD.some((allowed) => normalized.endsWith(allowed))) continue;
  if (text.includes('verifySessionToken') || text.includes('ADMIN_COOKIE')) {
    problems.push(`${file} — 옛 검사(verifySessionToken/ADMIN_COOKIE)가 남아 있습니다`);
  }
}

/* ── 결과 ── */

console.log(
  `관리자 서버 액션 ${checked.actions}개 · 관리자 API ${checked.routes}개를 확인했습니다.`
);

if (problems.length > 0) {
  console.log('');
  for (const problem of problems) console.log(`  구멍  ${problem}`);
  console.log('');
  console.log(`${problems.length}곳이 막혀 있지 않습니다. 배포하지 마세요.`);
  process.exit(1);
}

console.log('전부 같은 문(isAdmin)으로 막혀 있습니다.');
