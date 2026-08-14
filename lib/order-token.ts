import 'server-only';

/**
 * 주문 완료 화면 접근 토큰.
 *
 * 왜 필요한가
 *   주문 완료 화면에는 입금 계좌와 주문 내역이 나옵니다.
 *   /checkout/complete?no=ORD-20260814-0001 처럼 주문번호만으로 열 수 있으면
 *   번호를 하나씩 바꿔가며 남의 주문을 들여다볼 수 있습니다.
 *   그래서 주문을 만든 직후에만 발급되는 서명값을 함께 넘깁니다.
 *
 * 서명 키는 ADMIN_PASSWORD 를 씁니다. (쿠키 서명과 같은 방식)
 * 키가 없으면 토큰을 발급하지도, 인정하지도 않습니다.
 */

/** 발급 후 이 시간이 지나면 만료됩니다. 주문 직후 한 번 보는 화면이라 짧게 둡니다. */
const TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6시간

function getSecret(): string | null {
  const secret = process.env.ADMIN_PASSWORD;
  return secret && secret.length > 0 ? secret : null;
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
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
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

/** "만료시각.서명" 형태의 토큰을 만듭니다. */
export async function createOrderToken(
  orderNo: string,
  now = Date.now()
): Promise<string> {
  const secret = getSecret();
  if (!secret) return '';
  const expiresAt = now + TOKEN_MAX_AGE_MS;
  const signature = await sign(`order:${orderNo}:${expiresAt}`, secret);
  return `${expiresAt}.${signature}`;
}

/** 토큰이 우리가 발급한 것이고 아직 살아 있는지 확인합니다. */
export async function verifyOrderToken(
  orderNo: string,
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

  const expected = await sign(`order:${orderNo}:${expiresAt}`, secret);
  return safeEqual(signature, expected);
}
