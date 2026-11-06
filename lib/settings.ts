import 'server-only';

import { unstable_cache } from 'next/cache';
import { DEFAULT_COPY } from '@/lib/default-copy';
import {
  COPY_KEYS,
  DEFAULT_ANALYTICS,
  DEFAULT_BANNER_INTERVAL,
  DEFAULT_DESIGN,
  DEFAULT_PAYMENT,
  DEFAULT_POINTS,
  DEFAULT_EVENT,
  DEFAULT_HERO_BUTTONS,
  DEFAULT_MAIN_SECTIONS,
  DEFAULT_IMPORT,
  DEFAULT_PAYMENT_METHOD_FLAGS,
  PAYMENT_METHODS,
  DEFAULT_REFERRAL,
  DEFAULT_REMOTE_AREA_RULES,
  DEFAULT_REVIEW,
  DEFAULT_REVIEW_TAGS,
  DEFAULT_SALES,
  DEFAULT_SHIPPING,
  DEFAULT_SNS,
  DEFAULT_STORE,
  MAX_BANNERS,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SNS_ITEMS,
  MAX_BANNER_INTERVAL,
  MIN_BANNER_INTERVAL,
  type AboutPageSettings,
  type AnalyticsSettings,
  type Banner,
  type CopyBlock,
  type CopyKey,
  type CopySection,
  type CopySettings,
  type DesignSettings,
  type EventSettings,
  type HeroButtonsSettings,
  type ImportBlock,
  type ImportSettings,
  type ImportTemplate,
  type MainSections,
  type PaymentSettings,
  type PointRule,
  type PointSettings,
  type ReferralSettings,
  type ReviewSettings,
  type RibbonSettings,
  type SalesSettings,
  type ShippingSettings,
  type SnsKey,
  type SnsSettings,
  type StoreSettings,
} from '@/lib/site-config';
import { DEFAULT_OG_IMAGE } from '@/lib/store';
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
/** ★ 입금 계좌가 들어 있는 key. 공개 읽기 정책에서 제외되어 있습니다. (supabase/rls-2a.sql) */
export const PAYMENT_KEY = 'payment';
/* ── 3-A ─────────────────────────────────────────────────── */
export const REVIEW_KEY = 'review';
export const POINTS_KEY = 'points';
export const SALES_KEY = 'sales';
export const EVENT_KEY = 'event';
export const IMPORT_KEY = 'import';
export const REFERRAL_KEY = 'referral';
/* ── 3-G ─────────────────────────────────────────────────── */
export const SNS_KEY = 'sns';

/** 테이블이 아직 없을 때 PostgREST 가 돌려주는 코드들 */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

/* ------------------------------------------------------------------
 * 읽기
 * ------------------------------------------------------------------ */

/**
 * 진짜 읽기 실패 (연결 끊김 · 시간 초과 · 권한 등). 「테이블 없음」 · 「저장된 적 없음」 은 아닙니다.
 * 캐시 함수 안에서 이 오류를 던져야 unstable_cache 가 빈 값을 저장하지 않습니다 (아래 cachedSetting).
 */
class SettingReadError extends Error {
  constructor(detail: string) {
    // 관리자 저장 액션이 그대로 화면에 보여 줍니다 (readSettingForUpdate).
    super(`설정을 읽지 못해 저장하지 않았습니다. 잠시 후 다시 시도해 주세요. (${detail})`);
  }
}

/**
 * 설정 한 줄 읽기 — 실패하면 던집니다.
 *   · Supabase 연결 정보가 없음 / 테이블이 아직 없음 / 그 키가 저장된 적 없음 → null (정상, 기본값)
 *   · 그 밖의 오류 → 로그를 남기고 SettingReadError
 */
async function readSettingOrThrow(key: string): Promise<unknown> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let data: unknown = null;
  let error: { code?: string; message: string } | null = null;
  try {
    ({ data, error } = await supabase.from(TABLE).select('value').eq('key', key).maybeSingle());
  } catch (thrown) {
    console.warn(`[settings] '${key}' 를 읽지 못했습니다:`, thrown);
    throw new SettingReadError(`'${key}' 읽기 실패`);
  }

  if (error) {
    // 테이블을 아직 만들지 않았다면 기본값으로 갑니다. (설치 전에도 사이트가 떠야 합니다)
    if (isMissingTable(error.code)) return null;
    console.warn(`[settings] '${key}' 를 읽지 못했습니다:`, error.message);
    throw new SettingReadError(`'${key}' 읽기 실패: ${error.message}`);
  }
  return (data as { value?: unknown } | null)?.value ?? null;
}

/**
 * 관리자 저장용 — 「지금 값 읽고 일부만 바꿔 다시 쓰기」 하는 곳은 이걸 씁니다 (2026-11-05).
 * ★ 읽기에 실패했는데 기본값으로 이어 가면, 섹션 스위치 하나 저장하다가 배너 목록이
 *   통째로 빈 값으로 덮입니다. 실패하면 던져서 저장 자체를 멈춥니다.
 */
export async function readSettingForUpdate(key: string): Promise<unknown> {
  return readSettingOrThrow(key);
}

/** 관리자 화면 · 캐시 없는 곳용 — 실패하면 (로그만 남기고) null → 기본값. 예전 동작 그대로. */
async function readSetting(key: string): Promise<unknown> {
  try {
    return await readSettingOrThrow(key);
  } catch {
    return null;
  }
}

/**
 * 손님 화면용 캐시 설정 (2026-11-05).
 *
 * ★ 왜 이렇게 바꿨나
 *   예전엔 DB 읽기가 한 번 실패하면 readSetting 이 null → 기본값(배너 없음)을 돌려주고,
 *   unstable_cache 가 그 빈 값을 1시간 동안 저장했습니다. 홈 배너가 사라졌다가
 *   관리자 [저장](= revalidateTag) 을 눌러야 돌아온 일이 그것입니다.
 * ★ 지금은 캐시 안에서 실패하면 던집니다. unstable_cache 는 던진 결과를 저장하지 않으므로
 *   다음 요청이 다시 DB 를 봅니다. 이미 저장된 값이 있으면 그 값이 그대로 남습니다.
 *   이번 요청만 기본값으로 그립니다 (페이지가 깨지지 않게).
 */
/**
 * ★ 빌드 중에는 설정 읽기를 8초까지만 기다립니다 (2026-11-06).
 *   손님 화면은 이제 빌드 때 굽지 않지만, 404 화면(/_not-found)과 관리자 로그인 화면은
 *   Next 가 빌드 때 꼭 굽고, 맨 바깥 레이아웃이 로고·상호·분석 설정을 읽습니다.
 *   DB 가 느릴 때 이 몇 장 때문에 배포가 60초 제한에 걸려 실패하지 않도록,
 *   8초가 넘으면 기본값으로 굽고 로그를 남깁니다. (DB 가 정상이면 평소처럼 실제 값으로 굽습니다)
 */
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';
const BUILD_READ_TIMEOUT_MS = 8000;

function withBuildTimeout<T>(promise: Promise<T>, key: string): Promise<T> {
  if (!IS_BUILD) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[settings] '${key}' 를 빌드 중 ${BUILD_READ_TIMEOUT_MS / 1000}초 안에 읽지 못해 기본값으로 굽습니다.`);
      reject(new SettingReadError('build timeout'));
    }, BUILD_READ_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function cachedSetting<T>(
  key: string,
  cacheKey: string,
  normalize: (value: unknown) => T
): () => Promise<T> {
  const cached = unstable_cache(async () => normalize(await readSettingOrThrow(key)), [cacheKey], {
    tags: [SETTINGS_TAG],
    revalidate: 3600,
  });
  return async () => {
    try {
      return await withBuildTimeout(cached(), key);
    } catch (error) {
      if (!(error instanceof SettingReadError)) {
        console.warn(`[settings] '${key}' 캐시 읽기 실패:`, error);
      }
      return normalize(null);
    }
  };
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
export const getCachedBranding = cachedSetting(BRANDING_KEY, 'branding', normalizeBranding);

/* ── 메인 히어로 버튼 (3-J) ───────────────────────────────── */

export const HERO_BUTTONS_KEY = 'heroButtons';

// text() 도우미는 이 파일 아래쪽에 이미 있습니다. (함수 선언이라 위에서도 쓸 수 있습니다)

export function normalizeHeroButtons(value: unknown): HeroButtonsSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    primaryLabel: text(raw.primaryLabel, DEFAULT_HERO_BUTTONS.primaryLabel),
    primaryHref: text(raw.primaryHref, DEFAULT_HERO_BUTTONS.primaryHref),
    /*
      ★ 두 번째 버튼 문구만 빈 값을 그대로 허용합니다.
        비우면 버튼 자체가 사라져야 하는데, 여기서 기본값으로 되돌려 버리면
        운영자가 뺄 방법이 없어집니다.
    */
    secondaryLabel: typeof raw.secondaryLabel === 'string' ? raw.secondaryLabel.trim() : DEFAULT_HERO_BUTTONS.secondaryLabel,
    secondaryHref: text(raw.secondaryHref, DEFAULT_HERO_BUTTONS.secondaryHref),
  };
}

/** 관리자 화면용 — 항상 DB 를 직접 봅니다. */
export async function getHeroButtons(): Promise<HeroButtonsSettings> {
  return normalizeHeroButtons(await readSetting(HERO_BUTTONS_KEY));
}

/** 고객 화면용 — 메인이 ISR 이라 캐시해 둡니다. 저장하면 태그로 즉시 갈립니다. */
export const getCachedHeroButtons = cachedSetting(HERO_BUTTONS_KEY, 'hero-buttons', normalizeHeroButtons);

/* ── 편집숍 소개 (/about) 대표 이미지 (3-I) ───────────────── */

export const ABOUT_PAGE_KEY = 'aboutPage';

export function normalizeAboutPage(value: unknown): AboutPageSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl.trim() : '',
  };
}

/** 관리자 화면용 — 항상 DB 를 직접 봅니다. */
export async function getAboutPageSettings(): Promise<AboutPageSettings> {
  return normalizeAboutPage(await readSetting(ABOUT_PAGE_KEY));
}

/** 고객 화면용 — /about 이 ISR 이라 캐시해 둡니다. 저장하면 태그로 즉시 갈립니다. */
export const getCachedAboutPage = cachedSetting(ABOUT_PAGE_KEY, 'about-page', normalizeAboutPage);

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

/**
 * 시각 값을 다듬습니다. 9 = 09:00 · 12.5 = 12:30
 * ** 0~24 를 벗어나면 기본값으로 돌립니다.
 */
function clock(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 24) return fallback;
  return num;
}

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
    /*
     * ** 상담 시간 숫자. (2026-08-27)
     * * 0~24 사이만 받습니다. 말도 안 되는 값이 들어오면 기본값으로 돌립니다.
     *   잘못 넣으면 "지금 상담 가능합니다" 가 종일 떠 있거나 종일 안 뜹니다.
     * * 소수를 받습니다. count() 는 정수로 만들어 버리므로 쓰지 않습니다.
     */
    weekdayOpen: clock(raw.weekdayOpen, DEFAULT_STORE.weekdayOpen),
    weekdayClose: clock(raw.weekdayClose, DEFAULT_STORE.weekdayClose),
    saturdayOpen: clock(raw.saturdayOpen, DEFAULT_STORE.saturdayOpen),
    saturdayClose: clock(raw.saturdayClose, DEFAULT_STORE.saturdayClose),
    lunchStart: clock(raw.lunchStart, DEFAULT_STORE.lunchStart),
    lunchEnd: clock(raw.lunchEnd, DEFAULT_STORE.lunchEnd),
    holidays: optionalText(raw.holidays, DEFAULT_STORE.holidays).trim(),
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

export const getCachedStore = cachedSetting(STORE_KEY, 'store', normalizeStore);

/* ── 배송·반품 ────────────────────────────────────────────── */

export function normalizeShipping(value: unknown): ShippingSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SHIPPING;
  const raw = value as Record<string, unknown>;
  return {
    baseFee: count(raw.baseFee, DEFAULT_SHIPPING.baseFee),
    freeThreshold: count(raw.freeThreshold, DEFAULT_SHIPPING.freeThreshold),
    islandFee: count(raw.islandFee, DEFAULT_SHIPPING.islandFee),
    /* 나중에 추가한 항목이라 예전에 저장한 값에는 없습니다. 없으면 기본값을 씁니다. */
    returnFee: count(raw.returnFee, DEFAULT_SHIPPING.returnFee),
    exchangeFee: count(raw.exchangeFee, DEFAULT_SHIPPING.exchangeFee),
    returnAddress: optionalText(raw.returnAddress, DEFAULT_SHIPPING.returnAddress),
    leadTime: optionalText(raw.leadTime, DEFAULT_SHIPPING.leadTime),
    // 비워 둘 수 있는 항목입니다. 비면 배송비 설정으로 문구를 만듭니다.
    productLine: optionalText(raw.productLine, DEFAULT_SHIPPING.productLine),
    /*
     * ★ 너무 짧으면 아직 못 받은 손님의 주문이 배송완료로 넘어갑니다.
     *   실수로 1 을 넣는 일을 막기 위해 최소 3일로 둡니다. 0 은 "끔" 이라 그대로 둡니다.
     * ★ 위쪽도 막습니다. 90일이 넘으면 자동 전환의 뜻이 없습니다.
     */
    autoDeliveredDays: (() => {
      const days = count(raw.autoDeliveredDays, DEFAULT_SHIPPING.autoDeliveredDays);
      if (days <= 0) return 0;
      return Math.min(90, Math.max(3, days));
    })(),
  };
}

export async function getShippingSettings(): Promise<ShippingSettings> {
  return normalizeShipping(await readSetting(SHIPPING_KEY));
}

export const getCachedShipping = cachedSetting(SHIPPING_KEY, 'shipping', normalizeShipping);

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

  /*
    ★ 섹션 노출 (3-K). 저장된 적이 없으면 전부 켬입니다.
      키 하나하나를 따로 봅니다. 나중에 섹션을 더 넣어도 옛 설정이 그대로 살아 있고
      새 섹션만 기본값(켬)으로 들어옵니다.
  */
  const rawSections = (raw.sections && typeof raw.sections === 'object'
    ? raw.sections
    : {}) as Record<string, unknown>;
  const sections = { ...DEFAULT_MAIN_SECTIONS };
  for (const key of Object.keys(DEFAULT_MAIN_SECTIONS) as (keyof MainSections)[]) {
    if (typeof rawSections[key] === 'boolean') sections[key] = rawSections[key] as boolean;
  }

  return {
    banners,
    interval: Math.min(MAX_BANNER_INTERVAL, Math.max(MIN_BANNER_INTERVAL, interval)),
    sections,
    // 예전에 저장된 design 설정에는 이 값이 없습니다. 없으면 빈 문자열(= 자동 생성 사용).
    ogImageUrl: optionalText(raw.ogImageUrl, '').trim(),
  };
}

/* ── 공유 미리보기 이미지 (og:image) ────────────────────────
 *
 * ★★ 3-J 에서 겪은 함정을 그대로 지킵니다.
 *   페이지가 generateMetadata 에서 openGraph 를 정의하면 Next 는 부모(layout)의
 *   openGraph 객체를 통째로 갈아 끼웁니다. 일부만 덮는 것이 아닙니다.
 *   그래서 각 페이지가 images 를 "직접" 넣어 주지 않으면 og:image 가 사라집니다.
 *   여태 DEFAULT_OG_IMAGE 를 각 페이지에 명시적으로 넣어 둔 이유가 그것입니다.
 *   이 함수는 그 자리에 그대로 들어갑니다. 구조는 하나도 바뀌지 않습니다.
 *
 * ★ 운영자가 올린 이미지가 있으면 그것을, 없으면 자동 생성 이미지를 돌려줍니다.
 * ★ 상품 상세·브랜드 상세는 자기 대표 사진을 쓰므로 이 함수를 부르지 않습니다.
 */
export async function getOgImage(): Promise<{
  url: string;
  width: number;
  height: number;
  alt: string;
}> {
  const [design, store] = await Promise.all([getCachedDesign(), getCachedStore()]);
  if (!design.ogImageUrl) return DEFAULT_OG_IMAGE;

  return {
    url: design.ogImageUrl,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt: store.name,
  };
}

export async function getDesignSettings(): Promise<DesignSettings> {
  return normalizeDesign(await readSetting(DESIGN_KEY));
}

export const getCachedDesign = cachedSetting(DESIGN_KEY, 'design', normalizeDesign);

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

/**
 * 관리자가 저장해 둔 문구를 손대지 않은 채로 읽습니다.
 *
 * ★★ 위 getCopySettings 와 반드시 구분해야 합니다.
 *   그쪽은 저장되지 않은 항목에 코드 기본값을 채워 넣은 "화면에 나갈 값" 입니다.
 *   그 값을 그대로 다시 저장하면, 손대지도 않은 항목까지 그 시점의 기본값으로
 *   DB 에 박혀 버립니다. 그 뒤로는 코드 기본값을 고쳐도 화면이 바뀌지 않습니다.
 *   (실제로 그렇게 되어 있었습니다. 카드결제를 붙이고도 약관이 "즉시 결제를
 *   제공하지 않습니다" 로 남아 있던 이유입니다)
 *
 * ★ 저장·되돌리기는 반드시 이 함수를 씁니다.
 */
export async function readStoredCopy(
  options: { forUpdate?: boolean } = {}
): Promise<Record<string, unknown>> {
  // forUpdate: 저장 직전 — 읽기 실패면 던집니다 (빈 값으로 덮어쓰지 않게, readSettingForUpdate)
  const raw = options.forUpdate ? await readSettingOrThrow(COPY_KEY) : await readSetting(COPY_KEY);
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

/**
 * 관리자에서 저장한 적이 있는 문구 항목들.
 * ★ 여기 없는 항목은 코드 기본값을 그대로 따라갑니다.
 *   관리자 화면에서 어느 쪽인지 보여 주는 데 씁니다.
 */
export async function getStoredCopyKeys(): Promise<CopyKey[]> {
  const raw = await readStoredCopy();
  return COPY_KEYS.filter(
    (key) => Array.isArray(raw[key]) && (raw[key] as unknown[]).length > 0
  );
}

export const getCachedCopy = cachedSetting(COPY_KEY, 'copy', normalizeCopy);

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

export const getCachedAnalytics = cachedSetting(ANALYTICS_KEY, 'analytics', normalizeAnalytics);

/* ── 결제·주문 (2-A) ──────────────────────────────────────── */

export function normalizePayment(value: unknown): PaymentSettings {
  if (!value || typeof value !== 'object') return DEFAULT_PAYMENT;
  const raw = value as Record<string, unknown>;

  const rules = Array.isArray(raw.remoteAreaRules)
    ? raw.remoteAreaRules
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : DEFAULT_REMOTE_AREA_RULES;

  return {
    bankName: optionalText(raw.bankName, '').trim(),
    accountNo: optionalText(raw.accountNo, '').trim(),
    accountHolder: optionalText(raw.accountHolder, '').trim(),
    // 0시간이면 기한 안내를 못 하므로 1시간 밑으로는 내려가지 않게 합니다.
    depositHours: Math.max(1, count(raw.depositHours, DEFAULT_PAYMENT.depositHours)),
    autoCancelEnabled: raw.autoCancelEnabled !== false,
    /*
     * ★★ 10분 밑으로는 내려가지 않게 막습니다.
     *   결제창에서 카드번호를 넣고 은행 앱으로 인증하고 돌아오는 데
     *   10분은 흔히 걸립니다. 그보다 짧게 두면 결제 중인 손님의 주문을
     *   우리가 먼저 결제실패로 바꿔 버립니다.
     * ★ 위는 하루(1440분)로 막습니다. 그보다 길게 둘 이유가 없고,
     *   실수로 큰 숫자를 넣으면 이 기능이 사실상 꺼집니다.
     */
    cardPendingMinutes: Math.min(
      1440,
      Math.max(10, count(raw.cardPendingMinutes, DEFAULT_PAYMENT.cardPendingMinutes))
    ),
    /*
     * ★ 기본값은 켬입니다. 명시적으로 false 일 때만 끕니다.
     *   이 설정이 없던 시절에 저장된 값을 읽어도 켜진 채로 동작해야 합니다.
     *   (무통장 autoCancelEnabled 와 같은 방식)
     */
    cardSweepEnabled: raw.cardSweepEnabled !== false,
    /*
     * ★ 0 은 "제한 없음" 이라 그대로 둡니다.
     * ★ 너무 짧으면 멀쩡한 조회 실패까지 조용히 넘어갑니다. 최소 1시간.
     * ★ KSNET 이 대략 2일이라고 했으므로 그보다 한참 큰 값은 뜻이 없습니다. 최대 14일.
     */
    cardRequeryHours: (() => {
      const hours = count(raw.cardRequeryHours, DEFAULT_PAYMENT.cardRequeryHours);
      if (hours <= 0) return 0;
      return Math.min(24 * 14, Math.max(1, hours));
    })(),
    remoteAreaRules: rules,
    telegramEnabled: raw.telegramEnabled !== false,
    inquiryTelegramEnabled: raw.inquiryTelegramEnabled !== false,
    escrowNotice: optionalText(raw.escrowNotice, '').trim(),
    escrowImageUrl: optionalText(raw.escrowImageUrl, '').trim(),
    escrowLinkUrl: optionalText(raw.escrowLinkUrl, '').trim(),
    methods: normalizeMethodFlags(raw.methods),
    // ★ 기본값은 반드시 false 입니다. 명시적으로 true 일 때만 켭니다. (lib/site-config.ts 주석 참고)
    ksnetNotifyAutoComplete: raw.ksnetNotifyAutoComplete === true,
    /*
     * ** 수수료 두 가지. (2026-08-27)
     * * 요율은 소수점이 있어 count() 를 쓰지 않습니다. (count 는 정수로 만듭니다)
     *   0 도 정상값입니다. 수수료가 없는 계약일 수 있습니다.
     * * 말도 안 되는 값은 막습니다. 요율 0~100%, 이체수수료 0~10,000원.
     *   잘못 넣으면 수익이 통째로 이상해집니다.
     */
    cardFeeRate: (() => {
      const rate = Number(raw.cardFeeRate);
      if (!Number.isFinite(rate) || rate < 0) return DEFAULT_PAYMENT.cardFeeRate;
      return Math.min(100, rate);
    })(),
    transferFee: (() => {
      const fee = Number(raw.transferFee);
      if (!Number.isFinite(fee) || fee < 0) return DEFAULT_PAYMENT.transferFee;
      return Math.min(10000, Math.round(fee));
    })(),
  };
}

/**
 * 결제수단 켜고 끄기 값 정리 (4-A).
 *
 * ★ 아직 저장한 적이 없는 항목(예: 4-A 이전에 저장된 설정)은 기본값을 씁니다.
 *   여기서 기본값이 아니라 false 로 채우면, 이 코드를 올리는 순간
 *   결제수단이 전부 사라져 주문을 못 받게 됩니다.
 * ★ 전부 꺼진 값이 저장되어 있어도 무통장입금 하나는 살려 둡니다.
 *   주문 자체가 불가능한 상태로 사이트가 떠 있는 것이 가장 나쁩니다.
 */
function normalizeMethodFlags(value: unknown): Record<string, boolean> {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const flags: Record<string, boolean> = {};

  for (const method of PAYMENT_METHODS) {
    const saved = raw[method.key];
    flags[method.key] =
      typeof saved === 'boolean' ? saved : DEFAULT_PAYMENT_METHOD_FLAGS[method.key];
  }

  if (!Object.values(flags).some(Boolean)) flags.bank_transfer = true;
  return flags;
}

/**
 * ★ 이 값에는 계좌번호가 들어 있습니다.
 *   주문 완료·주문 조회 화면과 관리자에서만 읽으세요.
 *   상품 페이지나 푸터에 내려보내면 스팸 수집 대상이 됩니다.
 *   (푸터에 필요한 구매안전 문구는 getCachedEscrow 로 따로 뽑아 씁니다)
 */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  return normalizePayment(await readSetting(PAYMENT_KEY));
}

export const getCachedPayment = cachedSetting(PAYMENT_KEY, 'payment', normalizePayment);

/* ── 리뷰 (3-A) ───────────────────────────────────────────── */

export function normalizeReview(value: unknown): ReviewSettings {
  if (!value || typeof value !== 'object') return DEFAULT_REVIEW;
  const raw = value as Record<string, unknown>;

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : DEFAULT_REVIEW_TAGS;

  return {
    // 태그를 전부 지웠으면 기본 목록으로 돌립니다. (빈 목록이면 고를 것이 없습니다)
    tags: tags.length > 0 ? tags : DEFAULT_REVIEW_TAGS,
    telegramEnabled: raw.telegramEnabled !== false,
  };
}

export async function getReviewSettings(): Promise<ReviewSettings> {
  return normalizeReview(await readSetting(REVIEW_KEY));
}

export const getCachedReview = cachedSetting(REVIEW_KEY, 'review', normalizeReview);

/* ── 포인트 (3-A) ─────────────────────────────────────────── */

function normalizeRule(value: unknown, fallback: PointRule): PointRule {
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Record<string, unknown>;
  const amount = count(raw.amount, fallback.amount);
  return {
    // 금액이 0이면 켜져 있어도 적립하지 않습니다.
    enabled: raw.enabled !== false && amount > 0,
    amount,
  };
}

export function normalizePoints(value: unknown): PointSettings {
  if (!value || typeof value !== 'object') return DEFAULT_POINTS;
  const raw = value as Record<string, unknown>;

  const rate = count(raw.maxUseRate, DEFAULT_POINTS.maxUseRate);
  const interval = count(raw.popupIntervalHours, DEFAULT_POINTS.popupIntervalHours);

  return {
    signup: normalizeRule(raw.signup, DEFAULT_POINTS.signup),
    reviewText: normalizeRule(raw.reviewText, DEFAULT_POINTS.reviewText),
    reviewPhoto: normalizeRule(raw.reviewPhoto, DEFAULT_POINTS.reviewPhoto),
    // 구매 적립의 amount 는 % 라 100 을 넘기지 않습니다.
    purchase: (() => {
      const rule = normalizeRule(raw.purchase, DEFAULT_POINTS.purchase);
      return { ...rule, amount: Math.min(100, rule.amount) };
    })(),
    birthday: normalizeRule(raw.birthday, DEFAULT_POINTS.birthday),
    minUse: count(raw.minUse, DEFAULT_POINTS.minUse),
    // ★ 0 이나 빈 값이면 1 로 봅니다. 0 으로 나누면 계산이 통째로 무너집니다.
    useUnit: Math.max(1, count(raw.useUnit, DEFAULT_POINTS.useUnit)),
    maxUseRate: Math.min(100, Math.max(0, rate)),
    // 0 이면 소멸하지 않습니다. 너무 짧으면 실수로 다 날아가므로 최대 120개월로 둡니다.
    expireMonths: Math.min(120, count(raw.expireMonths, DEFAULT_POINTS.expireMonths)),
    popupEnabled: raw.popupEnabled !== false,
    popupIntervalHours: Math.min(720, Math.max(1, interval)),
  };
}

export async function getPointSettings(): Promise<PointSettings> {
  return normalizePoints(await readSetting(POINTS_KEY));
}

export const getCachedPoints = cachedSetting(POINTS_KEY, 'points', normalizePoints);

/* ── 판매정보 (3-B) ───────────────────────────────────────── */

/*
 * ★★ 왜 optionalText 인가 — 일부러 비운 것과 입력하지 않은 것을 구분합니다.
 *
 *   예전에는 전부 text() 였습니다. text() 는 빈 문자열을 "입력 안 함" 으로 보고
 *   기본값을 대신 넣습니다. 그래서 운영자가 항목을 지우고 저장하면
 *   "저장했습니다" 가 뜬 뒤 새로고침하면 옛 값이 그대로 돌아왔습니다.
 *   저장은 됐는데 읽을 때 되살아난 것이라 운영자는 저장이 안 된 줄 압니다.
 *
 *   optionalText() 는 값이 문자열이면 빈 문자열이라도 그대로 씁니다.
 *   키 자체가 없을 때(= 한 번도 저장한 적 없음)만 기본값을 씁니다.
 *   그래서 처음 열었을 때는 기본 문구가 채워져 있고, 지우면 지워진 채로 남습니다.
 *
 * ★ 비어도 화면은 깨지지 않습니다. 판매정보 탭은 내용이 없는 항목을
 *   제목째 그리지 않습니다. (components/SalesInfo.tsx 의 Block)
 */
export function normalizeSales(value: unknown): SalesSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SALES;
  const raw = value as Record<string, unknown>;
  return {
    shippingNote: optionalText(raw.shippingNote, ''),
    deliveryPeriod: optionalText(raw.deliveryPeriod, DEFAULT_SALES.deliveryPeriod),
    exchangePolicy: optionalText(raw.exchangePolicy, DEFAULT_SALES.exchangePolicy),
    exchangeCost: optionalText(raw.exchangeCost, DEFAULT_SALES.exchangeCost),
    notAllowed: optionalText(raw.notAllowed, DEFAULT_SALES.notAllowed),
    returnAddress: optionalText(raw.returnAddress, ''),
    asInfo: optionalText(raw.asInfo, DEFAULT_SALES.asInfo),
  };
}

export async function getSalesSettings(): Promise<SalesSettings> {
  return normalizeSales(await readSetting(SALES_KEY));
}

export const getCachedSales = cachedSetting(SALES_KEY, 'sales', normalizeSales);

/* ── 문구 · 이벤트 (3-B) ──────────────────────────────────── */

function normalizeRibbon(value: unknown): RibbonSettings {
  if (!value || typeof value !== 'object') return DEFAULT_EVENT.ribbon;
  const raw = value as Record<string, unknown>;
  const tone = text(raw.tone, 'ink');
  return {
    enabled: raw.enabled === true,
    text: text(raw.text, ''),
    linkUrl: text(raw.linkUrl, ''),
    tone: tone === 'wine' || tone === 'stone' ? tone : 'ink',
    startsAt: text(raw.startsAt, ''),
    endsAt: text(raw.endsAt, ''),
  };
}

/*
 * ★ 판매정보와 같은 이유로 optionalText 를 씁니다.
 *   지우고 저장하면 지워진 채로 남아야 합니다. (위 normalizeSales 의 설명 참고)
 * ★ 비면 그 안내 자체가 나오지 않습니다. 빈 제목만 남지 않습니다.
 */
export function normalizeEvent(value: unknown): EventSettings {
  if (!value || typeof value !== 'object') return DEFAULT_EVENT;
  const raw = value as Record<string, unknown>;
  return {
    signupComplete: optionalText(raw.signupComplete, DEFAULT_EVENT.signupComplete),
    mypageWelcome: optionalText(raw.mypageWelcome, DEFAULT_EVENT.mypageWelcome),
    earnNotice: optionalText(raw.earnNotice, DEFAULT_EVENT.earnNotice),
    ribbon: normalizeRibbon(raw.ribbon),
  };
}

export async function getEventSettings(): Promise<EventSettings> {
  return normalizeEvent(await readSetting(EVENT_KEY));
}

export const getCachedEvent = cachedSetting(EVENT_KEY, 'event', normalizeEvent);

/* ── 상품 가져오기 (3-D) ──────────────────────────────────── */

function normalizeImportBlock(value: unknown): ImportBlock {
  if (!value || typeof value !== 'object') return { ...DEFAULT_IMPORT.topBlock };
  const raw = value as Record<string, unknown>;
  const kind = text(raw.kind, 'image');
  return {
    enabled: raw.enabled === true,
    kind: kind === 'text' ? 'text' : 'image',
    imageUrl: text(raw.imageUrl, ''),
    body: text(raw.body, ''),
  };
}

export function normalizeImport(value: unknown): ImportSettings {
  if (!value || typeof value !== 'object') return DEFAULT_IMPORT;
  const raw = value as Record<string, unknown>;

  const templates: ImportTemplate[] = Array.isArray(raw.templates)
    ? raw.templates
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item, index) => ({
          id: text(item.id, String(index + 1)),
          title: text(item.title, ''),
          body: text(item.body, ''),
        }))
        .filter((item) => item.title.trim() || item.body.trim())
    : [];

  return {
    topBlock: normalizeImportBlock(raw.topBlock),
    bottomBlock: normalizeImportBlock(raw.bottomBlock),
    templates,
  };
}

export async function getImportSettings(): Promise<ImportSettings> {
  return normalizeImport(await readSetting(IMPORT_KEY));
}

/* ── 추천 코드 (3-F) ──────────────────────────────────────── */

export function normalizeReferral(value: unknown): ReferralSettings {
  if (!value || typeof value !== 'object') return DEFAULT_REFERRAL;
  const raw = value as Record<string, unknown>;
  return {
    // ★ 기본은 켜짐. 값이 없다고 기능이 사라지면 안 됩니다.
    enabled: raw.enabled !== false,
    monthlyPointCap: count(raw.monthlyPointCap, DEFAULT_REFERRAL.monthlyPointCap),
    inviteNotice: optionalText(raw.inviteNotice, DEFAULT_REFERRAL.inviteNotice),
    shareLine: text(raw.shareLine, DEFAULT_REFERRAL.shareLine),
    // ★ 비워 두면 그 상황에서는 아무 문구도 나가지 않습니다. 기본값으로 되돌리지 않습니다.
    shareNoticeEvent: optionalText(
      raw.shareNoticeEvent,
      DEFAULT_REFERRAL.shareNoticeEvent
    ),
    shareNoticeGuest: optionalText(
      raw.shareNoticeGuest,
      DEFAULT_REFERRAL.shareNoticeGuest
    ),
  };
}

export async function getReferralSettings(): Promise<ReferralSettings> {
  return normalizeReferral(await readSetting(REFERRAL_KEY));
}

export const getCachedReferral = cachedSetting(REFERRAL_KEY, 'referral', normalizeReferral);

/* ── SNS (3-G) ────────────────────────────────────────────── */

/**
 * 주소는 http(s) 만 받습니다.
 *
 * ★ javascript: 나 data: 가 들어오면 푸터 링크가 그대로 실행 통로가 됩니다.
 *   관리자만 입력하는 값이지만, 관리자 계정이 털리면 전 페이지에 실리는 자리입니다.
 *   저장할 때도 막고(saveSnsAction) 읽을 때도 막습니다.
 */
function webUrl(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : '';
  return /^https?:\/\//i.test(url) ? url : '';
}

export function normalizeSns(value: unknown): SnsSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SNS;
  const raw = value as Record<string, unknown>;
  const rawLinks = (raw.links ?? {}) as Record<string, unknown>;

  const links = {} as Record<SnsKey, string>;
  for (const item of SNS_ITEMS) {
    links[item.key] = webUrl(rawLinks[item.key]);
  }

  return { links, wechatQrUrl: webUrl(raw.wechatQrUrl) };
}

export async function getSnsSettings(): Promise<SnsSettings> {
  return normalizeSns(await readSetting(SNS_KEY));
}

export const getCachedSns = cachedSetting(SNS_KEY, 'sns', normalizeSns);

/** 푸터용 — 계좌번호를 뺀 구매안전 서비스 표시 정보만 돌려줍니다. */
export async function getEscrowNotice(): Promise<{
  notice: string;
  imageUrl: string;
  linkUrl: string;
}> {
  const payment = await getCachedPayment();
  return {
    notice: payment.escrowNotice,
    imageUrl: payment.escrowImageUrl,
    linkUrl: payment.escrowLinkUrl,
  };
}
