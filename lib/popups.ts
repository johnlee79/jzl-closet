import 'server-only';

import { unstable_cache } from 'next/cache';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';
import type { PopupPosition } from '@/lib/site-config';

/** 메인 팝업. 서버 전용입니다. */

const TABLE = 'popups';

/** 팝업이 바뀌면 이 태그를 비웁니다. */
export const POPUP_TAG = 'popups';

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function missingTableError(): Error {
  return new Error(
    'popups 테이블이 없습니다. supabase/schema-3a.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
  );
}

export type Popup = {
  id: string;
  title: string;
  imageUrl: string;
  content: string;
  linkUrl: string;
  position: PopupPosition;
  width: number;
  startsAt: string | null;
  endsAt: string | null;
  isVisible: boolean;
  showOn: string;
  displayOrder: number;
};

type PopupRow = {
  id: string;
  title: string;
  image_url: string | null;
  content: string | null;
  link_url: string | null;
  position: string | null;
  width: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_visible: boolean | null;
  show_on: string | null;
  display_order: number | null;
};

function toPosition(value: string | null): PopupPosition {
  return value === 'left' || value === 'right' ? value : 'center';
}

function rowToPopup(row: PopupRow): Popup {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url ?? '',
    content: row.content ?? '',
    linkUrl: row.link_url ?? '',
    position: toPosition(row.position),
    // 너무 좁거나 넓으면 화면이 이상해집니다.
    width: Math.min(720, Math.max(240, row.width ?? 400)),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isVisible: row.is_visible !== false,
    showOn: row.show_on === 'all' ? 'all' : 'home',
    displayOrder: row.display_order ?? 0,
  };
}

/** 지금 띄워도 되는 기간인지 */
export function isWithinPeriod(popup: Popup, now = new Date()): boolean {
  if (popup.startsAt && new Date(popup.startsAt).getTime() > now.getTime()) return false;
  if (popup.endsAt && new Date(popup.endsAt).getTime() < now.getTime()) return false;
  return true;
}

/* ── 조회 ─────────────────────────────────────────────────── */

async function readVisiblePopups(): Promise<Popup[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_visible', true)
    .order('display_order', { ascending: true });

  if (error || !data) {
    if (error && !isMissingTable(error.code)) {
      console.error('[popups] 목록 조회 실패:', error.message);
    }
    return [];
  }
  return (data as PopupRow[]).map(rowToPopup);
}

/**
 * 손님 화면에 띄울 팝업.
 * ★ 기간 판단은 캐시 밖에서 합니다. 캐시된 목록에 기간 조건을 넣으면
 *   기간이 지나도 캐시가 살아 있는 동안 계속 뜰 수 있습니다.
 */
const getCachedPopups = unstable_cache(readVisiblePopups, ['popups-visible'], {
  tags: [POPUP_TAG],
  revalidate: 300,
});

/**
 * 지금 기간에 든 팝업 전부.
 * ★ show_on(메인만 / 모든 화면) 판단은 화면에서 합니다.
 *   레이아웃에서 주소를 읽으면 프론트 전 페이지가 동적 렌더링으로 바뀌어
 *   정적 생성(SEO)이 깨지기 때문입니다.
 */
export async function getActivePopups(): Promise<Popup[]> {
  const popups = await getCachedPopups();
  const now = new Date();
  return popups.filter((popup) => isWithinPeriod(popup, now));
}

/** 관리자용 — 숨긴 것까지 전부 */
export async function getAllPopups(): Promise<Popup[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('display_order', { ascending: true });

  if (error || !data) return [];
  return (data as PopupRow[]).map(rowToPopup);
}

export async function getPopupById(id: string): Promise<Popup | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return rowToPopup(data as PopupRow);
}

/* ── 저장 ─────────────────────────────────────────────────── */

export type PopupInput = {
  title: string;
  imageUrl: string;
  content: string;
  linkUrl: string;
  position: string;
  width: number;
  startsAt: string;
  endsAt: string;
  isVisible: boolean;
  showOn: string;
  displayOrder: number;
};

function toRow(input: PopupInput): Record<string, unknown> {
  return {
    title: input.title.trim(),
    image_url: input.imageUrl.trim() || null,
    content: input.content.trim() || null,
    link_url: input.linkUrl.trim() || null,
    position: toPosition(input.position),
    width: Math.min(720, Math.max(240, input.width || 400)),
    // 비워 두면 제한 없음입니다.
    starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    is_visible: input.isVisible,
    show_on: input.showOn === 'all' ? 'all' : 'home',
    display_order: input.displayOrder,
  };
}

export async function createPopup(input: PopupInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(TABLE).insert(toRow(input));
  if (error) {
    if (isMissingTable(error.code)) throw missingTableError();
    throw new Error(`팝업을 저장하지 못했습니다: ${error.message}`);
  }
}

export async function updatePopup(id: string, input: PopupInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(TABLE).update(toRow(input)).eq('id', id);
  if (error) throw new Error(`팝업을 수정하지 못했습니다: ${error.message}`);
}

export async function deletePopup(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`팝업을 삭제하지 못했습니다: ${error.message}`);
}
