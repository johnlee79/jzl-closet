import 'server-only';

import { unstable_cache } from 'next/cache';
import { DEFAULT_COPY } from '@/lib/default-copy';
import {
  COPY_KEYS,
  DEFAULT_ANALYTICS,
  DEFAULT_BANNER_INTERVAL,
  DEFAULT_DESIGN,
  DEFAULT_SHIPPING,
  DEFAULT_STORE,
  MAX_BANNERS,
  MAX_BANNER_INTERVAL,
  MIN_BANNER_INTERVAL,
  type AnalyticsSettings,
  type Banner,
  type CopyBlock,
  type CopyKey,
  type CopySection,
  type CopySettings,
  type DesignSettings,
  type ShippingSettings,
  type StoreSettings,
} from '@/lib/site-config';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';
import type { Branding, BrandingIcon } from '@/lib/types';

/**
 * 사이트 전역 설정. supabase/settings.sql 의 site_settings 테이블을 씁니다.
 *
 * ★ 설정이 없거나 테이블이 아직 없어도 절대 오류를 내지 않습니다.
 *   읽기는 항상 기본값으로 조용히 넘어가고, 저장할 때만 안내 메시지를 띄웁니다.
 */

const TABLE = 'site_settings';

/** 파비콘을 바꾸면 이 태그를 무효화해 모든 페이지의 <head> 를 다시 굽습니다. */
export const SETTINGS_TAG = 'site-settings';

export const BRANDING_KEY = 'branding';

/** 아직 아무것도 올리지 않았을 때 쓰는 기본 파비콘 (public/ 에 들어 있습니다) */
export const DEFAULT_BRANDING: Branding = {
  favicon: { url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
  appleTouchIcon: { url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
  logo: null,
  source: null,
  keys: [],
  updatedAt: null,
};

/* ── 1-B 에서 새로 쓰는 설정 key ──────────────────────────── */
export const STORE_KEY = 'store';
export const SHIPPING_KEY = 'shipping';
export const DESIGN_KEY = 'design';
export const COPY_KEY = 'copy';
export const ANALYTICS_KEY = 'analytics';

/** 테이블이 아직 없을 때 PostgREST 가 돌려주는 코드들 */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

/* ------------------------------------------------------------------
 * 읽기
 * ------------------------------------------------------------------ */

async function readSetting(key: string): Promise<unknown> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      // 테이블을 아직 만들지 않았다면 기본값으로 갑니다. (설치 전에도 사이트가 떠야 합니다)
      if (!isMissingTable(error.code)) {
        console.warn(`[settings] '${key}' 를 읽지 못했습니다:`, error.message);
      }
      return null;
    }
    return (data as { value?: unknown } | null)?.value ?? null;
  } catch (error) {
    console.warn(`[settings] '${key}' 를 읽지 못했습니다:`, error);
    return null;
  }
}

function normalizeIcon(value: unknown, fallbackSizes: string): BrandingIcon | null {
  if (!value || typeof value !== 'object') return null;
  const icon = value as Record<string, unknown>;
  const url = typeof icon.url === 'string' ? icon.url.trim() : '';
  if (!url) return null;
  return {
    url,
    type: typeof icon.type === 'string' && icon.type ? icon.type : 'image/png',
    sizes: typeof icon.sizes === 'string' && icon.sizes ? icon.sizes : fallbackSizes,
  };
}

export function normalizeBranding(value: unknown): Branding {
  if (!value || typeof value !== 'object') return DEFAULT_BRANDING;
  const raw = value as Record<string, unknown>;

  const favicon = normalizeIcon(raw.favicon, '32x32');
  const appleTouchIcon = normalizeIcon(raw.appleTouchIcon, '180x180');

  const logoUrl =
    raw.logo && typeof raw.logo === 'object'
      ? String((raw.logo as { url?: unknown }).url ?? '').trim()
      : '';
  const logo = logoUrl ? { url: logoUrl } : null;

  // 파비콘이 비어 있으면 파비콘만 기본값으로 돌립니다. (로고는 그대로 둡니다)
  if (!favicon) return { ...DEFAULT_BRANDING, logo };

  const source =
    raw.source && typeof raw.source === 'object'
      ? (() => {
          const item = raw.source as Record<string, unknown>;
          const url = typeof item.url === 'string' ? item.url : '';
          if (!url) return null;
          return {
            url,
            type: typeof item.type === 'string' ? item.type : '',
            name: typeof item.name === 'string' ? item.name : '',
          };
        })()
      : null;

  return {
    favicon,
    appleTouchIcon: appleTouchIcon ?? DEFAULT_BRANDING.appleTouchIcon,
    logo,
    source,
    keys: Array.isArray(raw.keys)
      ? raw.keys.filter((key): key is string => typeof key === 'string')
      : [],
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/** 관리자 화면용 — 항상 DB 를 직접 봅니다. */
export async function getBranding(): Promise<Branding> {
  return normalizeBranding(await readSetting(BRANDING_KEY));
}

/**
 * 프론트(루트 레이아웃)용 — 페이지마다 DB 를 두드리지 않도록 캐시합니다.
 * 파비콘을 바꾸면 revalidateTag(SETTINGS_TAG) 로 즉시 갈아 끼웁니다.
 */
export const getCachedBranding = unstable_cache(getBranding, ['branding'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

/** 사용자 지정 파비콘이 올라와 있는지 (기본값을 쓰는 중이면 false) */
export function hasCustomFavicon(branding: Branding): boolean {
  return branding.favicon?.url !== DEFAULT_BRANDING.favicon?.url;
}

/* ------------------------------------------------------------------
 * 쓰기 — 저장 실패는 관리자에게 그대로 알립니다.
 * ------------------------------------------------------------------ */

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    if (isMissingTable(error.code)) {
      throw new Error(
        'site_settings 테이블이 없습니다. supabase/settings.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
      );
    }
    throw new Error(`설정을 저장하지 못했습니다: ${error.message}`);
  }
}

export async function deleteSetting(key: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(TABLE).delete().eq('key', key);
  if (error && !isMissingTable(error.code)) {
    throw new Error(`설정을 지우지 못했습니다: ${error.message}`);
  }
}

/* ==================================================================
 * 1-B — 스토어 정보 · 배송 · 디자인 · 문구 · GA4
 *
 * 읽기는 어떤 경우에도 오류를 내지 않습니다. 값이 없거나 형태가 깨져 있으면
 * lib/site-config.ts · lib/default-copy.ts 의 기본값으로 조용히 넘어갑니다.
 * ================================================================== */

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/** 문자열을 그대로 (빈 문자열도 허용). 입력하지 않은 항목을 비워 둘 수 있게 합니다. */
function optionalText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function count(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter((item): item is string => typeof item === 'string');
  return list.length > 0 ? list : fallback;
}

/* ── 스토어 정보 ──────────────────────────────────────────── */

export function normalizeStore(value: unknown): StoreSettings {
  if (!value || typeof value !== 'object') return DEFAULT_STORE;
  const raw = value as Record<string, unknown>;
  const business = (raw.business ?? {}) as Record<string, unknown>;

  return {
    name: text(raw.name, DEFAULT_STORE.name),
    nameKo: text(raw.nameKo, DEFAULT_STORE.nameKo),
    slogan: text(raw.slogan, DEFAULT_STORE.slogan),
    intro: text(raw.intro, DEFAULT_STORE.intro),
    story: stringList(raw.story, DEFAULT_STORE.story),
    category: text(raw.category, DEFAULT_STORE.category),
    phone: text(raw.phone, DEFAULT_STORE.phone),
    kakao: optionalText(raw.kakao, DEFAULT_STORE.kakao),
    email: optionalText(raw.email, DEFAULT_STORE.email),
    hours: text(raw.hours, DEFAULT_STORE.hours),
    business: {
      company: text(business.company, DEFAULT_STORE.business.company),
      ceo: text(business.ceo, DEFAULT_STORE.business.ceo),
      regNumber: text(business.regNumber, DEFAULT_STORE.business.regNumber),
      mailOrder: text(business.mailOrder, DEFAULT_STORE.business.mailOrder),
      address: text(business.address, DEFAULT_STORE.business.address),
    },
  };
}

export async function getStoreSettings(): Promise<StoreSettings> {
  return normalizeStore(await readSetting(STORE_KEY));
}

export const getCachedStore = unstable_cache(getStoreSettings, ['store'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

/* ── 배송·반품 ────────────────────────────────────────────── */

export function normalizeShipping(value: unknown): ShippingSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SHIPPING;
  const raw = value as Record<string, unknown>;
  return {
    baseFee: count(raw.baseFee, DEFAULT_SHIPPING.baseFee),
    freeThreshold: count(raw.freeThreshold, DEFAULT_SHIPPING.freeThreshold),
    islandFee: count(raw.islandFee, DEFAULT_SHIPPING.islandFee),
    returnAddress: optionalText(raw.returnAddress, DEFAULT_SHIPPING.returnAddress),
    leadTime: optionalText(raw.leadTime, DEFAULT_SHIPPING.leadTime),
  };
}

export async function getShippingSettings(): Promise<ShippingSettings> {
  return normalizeShipping(await readSetting(SHIPPING_KEY));
}

export const getCachedShipping = unstable_cache(getShippingSettings, ['shipping'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

/* ── 메인 배너 ────────────────────────────────────────────── */

function normalizeBanner(value: unknown, index: number): Banner | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const imageUrl = optionalText(raw.imageUrl, '').trim();
  const title = optionalText(raw.title, '').trim();
  // 이미지도 제목도 없는 배너는 없는 것으로 봅니다.
  if (!imageUrl && !title) return null;

  return {
    id: text(raw.id, `banner-${index + 1}`),
    imageUrl,
    mobileImageUrl: optionalText(raw.mobileImageUrl, '').trim(),
    title,
    subtitle: optionalText(raw.subtitle, '').trim(),
    buttonText: optionalText(raw.buttonText, '').trim(),
    link: optionalText(raw.link, '').trim(),
    isVisible: raw.isVisible !== false,
  };
}

export function normalizeDesign(value: unknown): DesignSettings {
  if (!value || typeof value !== 'object') return DEFAULT_DESIGN;
  const raw = value as Record<string, unknown>;

  const banners = Array.isArray(raw.banners)
    ? raw.banners
        .map((item, index) => normalizeBanner(item, index))
        .filter((item): item is Banner => item !== null)
        .slice(0, MAX_BANNERS)
    : [];

  const interval = count(raw.interval, DEFAULT_BANNER_INTERVAL);
  return {
    banners,
    interval: Math.min(MAX_BANNER_INTERVAL, Math.max(MIN_BANNER_INTERVAL, interval)),
  };
}

export async function getDesignSettings(): Promise<DesignSettings> {
  return normalizeDesign(await readSetting(DESIGN_KEY));
}

export const getCachedDesign = unstable_cache(getDesignSettings, ['design'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

/* ── 사이트 문구 ──────────────────────────────────────────── */

function normalizeSection(value: unknown, fallback: CopySection): CopySection {
  if (!Array.isArray(value)) return fallback;
  const blocks: CopyBlock[] = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      heading: optionalText(item.heading, '').trim(),
      body: optionalText(item.body, ''),
    }))
    .filter((block) => block.heading || block.body.trim());
  // 통째로 비워 둔 항목은 저장 자체를 막지만, 혹시 비어 있으면 기본값을 씁니다.
  return blocks.length > 0 ? blocks : fallback;
}

export function normalizeCopy(value: unknown): CopySettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const result = {} as CopySettings;
  for (const key of COPY_KEYS) {
    result[key] = normalizeSection(raw[key], DEFAULT_COPY[key]);
  }
  return result;
}

export async function getCopySettings(): Promise<CopySettings> {
  return normalizeCopy(await readSetting(COPY_KEY));
}

export const getCachedCopy = unstable_cache(getCopySettings, ['copy'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

/** 항목 하나만 필요한 페이지용 */
export async function getCopySection(key: CopyKey): Promise<CopySection> {
  return (await getCachedCopy())[key];
}

/* ── GA4 ──────────────────────────────────────────────────── */

export function normalizeAnalytics(value: unknown): AnalyticsSettings {
  if (!value || typeof value !== 'object') return DEFAULT_ANALYTICS;
  const raw = value as Record<string, unknown>;
  return { ga4Id: optionalText(raw.ga4Id, '').trim() };
}

export async function getAnalyticsSettings(): Promise<AnalyticsSettings> {
  return normalizeAnalytics(await readSetting(ANALYTICS_KEY));
}

export const getCachedAnalytics = unstable_cache(getAnalyticsSettings, ['analytics'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});
