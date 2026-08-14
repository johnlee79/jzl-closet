import 'server-only';
import { assertWritten } from '@/lib/db-write';

import { unstable_cache } from 'next/cache';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';

/** 공지사항. 서버 전용입니다. */

const TABLE = 'notices';

/** 공지가 바뀌면 이 태그를 비웁니다. */
export const NOTICE_TAG = 'notices';

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function missingTableError(): Error {
  return new Error(
    'notices 테이블이 없습니다. supabase/schema-3a.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
  );
}

export type Notice = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isVisible: boolean;
  viewCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type NoticeRow = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean | null;
  is_visible: boolean | null;
  view_count: number | null;
  created_at: string | null;
  updated_at: string | null;
};

function rowToNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    isPinned: Boolean(row.is_pinned),
    isVisible: row.is_visible !== false,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ── 조회 ─────────────────────────────────────────────────── */

/** 손님용 — 노출 중인 공지만. 고정 공지가 위로 옵니다. */
async function readVisibleNotices(): Promise<Notice[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_visible', true)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error || !data) {
    if (error && !isMissingTable(error.code)) {
      console.error('[notices] 목록 조회 실패:', error.message);
    }
    return [];
  }
  return (data as NoticeRow[]).map(rowToNotice);
}

export const getVisibleNotices = unstable_cache(readVisibleNotices, ['notices-visible'], {
  tags: [NOTICE_TAG],
  revalidate: 3600,
});

/** 관리자용 — 숨긴 공지까지 전부 */
export async function getAllNotices(): Promise<Notice[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as NoticeRow[]).map(rowToNotice);
}

export async function getNoticeById(id: string): Promise<Notice | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return rowToNotice(data as NoticeRow);
}

/** 조회수 +1. 실패해도 화면은 그대로 보여 줍니다. */
export async function increaseViewCount(id: string, current: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from(TABLE).update({ view_count: current + 1 }).eq('id', id);
}

/* ── 저장 ─────────────────────────────────────────────────── */

export type NoticeInput = {
  title: string;
  content: string;
  isPinned: boolean;
  isVisible: boolean;
};

export async function createNotice(input: NoticeInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(TABLE).insert({
    title: input.title.trim(),
    content: input.content,
    is_pinned: input.isPinned,
    is_visible: input.isVisible,
  });
  if (error) {
    if (isMissingTable(error.code)) throw missingTableError();
    throw new Error(`공지를 저장하지 못했습니다: ${error.message}`);
  }
}

export async function updateNotice(id: string, input: NoticeInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const result = await supabase
    .from(TABLE)
    .update({
      title: input.title.trim(),
      content: input.content,
      is_pinned: input.isPinned,
      is_visible: input.isVisible,
    })
    .eq('id', id)
    .select('id');
  assertWritten(result, '공지를 수정하지 못했습니다');
}

export async function deleteNotice(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const result = await supabase.from(TABLE).delete().eq('id', id).select('id');
  assertWritten(result, '공지를 삭제하지 못했습니다');
}
