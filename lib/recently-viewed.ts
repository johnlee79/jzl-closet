import type { Product } from '@/lib/types';

/**
 * ============================================================
 * 최근 본 상품 — 브라우저에만 남깁니다 (3-H C-1)
 * ============================================================
 *
 * ★ DB 에 저장하지 않습니다. 일부러 그렇게 했습니다.
 *   1) 비회원도 그대로 동작해야 합니다. 손님의 대부분은 로그인하지 않습니다.
 *   2) 상품을 열 때마다 쓰기가 한 번씩 붙으면 조회 부담만 늘어납니다.
 *      "아까 그거" 를 다시 찾게 해 주는 편의 기능이라 그만한 값을 치를 일이 아닙니다.
 *   3) 기기가 바뀌면 기록이 따라가지 않지만, 그건 이 기능의 손실로 받아들입니다.
 *
 * ★ 그래서 화면에 그릴 값(이름·가격·썸네일)까지 함께 담아 둡니다.
 *   slug 만 담으면 그릴 때 DB 를 다시 봐야 해서 위 2)가 무너집니다.
 *   대신 가격이 바뀌어도 기록은 옛 값을 들고 있습니다. 그 상품을 다시 열면
 *   그때 최신 값으로 덮어써집니다. 눌러 들어간 상세 화면의 값이 언제나 진짜입니다.
 *
 * ★ 이 파일은 브라우저에서만 부릅니다. 서버에서 부르면 조용히 빈 배열을 돌려줍니다.
 *   (localStorage 가 없는 곳에서 터지지 않게)
 */

/** 저장 열쇠. 바꾸면 기존 손님의 기록이 통째로 사라집니다. */
const KEY = 'jzl-recently-viewed';

/** 최대 보관 개수. 넘치면 오래된 것부터 밀어냅니다. */
export const MAX_RECENT = 20;

/** 다른 곳에서도 목록이 바뀐 걸 알 수 있게 띄우는 신호. */
export const RECENT_CHANGED = 'jzl-recently-viewed-changed';

export type RecentItem = {
  slug: string;
  name: string;
  price: number;
  originalPrice: number | null;
  /** 대표 이미지 한 장. 없으면 빈 문자열 — 화면에서 대체 상자를 그립니다. */
  thumbnail: string;
  brandSlug: string | null;
  /** 본 시각(ms). 정렬과 중복 처리에 씁니다. */
  viewedAt: number;
};

/** 저장된 값이 우리가 아는 모양인지. 손으로 고쳤거나 옛 버전일 수 있습니다. */
function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.slug === 'string' && item.slug.length > 0 &&
    typeof item.name === 'string' &&
    typeof item.price === 'number';
}

/**
 * 기록 읽기. 최근 본 것이 앞입니다.
 *
 * ★ 어떤 이유로든 읽기가 실패하면 빈 배열입니다. 여기서 예외를 던지면
 *   최근 본 상품 하나 때문에 그 페이지 전체가 하얗게 됩니다.
 *   (사파리 시크릿 모드처럼 localStorage 접근 자체가 막히는 경우가 있습니다)
 */
export function readRecent(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecentItem)
      .map((item) => ({
        ...item,
        originalPrice: typeof item.originalPrice === 'number' ? item.originalPrice : null,
        thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : '',
        brandSlug: typeof item.brandSlug === 'string' ? item.brandSlug : null,
        viewedAt: typeof item.viewedAt === 'number' ? item.viewedAt : 0,
      }))
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** 목록을 그대로 저장하고, 같은 탭의 다른 화면에도 바뀐 것을 알립니다. */
function writeRecent(items: RecentItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    // 저장 공간이 꽉 찼거나 막혀 있으면 조용히 넘어갑니다.
  }
  // ★ storage 이벤트는 '다른 탭' 에서만 옵니다. 같은 탭은 우리가 직접 알려야
  //   장바구니 화면의 최근 본 목록이 그 자리에서 갱신됩니다.
  window.dispatchEvent(new Event(RECENT_CHANGED));
}

/**
 * 상품 하나를 기록합니다.
 *
 * ★ 이미 있던 상품이면 지우고 맨 앞에 다시 넣습니다. 두 줄로 늘어나지 않습니다.
 * ★ 20개를 넘으면 뒤에서 잘립니다.
 */
export function pushRecent(product: Product, now: number): void {
  const entry: RecentItem = {
    slug: product.slug,
    name: product.name,
    price: product.price,
    originalPrice: product.originalPrice,
    thumbnail: product.thumbnails[0] ?? '',
    brandSlug: product.brandSlug,
    viewedAt: now,
  };
  const rest = readRecent().filter((item) => item.slug !== product.slug);
  writeRecent([entry, ...rest]);
}

/** 한 줄만 지웁니다. */
export function removeRecent(slug: string): void {
  writeRecent(readRecent().filter((item) => item.slug !== slug));
}

/** 전부 지웁니다. */
export function clearRecent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 위와 같은 이유로 조용히 넘어갑니다.
  }
  window.dispatchEvent(new Event(RECENT_CHANGED));
}
