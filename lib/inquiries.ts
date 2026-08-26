import 'server-only';

import { assertWritten } from '@/lib/db-write';
import { maskName } from '@/lib/mask-name';
import { hashPassword, verifyPassword } from '@/lib/password';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';
import { INQUIRY_STATUSES, type InquiryStatus } from '@/lib/inquiry-status';

/**
 * 1:1 문의 저장·조회. 서버 전용이며 service_role 로만 접근합니다.
 *
 * ★ 비회원 문의는 문의번호 + 비밀번호가 맞을 때만 돌려줍니다.
 * ★ 상품 상세의 문의 목록은 비밀글이면 제목과 내용을 가려서 내려보냅니다.
 */

const TABLE = 'inquiries';

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);
const UNIQUE_VIOLATION = '23505';

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function missingTableError(): Error {
  return new Error(
    'inquiries 테이블이 없습니다. supabase/schema-2b.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
  );
}

/* ------------------------------------------------------------------
 * 타입
 * ------------------------------------------------------------------ */

export type Inquiry = {
  id: string;
  inquiryNo: string;
  userId: string | null;
  orderId: string | null;
  productId: string | null;
  category: string;
  title: string;
  content: string;
  writerName: string;
  writerPhone: string;
  writerEmail: string;
  isSecret: boolean;
  status: string;
  answer: string;
  answeredAt: string | null;
  attachments: string[];
  createdAt: string | null;
  updatedAt: string | null;
  /** 비밀번호가 걸려 있는 비회원 문의인지 (해시 자체는 내보내지 않습니다) */
  hasPassword: boolean;
};

type InquiryRow = {
  id: string;
  inquiry_no: string;
  user_id: string | null;
  order_id: string | null;
  product_id: string | null;
  category: string;
  title: string;
  content: string;
  writer_name: string;
  writer_phone: string | null;
  writer_email: string | null;
  password_hash: string | null;
  is_secret: boolean | null;
  status: string;
  answer: string | null;
  answered_at: string | null;
  attachments: unknown;
  created_at: string | null;
  updated_at: string | null;
};

function toAttachments(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToInquiry(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    inquiryNo: row.inquiry_no,
    userId: row.user_id,
    orderId: row.order_id,
    productId: row.product_id,
    category: row.category,
    title: row.title,
    content: row.content,
    writerName: row.writer_name,
    writerPhone: row.writer_phone ?? '',
    writerEmail: row.writer_email ?? '',
    isSecret: row.is_secret !== false,
    status: row.status,
    answer: row.answer ?? '',
    answeredAt: row.answered_at,
    attachments: toAttachments(row.attachments),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasPassword: Boolean(row.password_hash),
  };
}

/* ------------------------------------------------------------------
 * 생성
 * ------------------------------------------------------------------ */

export type InquiryInput = {
  userId: string | null;
  orderId: string | null;
  productId: string | null;
  category: string;
  title: string;
  content: string;
  writerName: string;
  writerPhone: string;
  writerEmail: string;
  /** 비회원만 씁니다. 회원은 로그인으로 본인 확인이 됩니다. */
  password: string;
  isSecret: boolean;
  attachments: string[];
};

async function nextInquiryNo(): Promise<string> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.rpc('next_inquiry_no');
  if (error) {
    if (isMissingTable(error.code)) throw missingTableError();
    throw new Error(`문의번호를 발급하지 못했습니다: ${error.message}`);
  }
  const inquiryNo = typeof data === 'string' ? data : String(data ?? '');
  if (!inquiryNo) throw new Error('문의번호를 발급하지 못했습니다.');
  return inquiryNo;
}

export async function createInquiry(input: InquiryInput): Promise<Inquiry> {
  const supabase = requireSupabaseAdmin();

  const passwordHash =
    !input.userId && input.password ? await hashPassword(input.password) : null;

  const base = {
    user_id: input.userId,
    order_id: input.orderId,
    product_id: input.productId,
    category: input.category,
    title: input.title.trim(),
    content: input.content.trim(),
    writer_name: input.writerName.trim(),
    writer_phone: input.writerPhone.trim() || null,
    writer_email: input.writerEmail.trim() || null,
    password_hash: passwordHash,
    is_secret: input.isSecret,
    status: 'pending' as const,
    attachments: input.attachments.slice(0, 3),
  };

  // 문의번호는 DB 함수가 원자적으로 발급하지만 만에 하나 겹치면 몇 번 더 시도합니다.
  let lastError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inquiryNo = await nextInquiryNo();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ ...base, inquiry_no: inquiryNo })
      .select('*')
      .single();

    if (!error) return rowToInquiry(data as InquiryRow);

    lastError = error;
    if (isMissingTable(error.code)) throw missingTableError();
    if (error.code !== UNIQUE_VIOLATION) break;
  }

  throw new Error(`문의를 저장하지 못했습니다: ${lastError?.message ?? '알 수 없는 오류'}`);
}

/* ------------------------------------------------------------------
 * 조회
 * ------------------------------------------------------------------ */

export async function getInquiryById(id: string): Promise<Inquiry | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return rowToInquiry(data as InquiryRow);
}

/** 회원 본인 문의만. 남의 문의는 null 입니다. */
export async function getInquiryOfUser(
  userId: string,
  id: string
): Promise<Inquiry | null> {
  const inquiry = await getInquiryById(id);
  if (!inquiry || inquiry.userId !== userId) return null;
  return inquiry;
}

export async function getInquiriesOfUser(userId: string): Promise<Inquiry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as InquiryRow[]).map(rowToInquiry);
}

export async function countInquiriesOfUser(
  userId: string
): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from(TABLE)
    .select('status')
    .eq('user_id', userId);
  if (error || !data) return {};

  const result: Record<string, number> = {};
  for (const row of data as { status: string }[]) {
    result[row.status] = (result[row.status] ?? 0) + 1;
  }
  return result;
}

/**
 * 비회원 문의 조회 — 문의번호와 비밀번호가 모두 맞아야 합니다.
 * 둘 중 하나만 맞으면 "없음"으로 처리해 존재 여부를 알려 주지 않습니다.
 */
export async function getInquiryForLookup(
  inquiryNo: string,
  password: string
): Promise<Inquiry | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('inquiry_no', inquiryNo.trim().toUpperCase())
    .maybeSingle();

  if (error || !data) return null;

  const row = data as InquiryRow;
  // 회원 문의는 이 경로로 열지 않습니다. 로그인 후 마이페이지에서 봅니다.
  if (row.user_id) return null;
  if (!(await verifyPassword(password, row.password_hash))) return null;

  return rowToInquiry(row);
}

/* ------------------------------------------------------------------
 * 상품 상세의 문의 목록
 * ------------------------------------------------------------------ */

/** 목록에 내려보내는 최소 정보. 비밀글이면 제목과 내용을 가립니다. */
export type PublicInquiry = {
  id: string;
  inquiryNo: string;
  category: string;
  title: string;
  /** 비밀글이면 빈 문자열입니다. */
  content: string;
  /** 비밀글이면 빈 문자열입니다. */
  answer: string;
  status: string;
  writerName: string;
  createdAt: string | null;
  answeredAt: string | null;
  isSecret: boolean;
  hasAnswer: boolean;
};

/**
 * 상품 상세 Q&A 탭의 문의 목록.
 *
 * ★ 비밀글은 제목·내용·답변을 아예 내려보내지 않습니다.
 *   화면에서 감추는 방식은 개발자 도구로 그대로 보입니다.
 * ★ 작성자명은 여기서 가려 보냅니다. (DB 원본은 그대로)
 */
export async function getProductInquiries(
  productId: string,
  limit = 100
): Promise<PublicInquiry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'id, inquiry_no, category, title, content, status, writer_name, created_at, answered_at, is_secret, answer'
    )
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (
    data as {
      id: string;
      inquiry_no: string;
      category: string;
      title: string;
      content: string;
      status: string;
      writer_name: string;
      created_at: string | null;
      answered_at: string | null;
      is_secret: boolean | null;
      answer: string | null;
    }[]
  ).map((row) => {
    const secret = row.is_secret !== false;
    return {
      id: row.id,
      inquiryNo: row.inquiry_no,
      category: row.category,
      title: secret ? '비밀글입니다.' : row.title,
      content: secret ? '' : row.content,
      answer: secret ? '' : (row.answer ?? ''),
      status: row.status,
      writerName: maskName(row.writer_name),
      createdAt: row.created_at,
      answeredAt: row.answered_at,
      isSecret: secret,
      hasAnswer: Boolean(row.answer),
    };
  });
}

/* ------------------------------------------------------------------
 * 관리자
 * ------------------------------------------------------------------ */

export type InquiryFilter = {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

/** 목록과 건수가 같은 조건을 보게, 상태·페이지만 뺀 나머지 */
export type InquiryCountFilter = Omit<InquiryFilter, 'status' | 'limit' | 'offset'>;

/**
 * 검색어를 조회식으로 바꿉니다.
 *
 * ★★ 목록과 건수가 이 함수 하나를 같이 씁니다.
 *   같은 식을 두 곳에 두면 한쪽만 고쳐져 목록과 탭이 어긋납니다.
 *   회원 화면(lib/profiles.ts)도 같은 방식입니다.
 */
function inquirySearchExpression(search: string | undefined): string {
  const term = (search ?? '').replace(/[%,().]/g, '').trim();
  if (!term) return '';
  return `inquiry_no.ilike.%${term}%,title.ilike.%${term}%,content.ilike.%${term}%,writer_name.ilike.%${term}%`;
}

export async function getInquiries(
  filter: InquiryFilter = {}
): Promise<{ inquiries: Inquiry[]; total: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { inquiries: [], total: 0 };

  const searchExpression = inquirySearchExpression(filter.search);

  try {
    let countQuery = supabase.from(TABLE).select('id', { count: 'exact', head: true });
    if (filter.status && filter.status !== 'all') {
      countQuery = countQuery.eq('status', filter.status);
    }
    if (searchExpression) countQuery = countQuery.or(searchExpression);

    let listQuery = supabase.from(TABLE).select('*');
    if (filter.status && filter.status !== 'all') {
      listQuery = listQuery.eq('status', filter.status);
    }
    if (searchExpression) listQuery = listQuery.or(searchExpression);

    listQuery = listQuery.order('created_at', { ascending: false });
    if (filter.limit !== undefined) {
      const from = filter.offset ?? 0;
      listQuery = listQuery.range(from, from + filter.limit - 1);
    }

    const [countResult, listResult] = await Promise.all([countQuery, listQuery]);

    if (listResult.error) {
      if (!isMissingTable(listResult.error.code)) {
        console.error('[inquiries] 목록 조회 실패:', listResult.error.message);
      }
      return { inquiries: [], total: 0 };
    }

    const rows = (listResult.data ?? []) as InquiryRow[];
    return {
      inquiries: rows.map(rowToInquiry),
      total: countResult.count ?? rows.length,
    };
  } catch (error) {
    console.error('[inquiries] 목록 조회 실패:', error);
    return { inquiries: [], total: 0 };
  }
}

/**
 * 상태별 문의 건수.
 * ★ 행을 가져와 세지 않고 상태마다 count 쿼리를 던져 한 번에 기다립니다.
 */
export async function countInquiriesByStatus(
  filter: InquiryCountFilter = {}
): Promise<Record<string, number>> {
  /*
   * ============================================================
   * ★★ 탭 건수도 목록과 같은 조건으로 셉니다 (2026-08-26)
   * ============================================================
   *
   * 회원 화면(lib/profiles.ts 의 countMembersByStatus)과 **똑같이** 고칩니다.
   * 한 곳만 고치면 다른 곳에서 같은 증상이 또 납니다.
   *
   * 전에는 조건을 안 받아서, 검색어를 걸면 목록만 걸러지고 탭에는
   * 전체 숫자가 남았습니다. 탭을 눌러도 검색어는 따라가므로
   * (InquiryTable 의 buildHref) 조건을 안 보는 쪽이 틀린 것입니다.
   *
   * ★ 본보기는 주문 화면입니다. 상태만 빼고 나머지는 그대로 넘깁니다.
   */
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[inquiries] 상태별 건수를 세지 못했습니다: Supabase 연결 정보가 없습니다.');
    return {};
  }

  // ★ 목록과 똑같은 검색식을 씁니다.
  const searchExpression = inquirySearchExpression(filter.search);

  const results = await Promise.all(
    INQUIRY_STATUSES.map(async (status) => {
      let query = supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      if (searchExpression) query = query.or(searchExpression);

      const { count, error, status: httpStatus } = await query;

      /*
       * ★★ 조용히 0 으로 뭉개지 않습니다. (2026-08-26)
       *   "문의가 없다" 와 "못 셌다" 가 화면에서는 똑같이 0 입니다.
       *   왜 0 인지는 로그에만 남길 수 있습니다.
       *
       * ★★ error 만 봐서는 못 잡습니다. head:true 조회는 본문이 없어서
       *   오류가 제대로 안 실려 옵니다. (없는 표 → HTTP 204 · error null)
       *   count 가 비었는지를 기준으로 봅니다.
       *   회원 화면(lib/profiles.ts)과 똑같은 판단 기준입니다.
       */
      if (error || count === null || count === undefined) {
        console.error(
          `[inquiries] 상태별 건수를 세지 못했습니다 (${status}): ` +
            `HTTP ${httpStatus ?? '?'} · ` +
            `${error?.message || '오류 메시지 없음'}` +
            `${error?.code ? ` (code ${error.code})` : ''}`
        );
        return { status, count: 0 };
      }
      return { status, count };
    })
  );

  const result: Record<string, number> = {};
  for (const row of results) {
    if (row.count > 0) result[row.status] = row.count;
  }
  return result;
}

/** 사이드바 뱃지에 쓰는 미답변 건수 */
export async function countPendingInquiries(): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
}

/**
 * 답변 저장.
 *
 * ★ 답변을 넣으면 상태는 항상 '답변완료'가 됩니다.
 *   예전에는 화면이 들고 있던 현재 상태('미답변')를 그대로 같이 보내는 바람에
 *   답변만 저장되고 상태·뱃지 숫자는 그대로 남는 버그가 있었습니다.
 *   '종료(closed)'로 내려 두고 싶을 때만 예외로 그 값을 그대로 씁니다.
 */
export async function answerInquiry(
  id: string,
  answer: string,
  status?: InquiryStatus
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const trimmed = answer.trim();

  const nextStatus: InquiryStatus = trimmed
    ? status === 'closed'
      ? 'closed'
      : 'answered'
    : 'pending';

  const result = await supabase
    .from(TABLE)
    .update({
      answer: trimmed || null,
      answered_at: trimmed ? new Date().toISOString() : null,
      status: nextStatus,
    })
    .eq('id', id)
    .select('id');

  assertWritten(result, '답변을 저장하지 못했습니다');
}

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const result = await supabase
    .from(TABLE)
    .update({ status })
    .eq('id', id)
    .select('id');
  assertWritten(result, '상태를 바꾸지 못했습니다');
}
