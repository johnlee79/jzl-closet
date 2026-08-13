/**
 * 관리자 세션. middleware(Edge 런타임)와 API 라우트(Node 런타임)에서 모두 쓰이므로
 * Node 전용 모듈 대신 Web Crypto 만 사용합니다.
 *
 * ★ 이 파일은 서버에서만 import 하세요. 비밀번호는 절대 클라이언트로 내려가지 않습니다.
 *   쿠키에는 비밀번호가 아니라 서명값만 담깁니다.
 */

export const ADMIN_COOKIE = 'jzl_admin_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일

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
