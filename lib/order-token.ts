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
 * ============================================================
 * 서명 키 — ORDER_TOKEN_SECRET
 * ============================================================
 *
 * ★★ 예전에는 ADMIN_PASSWORD 를 서명 키로 썼습니다. 그게 문제였습니다.
 *   관리자 비밀번호를 바꾸는 순간, 그때까지 발급된 손님 주문 토큰이
 *   전부 무효가 됩니다. 결제를 막 끝낸 손님이 완료 화면을 못 열고,
 *   결제창에서 돌아오는 길도 막힙니다. 최대 6시간짜리 여파입니다.
 *
 *   관리자 비밀번호를 바꾸는 일이 손님 결제를 건드리면 안 됩니다.
 *   그래서 손님용 서명 키를 따로 뗐습니다.
 *
 * ★★ 두 방향 모두 끊기지 않게 만들었습니다.
 *
 *   1) ORDER_TOKEN_SECRET 을 아직 안 넣었으면 ADMIN_PASSWORD 로 서명합니다.
 *      → 배포만 먼저 해도 지금과 똑같이 동작합니다.
 *
 *   2) ORDER_TOKEN_SECRET 을 넣은 뒤에는 새 키로 서명하되,
 *      옛 키(ADMIN_PASSWORD)로 만든 토큰도 확인만은 받아 줍니다.
 *      → 키를 바꾸는 순간에도 이미 결제를 끝낸 손님이 안 막힙니다.
 *
 *   옛 키를 받아 주는 부분은 4단계에서 지웁니다.
 *   토큰 수명이 6시간이라, 키를 바꾸고 하루만 지나면 필요 없어집니다.
 *
 * ★ 키가 하나도 없으면 토큰을 발급하지도, 인정하지도 않습니다.
 */

/** 발급 후 이 시간이 지나면 만료됩니다. 주문 직후 한 번 보는 화면이라 짧게 둡니다. */
const TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6시간

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 지금 서명에 쓰는 키. 새 키가 있으면 새 키, 없으면 옛 키입니다. */
function getSecret(): string | null {
  return clean(process.env.ORDER_TOKEN_SECRET) ?? clean(process.env.ADMIN_PASSWORD);
}

/**
 * 확인만 받아 주는 옛 키.
 *
 * ★ 지금 쓰는 키와 같으면 돌려주지 않습니다. 같은 걸 두 번 볼 이유가 없습니다.
 * ★ 4단계에서 이 함수와 아래 쓰는 자리를 함께 지웁니다.
 */
function getLegacySecret(): string | null {
  const current = getSecret();
  const legacy = clean(process.env.ADMIN_PASSWORD);
  if (!legacy || legacy === current) return null;
  return legacy;
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

  const message = `order:${orderNo}:${expiresAt}`;

  if (safeEqual(signature, await sign(message, secret))) return true;

  /*
   * ★ 옛 키로 만든 토큰도 받아 줍니다. (4단계에서 지웁니다)
   *   서명 키를 바꾼 직후, 이미 결제를 끝낸 손님의 완료 화면이 막히면 안 됩니다.
   *   토큰 수명이 6시간이라 하루만 지나면 이 길로 오는 사람이 없어집니다.
   *
   * ★ 만료 검사는 위에서 이미 끝났습니다. 옛 키라고 더 오래 살지 않습니다.
   */
  const legacy = getLegacySecret();
  if (legacy && safeEqual(signature, await sign(message, legacy))) {
    console.warn(
      '[order-token] 옛 서명 키로 만든 토큰을 받았습니다. 6시간 안에 발급된 것입니다.'
    );
    return true;
  }

  return false;
}
