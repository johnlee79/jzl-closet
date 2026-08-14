import 'server-only';

import { unstable_cache } from 'next/cache';
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
  source: null,
  keys: [],
  updatedAt: null,
};

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
  // 파비콘이 비어 있으면 통째로 기본값을 씁니다. (반쪽짜리 설정을 만들지 않습니다)
  if (!favicon) return DEFAULT_BRANDING;

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
