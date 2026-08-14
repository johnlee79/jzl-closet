import 'server-only';
import { assertWritten } from '@/lib/db-write';

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
  /** 실제 시각. 기간 판단에만 씁니다. */
  startsAt: string | null;
  endsAt: string | null;
  /** 관리자 화면에 보여 줄 날짜 (한국시간 YYYY-MM-DD) */
  startsOn: string;
  endsOn: string;
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

/* ── 기간은 날짜 단위로만 다룹니다 ──────────────────────────
 *
 * ★ 예전에는 시각까지 받았습니다.
 *   그런데 관리자가 넣은 'YYYY-MM-DDTHH:mm' 을 서버가 그대로 new Date() 로 읽는 바람에
 *   서버 시간대(Vercel 은 UTC)로 해석되어 실제로는 9시간이 밀렸습니다.
 *   "오늘부터" 로 걸어 둔 팝업이 한국시간 오전 9시가 지나야 뜨는 식이었습니다.
 *
 *   그래서 시각을 아예 없애고 날짜만 받습니다.
 *   시작일은 그날 한국시간 00:00:00, 종료일은 23:59:59 로 저장합니다.
 *   종료일을 비우면 제한이 없습니다.
 */

const KST_OFFSET = 9 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' → 그날 한국시간 00:00:00 (ISO) */
function kstDayStart(date: string): string | null {
  const day = date.trim().slice(0, 10);
  if (!/^d{4}-d{2}-d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** 'YYYY-MM-DD' → 그날 한국시간 23:59:59.999 (ISO) */
function kstDayEnd(date: string): string | null {
  const day = date.trim().slice(0, 10);
  if (!/^d{4}-d{2}-d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T23:59:59.999+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** 저장된 시각 → 관리자 화면에 보여 줄 한국시간 날짜 */
export function toKstDate(iso: string | null): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() + KST_OFFSET).toISOString().slice(0, 10);
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
    startsOn: toKstDate(row.starts_at),
    endsOn: toKstDate(row.ends_at),
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
  // ★ 페이지 자체의 ISR(60초)과 맞춥니다.
  //   300초로 두면 팝업을 새로 등록하고도 최대 5분을 기다려야 해서
  //   "설정했는데 안 뜬다" 로 보입니다.
  //   저장할 때 revalidateTag(POPUP_TAG) 로 바로 비우지만, 그래도 여유를 줄여 둡니다.
  revalidate: 60,
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
  /** 'YYYY-MM-DD'. 비워 두면 제한 없음입니다. */
  startsOn: string;
  endsOn: string;
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
    // ★ 한국시간 기준으로 시작일 00:00:00 ~ 종료일 23:59:59 입니다.
    //   비워 두면 제한 없음입니다.
    starts_at: input.startsOn ? kstDayStart(input.startsOn) : null,
    ends_at: input.endsOn ? kstDayEnd(input.endsOn) : null,
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
  const result = await supabase
    .from(TABLE)
    .update(toRow(input))
    .eq('id', id)
    .select('id');
  assertWritten(result, '팝업을 수정하지 못했습니다');
}

export async function deletePopup(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const result = await supabase.from(TABLE).delete().eq('id', id).select('id');
  assertWritten(result, '팝업을 삭제하지 못했습니다');
}
