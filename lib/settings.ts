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
  DEFAULT_REFERRAL,
  DEFAULT_REMOTE_AREA_RULES,
  DEFAULT_REVIEW,
  DEFAULT_REVIEW_TAGS,
  DEFAULT_SALES,
  DEFAULT_SHIPPING,
  DEFAULT_SNS,
  DEFAULT_STORE,
  MAX_BANNERS,
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
export const getCachedHeroButtons = unstable_cache(getHeroButtons, ['hero-buttons'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

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
export const getCachedAboutPage = unstable_cache(getAboutPageSettings, ['about-page'], {
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
    // 비워 둘 수 있는 항목입니다. 비면 배송비 설정으로 문구를 만듭니다.
    productLine: optionalText(raw.productLine, DEFAULT_SHIPPING.productLine),
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
    remoteAreaRules: rules,
    telegramEnabled: raw.telegramEnabled !== false,
    inquiryTelegramEnabled: raw.inquiryTelegramEnabled !== false,
    escrowNotice: optionalText(raw.escrowNotice, '').trim(),
    escrowImageUrl: optionalText(raw.escrowImageUrl, '').trim(),
    escrowLinkUrl: optionalText(raw.escrowLinkUrl, '').trim(),
  };
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

export const getCachedPayment = unstable_cache(getPaymentSettings, ['payment'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

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

export const getCachedReview = unstable_cache(getReviewSettings, ['review'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

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

export const getCachedPoints = unstable_cache(getPointSettings, ['points'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

/* ── 판매정보 (3-B) ───────────────────────────────────────── */

export function normalizeSales(value: unknown): SalesSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SALES;
  const raw = value as Record<string, unknown>;
  return {
    shippingNote: text(raw.shippingNote, ''),
    deliveryPeriod: text(raw.deliveryPeriod, DEFAULT_SALES.deliveryPeriod),
    exchangePolicy: text(raw.exchangePolicy, DEFAULT_SALES.exchangePolicy),
    exchangeCost: text(raw.exchangeCost, DEFAULT_SALES.exchangeCost),
    notAllowed: text(raw.notAllowed, DEFAULT_SALES.notAllowed),
    returnAddress: text(raw.returnAddress, ''),
    asInfo: text(raw.asInfo, DEFAULT_SALES.asInfo),
  };
}

export async function getSalesSettings(): Promise<SalesSettings> {
  return normalizeSales(await readSetting(SALES_KEY));
}

export const getCachedSales = unstable_cache(getSalesSettings, ['sales'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

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

export function normalizeEvent(value: unknown): EventSettings {
  if (!value || typeof value !== 'object') return DEFAULT_EVENT;
  const raw = value as Record<string, unknown>;
  return {
    signupComplete: text(raw.signupComplete, DEFAULT_EVENT.signupComplete),
    mypageWelcome: text(raw.mypageWelcome, DEFAULT_EVENT.mypageWelcome),
    earnNotice: text(raw.earnNotice, DEFAULT_EVENT.earnNotice),
    ribbon: normalizeRibbon(raw.ribbon),
  };
}

export async function getEventSettings(): Promise<EventSettings> {
  return normalizeEvent(await readSetting(EVENT_KEY));
}

export const getCachedEvent = unstable_cache(getEventSettings, ['event'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

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

export const getCachedReferral = unstable_cache(getReferralSettings, ['referral'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

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

export const getCachedSns = unstable_cache(getSnsSettings, ['sns'], {
  tags: [SETTINGS_TAG],
  revalidate: 3600,
});

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
