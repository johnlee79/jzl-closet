/**
 * 관리자 세션. middleware(Edge 런타임)와 API 라우트(Node 런타임)에서 모두 쓰이므로
 * Node 전용 모듈 대신 Web Crypto 만 사용합니다.
 *
 * ★ 이 파일은 서버에서만 import 하세요. 비밀번호는 절대 클라이언트로 내려가지 않습니다.
 *   쿠키에는 비밀번호가 아니라 서명값만 담깁니다.
 */

export const ADMIN_COOKIE = 'jzl_admin_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일

/**
 * ============================================================
 * ★★ 관리자 Supabase 세션이 쓰는 쿠키 칸 이름 (2026-08-26)
 * ============================================================
 *
 * ★★ 왜 이름을 따로 두는가
 *   전에는 관리자와 손님이 **쿠키 한 칸을 같이 썼습니다.**
 *   그래서 관리자로 들어와 있다가 손님 화면에서 구글·카카오 로그인을
 *   누르면, 그 칸이 손님 세션으로 덮어써지면서 관리자 세션이 그 자리에서
 *   사라졌습니다. (덮어쓰는 곳: app/auth/callback/route.ts 의
 *   exchangeCodeForSession)
 *
 *   쓰는 사람에게는 "또 로그아웃됐네" 로만 보였습니다. 로그아웃도
 *   마찬가지였습니다 — 손님으로 로그아웃하면 관리자도 같이 나갔고,
 *   관리자로 로그아웃하면 손님도 같이 나갔습니다.
 *
 * ★★ 손님 쪽 이름은 건드리지 않습니다.
 *   손님은 Supabase 기본 이름을 그대로 씁니다. 그래서 이 변경으로
 *   손님이 다시 로그인할 일이 없습니다. 바뀌는 것은 관리자뿐입니다.
 *
 * ★ 이것은 비상 통로(ADMIN_COOKIE)와 아무 상관이 없습니다.
 *   비상 통로는 Supabase 를 거치지 않습니다. 이 이름이 무엇이든
 *   비밀번호로는 항상 들어올 수 있습니다.
 *
 * ★ 되돌리려면 이 값을 손님과 같은 이름으로 바꾸면 됩니다.
 *   'sb-thsopzzvrtmqoqmsmiuc-auth-token' (Supabase 기본 이름)
 */
export const ADMIN_AUTH_COOKIE = 'sb-jzl-admin-auth-token';

/* ==================================================================
 * 관리자 이메일 목록 (2단계)
 * ==================================================================
 *
 * ★★ 왜 DB 가 아니라 환경변수인가
 *   profiles 에 is_admin 같은 칸을 두면, DB 에 쓸 수 있는 사람이
 *   자기 자신을 관리자로 만들 수 있습니다. 환경변수는 DB 와 별개라
 *   DB 가 뚫려도 관리자가 늘어나지 않습니다.
 *   대신 사람을 늘릴 때마다 값을 고치고 다시 배포해야 합니다.
 *   혼자 쓰는 동안에는 이쪽이 낫습니다.
 *
 * ★ 쉼표로 나눕니다. 줄바꿈과 공백은 알아서 걸러냅니다.
 *   예) ADMIN_EMAILS=me@example.com, another@example.com
 *
 * ★ 대소문자를 가리지 않습니다. 이메일은 원래 그렇습니다.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(/[,\n]/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

/** 이 이메일이 관리자 목록에 있는지 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const target = (email ?? '').trim().toLowerCase();
  if (!target) return false;
  return adminEmails().includes(target);
}

/** 이메일 로그인을 쓸 수 있는 상태인지 — 목록이 비어 있으면 아직 못 씁니다. */
export function isAdminEmailConfigured(): boolean {
  return adminEmails().length > 0;
}

function getSecret(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.length > 0 ? password : null;
}

export function isAdminConfigured(): boolean {
  return getSecret() !== null;
}

/** 길이가 같은 두 문자열을 시간 차이 없이 비교합니다. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(signature);
}

/** 비밀번호가 맞는지 서버에서만 대조합니다. */
export function verifyPassword(input: string): boolean {
  const secret = getSecret();
  if (!secret) return false;
  return safeEqual(input, secret);
}

/** "만료시각.서명" 형태의 쿠키 값을 만듭니다. */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('ADMIN_PASSWORD 가 설정되지 않았습니다.');
  const expiresAt = now + SESSION_MAX_AGE * 1000;
  const signature = await sign(`jzl-admin:${expiresAt}`, secret);
  return `${expiresAt}.${signature}`;
}

/** 쿠키 값이 우리가 발급한 것이고 아직 살아 있는지 확인합니다. */
export async function verifySessionToken(
  token: string | undefined,
  now = Date.now()
): Promise<boolean> {
  const secret = getSecret();
  if (!secret || !token) return false;

  const separator = token.indexOf('.');
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;

  const expected = await sign(`jzl-admin:${expiresAt}`, secret);
  return safeEqual(signature, expected);
}
