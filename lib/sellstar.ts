import 'server-only';

import type { OptionCombination, OptionGroup } from '@/lib/types';

/**
 * 셀스타(sellstar.kr) 상품 가져오기.
 *
 * ★ 반드시 서버에서만 부릅니다.
 *   API 응답 헤더가 Access-Control-Allow-Origin: https://sellstar.kr 로 묶여 있어
 *   브라우저에서 바로 부르면 CORS 로 막힙니다. 서버 라우트가 대신 부릅니다.
 *
 * ★ 인증
 *   이 API 는 Authorization: Bearer <키> 를 요구합니다. (키 없이 부르면 401)
 *   셀스타 프론트가 쓰는 앱 공통 키이며, JZL CLOSET 운영자가 셀스타 운영자이기도 해
 *   사용에 문제가 없습니다. 키가 바뀔 수 있으므로 .env.local 의
 *   SELLSTAR_API_KEY 로 덮어쓸 수 있게 해 두었습니다.
 *
 * ★ 응답이 바뀔 수 있습니다.
 *   필드가 없거나 형태가 달라도 예외로 죽지 않고, 가져온 것만 채운 뒤
 *   무엇을 못 가져왔는지 warnings 로 알려 줍니다.
 */

const API_BASE = 'https://api.i-one.kr/api/front/v1/oneeasy/store/product';

/** 셀스타 프론트가 쓰는 앱 공통 키. 바뀌면 환경변수로 덮어씁니다. */
const DEFAULT_API_KEY = 'H1vR8mP4zL7sQ2kX9nW5tJ6bA0fD3gC5';

function apiKey(): string {
  return process.env.SELLSTAR_API_KEY?.trim() || DEFAULT_API_KEY;
}

/* ------------------------------------------------------------------
 * 주소 · 상품번호
 * ------------------------------------------------------------------ */

/**
 * 입력값에서 셀스타 상품번호를 뽑습니다.
 *   https://sellstar.kr/marquenco/product/188  → 188
 *   188                                        → 188
 * 알아볼 수 없으면 0 을 돌려줍니다.
 */
export function parseSellstarId(input: string): number {
  const text = (input ?? '').trim();
  if (!text) return 0;

  // 숫자만 넣은 경우
  if (/^\d+$/.test(text)) return Number(text);

  // 주소에서 /product/{번호} 를 찾습니다.
  const matched = /\/product\/(\d+)/.exec(text);
  if (matched) return Number(matched[1]);

  // 주소 맨 뒤가 숫자인 경우도 받아 줍니다.
  const tail = /(\d+)\s*$/.exec(text);
  return tail ? Number(tail[1]) : 0;
}

/** 여러 줄 입력 → 상품번호 목록 (중복·빈 줄 제거) */
export function parseSellstarIdList(input: string): number[] {
  const ids = (input ?? '')
    .split(/[\n,]/)
    .map((line) => parseSellstarId(line))
    .filter((id) => id > 0);
  return Array.from(new Set(ids));
}

/* ------------------------------------------------------------------
 * 상세 블록
 * ------------------------------------------------------------------ */

/**
 * content 는 마크다운 이미지가 줄바꿈으로 나열된 문자열입니다.
 *   ![](https://.../a.jpg)
 *   ![](https://.../b.gif)
 * 앞으로 글이 섞여 들어올 수 있어, 이미지가 아닌 줄은 글 블록으로 남깁니다.
 */
export type SellstarBlock =
  | {
      kind: 'image';
      url: string;
      /** 리셀러(마르크앤코) 브랜드 이미지인지 — 기본으로 체크를 해제합니다. */
      reseller: boolean;
      /** 애니메이션이 살아 있어야 하는 파일 */
      gif: boolean;
    }
  | { kind: 'text'; body: string };

const IMAGE_LINE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

/** 셀스타 이미지 경로 규칙 — RESELLER_PRODUCT 는 리셀러 브랜드 이미지입니다. */
export function isResellerImage(url: string): boolean {
  return url.includes('/RESELLER_PRODUCT/');
}

export function isGifUrl(url: string): boolean {
  return /\.gif(\?|#|$)/i.test(url);
}

export function parseContentBlocks(content: string): SellstarBlock[] {
  const blocks: SellstarBlock[] = [];
  const lines = (content ?? '').split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 한 줄에 이미지가 여러 개 있을 수도 있습니다.
    // ★ matchAll 은 이 프로젝트의 컴파일 설정에서 쓸 수 없어 exec 루프로 돕니다.
    const found: string[] = [];
    IMAGE_LINE.lastIndex = 0;
    let match = IMAGE_LINE.exec(line);
    while (match !== null) {
      found.push(match[1]);
      match = IMAGE_LINE.exec(line);
    }

    if (found.length > 0) {
      for (const url of found) {
        blocks.push({
          kind: 'image',
          url,
          reseller: isResellerImage(url),
          gif: isGifUrl(url),
        });
      }
      // 이미지 문법을 걷어 내고 남은 글이 있으면 함께 남깁니다.
      const rest = line.replace(IMAGE_LINE, '').trim();
      if (rest) blocks.push({ kind: 'text', body: rest });
      continue;
    }

    blocks.push({ kind: 'text', body: line });
  }

  return blocks;
}

/* ------------------------------------------------------------------
 * 정규화된 결과
 * ------------------------------------------------------------------ */

export type SellstarImage = {
  url: string;
  width: number;
  height: number;
};

export type SellstarVariant = {
  key: string;
  label: string;
  stock: number | null;
  soldOut: boolean;
  price: number;
};

export type SellstarShipping = {
  baseFee: number;
  extraJeju: number;
  extraIsolated: number;
  returnFee: number;
  exchangeFee: number;
  courier: string;
  cutoffTime: string;
  avgDeliveryDays: number;
  returnGuide: string;
  exchangeGuide: string;
};

export type SellstarProduct = {
  sellstarId: number;
  name: string;
  /** 셀스타 정가 */
  price: number;
  /** 셀스타 판매가 — JZL 판매가의 기본값이 됩니다. */
  salePrice: number;
  status: string;
  storeId: string;
  storeName: string;
  mainImage: SellstarImage | null;
  /** 대표 이미지 후보 (mainImage + images) */
  gallery: SellstarImage[];
  /** 상세페이지 구성 */
  blocks: SellstarBlock[];
  optionGroups: OptionGroup[];
  variants: SellstarVariant[];
  shipping: SellstarShipping | null;
  /** 가져오지 못한 항목 안내 */
  warnings: string[];
};

export class SellstarError extends Error {}

/* ── 안전한 형변환 ─────────────────────────────────────────── */

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function arr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function toImage(value: unknown): SellstarImage | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const url = str(raw.path);
  if (!url) return null;
  return { url, width: num(raw.width), height: num(raw.height) };
}

/* ------------------------------------------------------------------
 * 가져오기
 * ------------------------------------------------------------------ */

export async function fetchSellstarProduct(id: number): Promise<SellstarProduct> {
  if (!id || id <= 0) throw new SellstarError('상품번호를 확인해 주세요.');

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${id}`, {
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: 'application/json',
      },
      // 가져오기는 항상 최신 값을 봐야 합니다.
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new SellstarError(
      `셀스타에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요. (${
        error instanceof Error ? error.message : '네트워크 오류'
      })`
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new SellstarError(
      '셀스타 API 인증에 실패했습니다(401). 키가 바뀐 것 같습니다. ' +
        '.env.local 의 SELLSTAR_API_KEY 를 최신 값으로 채운 뒤 다시 시도해 주세요.'
    );
  }
  if (!response.ok) {
    throw new SellstarError(`셀스타 응답 오류입니다. (HTTP ${response.status})`);
  }

  let payload: { code?: number; message?: string; result?: unknown };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new SellstarError('셀스타 응답을 읽지 못했습니다. (JSON 형식이 아닙니다)');
  }

  if (payload.code !== 200 || !payload.result) {
    throw new SellstarError(
      `셀스타에서 상품을 찾지 못했습니다. (${payload.code ?? '응답 없음'} ${
        payload.message ?? ''
      })`.trim()
    );
  }

  return normalize(id, payload.result as Record<string, unknown>);
}

/** 응답 → 우리 구조. 없는 값은 건너뛰고 warnings 에 남깁니다. */
function normalize(id: number, result: Record<string, unknown>): SellstarProduct {
  const warnings: string[] = [];

  const name = str(result.name);
  if (!name) warnings.push('상품명을 가져오지 못했습니다. 직접 입력해 주세요.');

  const salePrice = num(result.salePrice);
  const price = num(result.price);
  if (!salePrice && !price) {
    warnings.push('가격을 가져오지 못했습니다. 직접 입력해 주세요.');
  }

  /* ── 대표 이미지 ─────────────────────────────────────── */
  const mainImage = toImage(result.mainImage);
  const gallery: SellstarImage[] = [];
  if (mainImage) gallery.push(mainImage);
  for (const item of arr(result.images)) {
    const image = toImage(item);
    // mainImage 가 images 에도 들어 있는 경우가 있어 주소로 걸러 냅니다.
    if (image && !gallery.some((existing) => existing.url === image.url)) {
      gallery.push(image);
    }
  }
  if (gallery.length === 0) {
    warnings.push('대표 이미지를 가져오지 못했습니다. 직접 올려 주세요.');
  }

  /* ── 상세 구성 ───────────────────────────────────────── */
  // detailImages 가 채워져 오면 그것도 함께 씁니다. (지금은 비어 있습니다)
  const detailFromArray = arr(result.detailImages)
    .map(toImage)
    .filter((image): image is SellstarImage => image !== null)
    .map<SellstarBlock>((image) => ({
      kind: 'image',
      url: image.url,
      reseller: isResellerImage(image.url),
      gif: isGifUrl(image.url),
    }));

  const blocks = [...detailFromArray, ...parseContentBlocks(str(result.content))];
  if (blocks.length === 0) {
    warnings.push('상세 이미지를 가져오지 못했습니다. 직접 구성해 주세요.');
  }

  /* ── 옵션 ────────────────────────────────────────────── */
  const groups: OptionGroup[] = arr(result.optionGroups)
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))
    .map((group) => ({
      name: str(group.groupName),
      values: arr(group.optionValues)
        .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))
        .map((value) => str(value.valueName))
        .filter(Boolean),
    }))
    .filter((group) => group.name && group.values.length > 0);

  /* ── 조합·재고 ───────────────────────────────────────── */
  // 옵션 조합 이름은 우리 규칙(슬래시)으로 다시 만듭니다.
  // 셀스타의 "화이트 / XS" 에는 공백이 섞여 있어 그대로 쓰면 어긋납니다.
  const variants: SellstarVariant[] = arr(result.variants).map((variant) => {
    const parts = arr(variant.variantOptions).map((option) => str(option.valueName));
    const key = parts.length > 0 ? parts.join('/') : str(variant.optionLabel).replace(/\s*\/\s*/g, '/');
    const active = str(variant.status, 'ACTIVE') === 'ACTIVE';
    const stock = num(variant.availableStock, 0);
    return {
      key,
      label: str(variant.optionLabel, key),
      stock,
      // ACTIVE 가 아니거나 재고가 없으면 품절로 봅니다.
      soldOut: !active || stock <= 0,
      price: salePrice,
    };
  });

  if (str(result.hasOptions) === 'Y' && groups.length === 0) {
    warnings.push('옵션 정보를 가져오지 못했습니다. 직접 입력해 주세요.');
  }

  /* ── 배송 ────────────────────────────────────────────── */
  const rawShipping = result.shipping;
  const shipping: SellstarShipping | null =
    rawShipping && typeof rawShipping === 'object'
      ? (() => {
          const raw = rawShipping as Record<string, unknown>;
          return {
            baseFee: num(raw.baseFee),
            extraJeju: num(raw.extraJeju),
            extraIsolated: num(raw.extraIsolated),
            returnFee: num(raw.returnShippingFee),
            exchangeFee: num(raw.exchangeShippingFee),
            courier: str(raw.defaultCourier),
            cutoffTime: str(raw.cutoffTime),
            avgDeliveryDays: num(raw.avgDeliveryDays),
            returnGuide: str(raw.returnGuide).trim(),
            exchangeGuide: str(raw.exchangeGuide).trim(),
          };
        })()
      : null;
  if (!shipping) warnings.push('배송 정보를 가져오지 못했습니다.');

  const store = (result.store ?? {}) as Record<string, unknown>;

  return {
    sellstarId: num(result.id, id),
    name,
    price,
    salePrice,
    status: str(result.status, 'UNKNOWN'),
    storeId: str(store.storeId),
    storeName: str(store.storeName),
    mainImage,
    gallery,
    blocks,
    optionGroups: groups,
    variants,
    shipping,
    warnings,
  };
}

/**
 * 조합 목록을 우리 상품 구조로 바꿉니다.
 * ★ 재고를 관리하지 않는 조합은 stock 을 null 로 둡니다. (기존 규칙)
 */
export function toCombinations(variants: SellstarVariant[]): OptionCombination[] {
  return variants.map((variant) => ({
    key: variant.key,
    extraPrice: 0,
    stock: variant.stock,
    // 품절이면 이 조합만 꺼 둡니다.
    isActive: !variant.soldOut,
  }));
}

/** 마진 계산 보조 — 100원 단위로 올림하지 않고 반올림합니다. */
export function withMargin(basePrice: number, percent: number): number {
  if (basePrice <= 0) return 0;
  return Math.round((basePrice * (100 + percent)) / 100 / 100) * 100;
}
