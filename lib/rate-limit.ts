import 'server-only';

/**
 * 아주 단순한 요청 제한.
 *
 * 주문 조회는 "주문번호 + 연락처" 조합만 맞으면 열립니다.
 * 번호를 하나씩 바꿔가며 계속 두드리는 시도를 막기 위해
 * 같은 IP 가 짧은 시간에 여러 번 시도하면 잠시 거절합니다.
 *
 * ★ 서버 메모리에만 담습니다.
 *   서버가 여러 대로 늘어나거나 재시작하면 초기화됩니다.
 *   그래도 자동화된 무차별 조회를 늦추는 데는 충분합니다.
 *   더 엄격하게 막아야 할 때는 Upstash 같은 외부 저장소로 옮기세요.
 */

type Bucket = {
  count: number;
  /** 이 시각이 지나면 카운트를 0 으로 되돌립니다. */
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

/** 메모리가 계속 늘지 않도록 가끔 지나간 항목을 지웁니다. */
function sweep(now: number): void {
  if (buckets.size < 500) return;
  // tsconfig 의 target 이 낮아 Map 을 바로 순회할 수 없으므로 키만 모아 돕니다.
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) buckets.delete(key);
  });
}

export type RateLimitResult = {
  ok: boolean;
  /** 남은 시도 횟수 */
  remaining: number;
  /** 다시 시도할 수 있을 때까지 남은 초 */
  retryAfter: number;
};

/**
 * @param key      제한 단위 (보통 "용도:IP")
 * @param limit    창 안에서 허용할 횟수
 * @param windowMs 창 길이 (밀리초)
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/**
 * 요청 헤더에서 손님의 IP 를 뽑습니다.
 * Vercel 은 x-forwarded-for 에 실제 IP 를 넣어 줍니다.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
