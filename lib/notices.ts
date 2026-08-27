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

/**
 * 아직 없는 칸을 건드렸을 때 오는 코드들.
 * ★ 42703 은 Postgres, PGRST204 는 PostgREST 가 스키마 캐시에서 못 찾았을 때입니다.
 *   lib/orders.ts 에 이미 같은 것이 있습니다. 같은 방식으로 맞췄습니다.
 */
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);

function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && MISSING_COLUMN_CODES.has(error.code));
}

function missingTableError(): Error {
  return new Error(
    'notices 테이블이 없습니다. supabase/schema-3a.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
  );
}

/**
 * ================================================================
 * ** 구분 — 공지인가, 자주 묻는 질문인가 (2-C, 2026-08-27)
 * ================================================================
 *
 * ** 표를 새로 만들지 않고 notices 에 칸 하나를 더했습니다.
 *   제목·내용·노출·순서·편집기가 공지와 똑같습니다. 표를 나누면 같은
 *   화면을 한 벌 더 만들어야 하고, 두 벌이 조금씩 어긋나기 시작합니다.
 *
 * ** ★ 칸이 아직 없어도 돌아갑니다. 이게 제일 중요합니다.
 *   정리SQL/12 를 돌리기 전에는 **기존 공지 줄에 kind 칸이 아예 없습니다.**
 *   여기서 터지거나 빈 목록을 돌려주면 손님 공지 화면이 통째로 빕니다.
 *   그래서
 *     - 읽을 때: kind 가 없으면 'notice' 로 봅니다.
 *     - 거를 때: DB 에 .eq('kind', ...) 를 걸지 **않습니다.**
 *       칸이 없는 상태에서 걸면 조회가 통째로 실패합니다. 가져온 뒤
 *       코드에서 거릅니다. 공지는 많아야 수십 건이라 느려지지 않습니다.
 *     - 쓸 때: 칸이 없다고 하면 kind 를 빼고 한 번 더 시도하고,
 *       **왜 뺐는지 반드시 로그에 남깁니다.** 조용히 넘어가지 않습니다.
 *
 * ** 구분과 글자 뽑기는 lib/notice-kind.ts 에 있습니다.
 *   이 파일은 server-only 라 관리자 화면이 직접 못 읽습니다. 그래서 DB 를
 *   안 건드리는 것만 갈라 두고, 여기서 그대로 다시 내보냅니다.
 *   부르는 쪽은 지금까지처럼 이 파일에서 가져다 쓰면 됩니다.
 * ================================================================
 */
import { stripTags, toKind, type NoticeKind } from '@/lib/notice-kind';

export { NOTICE_KINDS, stripTags, toKind, type NoticeKind } from '@/lib/notice-kind';

export type Notice = {
  id: string;
  title: string;
  content: string;
  kind: NoticeKind;
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
  /** ★ 칸을 아직 안 만들었으면 이 자리가 통째로 없습니다. */
  kind?: string | null;
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
    kind: toKind(row.kind),
    isPinned: Boolean(row.is_pinned),
    isVisible: row.is_visible !== false,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ── 조회 ─────────────────────────────────────────────────── */

/** 노출 중인 것을 종류 구분 없이 전부. 아래 두 함수가 나눠 씁니다. */
async function readVisibleRows(): Promise<Notice[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  /*
   * ** .eq('kind', ...) 를 여기에 걸지 않습니다.
   *   칸이 아직 없으면 조회가 통째로 실패해서 공지 화면이 빕니다.
   *   가져온 뒤 코드에서 거릅니다. (맨 위 ★ 주석)
   */
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

const getVisibleAll = unstable_cache(readVisibleRows, ['notices-visible'], {
  tags: [NOTICE_TAG],
  revalidate: 3600,
});

/**
 * 손님용 공지 목록 — **자주 묻는 질문은 빠집니다.**
 * 공지 목록·공지 상세·사이트맵이 모두 이 함수를 씁니다.
 */
export async function getVisibleNotices(): Promise<Notice[]> {
  return (await getVisibleAll()).filter((row) => row.kind === 'notice');
}

/**
 * 채팅에 띄울 자주 묻는 질문.
 *
 * ** 답이 비어 있는 질문은 여기서 뺍니다. (사장님 지시)
 *   빈 말풍선이 뜨면 안 하느니만 못합니다. 사장님이 답을 쓰기 전까지는
 *   그 질문이 손님에게 아예 안 보입니다.
 */
export async function getVisibleFaqs(): Promise<Notice[]> {
  return (await getVisibleAll()).filter(
    (row) => row.kind === 'faq' && stripTags(row.content).length > 0
  );
}

/** 관리자용 — 숨긴 것까지 전부. 공지와 질문이 함께 옵니다. */
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
  kind: NoticeKind;
  isPinned: boolean;
  isVisible: boolean;
};

/** 저장할 값. kind 를 뺀 판을 따로 만들 수 있게 나눠 둡니다. */
function toRow(input: NoticeInput, withKind: boolean) {
  const row: Record<string, unknown> = {
    title: input.title.trim(),
    content: input.content,
    is_pinned: input.isPinned,
    is_visible: input.isVisible,
  };
  if (withKind) row.kind = input.kind;
  return row;
}

/**
 * 칸이 아직 없다고 하면 kind 를 빼고 한 번 더 해 봅니다.
 *
 * ** ★ 왜 뺐는지 반드시 로그에 남깁니다. 조용히 넘어가지 않습니다.
 *   칸이 없는 채로 저장하면 그 글은 전부 '공지' 가 됩니다. 사장님이
 *   자주 묻는 질문으로 골라 저장했는데 공지 목록에 나타나면, 이유를
 *   모른 채 "왜 안 되지" 만 반복하게 됩니다.
 */
function warnMissingKind(where: string): void {
  console.error(
    `[notices] ${where}: notices.kind 칸이 없어서 구분을 빼고 저장했습니다. ` +
      '이 글은 전부 공지로 잡힙니다. 정리SQL/12-공지-구분칸-추가.sql 을 실행해 주세요.'
  );
}

export async function createNotice(input: NoticeInput): Promise<void> {
  const supabase = requireSupabaseAdmin();

  let { error } = await supabase.from(TABLE).insert(toRow(input, true));

  if (isMissingColumn(error)) {
    warnMissingKind('등록');
    ({ error } = await supabase.from(TABLE).insert(toRow(input, false)));
  }

  if (error) {
    if (isMissingTable(error.code)) throw missingTableError();
    throw new Error(`공지를 저장하지 못했습니다: ${error.message}`);
  }
}

export async function updateNotice(id: string, input: NoticeInput): Promise<void> {
  const supabase = requireSupabaseAdmin();

  let result = await supabase
    .from(TABLE)
    .update(toRow(input, true))
    .eq('id', id)
    .select('id');

  if (isMissingColumn(result.error)) {
    warnMissingKind('수정');
    result = await supabase
      .from(TABLE)
      .update(toRow(input, false))
      .eq('id', id)
      .select('id');
  }

  assertWritten(result, '공지를 수정하지 못했습니다');
}

export async function deleteNotice(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const result = await supabase.from(TABLE).delete().eq('id', id).select('id');
  assertWritten(result, '공지를 삭제하지 못했습니다');
}
