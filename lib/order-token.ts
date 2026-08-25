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
 * ★★ 옛 키(ADMIN_PASSWORD)로 만든 토큰을 받아 주던 임시 다리는 지웠습니다.
 *   (2026-08-25) ORDER_TOKEN_SECRET 을 넣고 하루가 지나, 옛 키로 서명된
 *   토큰은 전부 만료됐습니다. 토큰 수명이 6시간이라 그 뒤로는 건널 사람이
 *   없습니다. 다리를 남겨 두면 관리자 비밀번호가 계속 "손님 토큰을 열 수 있는
 *   열쇠" 로 남아, 떼어 놓은 의미가 반쯤 사라집니다.
 *
 *   이제 이 파일은 ORDER_TOKEN_SECRET 만 씁니다.
 *   관리자 비밀번호를 바꿔도 손님 주문 토큰은 아무 영향을 받지 않습니다.
 *
 * ★ 키가 없으면 토큰을 발급하지도, 인정하지도 않습니다.
 */

/** 발급 후 이 시간이 지나면 만료됩니다. 주문 직후 한 번 보는 화면이라 짧게 둡니다. */
const TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6시간

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 지금 서명에 쓰는 키.
 *
 * ★★ ORDER_TOKEN_SECRET 이 없을 때만 ADMIN_PASSWORD 로 내려앉습니다.
 *   이건 "환경변수를 깜빡했을 때 손님 결제가 통째로 멈추는" 사고를 막는
 *   안전망입니다. 여기서 아예 null 을 돌려주면 완료 화면이 열리지 않습니다.
 *
 * ★★ 다만 이 길로 내려앉은 상태에서 관리자 비밀번호를 바꾸면,
 *   그때는 예전처럼 손님 토큰이 무효가 됩니다. 그래서 조용히 넘어가지 않고
 *   기록을 남깁니다. 로그에 이 줄이 보이면 ORDER_TOKEN_SECRET 을 넣어야 합니다.
 */
function getSecret(): string | null {
  const current = clean(process.env.ORDER_TOKEN_SECRET);
  if (current) return current;

  const fallback = clean(process.env.ADMIN_PASSWORD);
  if (fallback) {
    console.warn(
      '[order-token] ORDER_TOKEN_SECRET 이 비어 있어 ADMIN_PASSWORD 로 서명합니다. ' +
        '이 상태에서 관리자 비밀번호를 바꾸면 손님 주문 토큰이 무효가 됩니다.'
    );
  }
  return fallback;
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

  return safeEqual(signature, await sign(message, secret));
}
