import 'server-only';

/**
 * 비회원 문의 조회용 비밀번호 해시.
 *
 * ★ 평문으로 저장하지 않습니다.
 *   Web Crypto 의 PBKDF2 만 써서 Edge 런타임에서도 돌아갑니다.
 *   (회원 비밀번호는 Supabase Auth 가 따로 관리합니다. 여기서는 다루지 않습니다)
 *
 * 저장 형식: pbkdf2$<반복횟수>$<salt(hex)>$<hash(hex)>
 */

const ITERATIONS = 120_000;
const KEY_LENGTH = 32; // bytes

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** hex 문자열 → 바이트. WebCrypto 가 요구하는 ArrayBuffer 로 돌려줍니다. */
function fromHex(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

async function derive(
  password: string,
  salt: ArrayBuffer,
  iterations: number
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_LENGTH * 8
  );
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const buffer = salt.buffer as ArrayBuffer;
  const hash = await derive(password, buffer, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(buffer)}$${hash}`;
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

export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  try {
    const hash = await derive(password, fromHex(parts[2]), iterations);
    return safeEqual(hash, parts[3]);
  } catch {
    return false;
  }
}
