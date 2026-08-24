/**
 * 관리자 세션. middleware(Edge 런타임)와 API 라우트(Node 런타임)에서 모두 쓰이므로
 * Node 전용 모듈 대신 Web Crypto 만 사용합니다.
 *
 * ★ 이 파일은 서버에서만 import 하세요. 비밀번호는 절대 클라이언트로 내려가지 않습니다.
 *   쿠키에는 비밀번호가 아니라 서명값만 담깁니다.
 */

export const ADMIN_COOKIE = 'jzl_admin_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일

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
