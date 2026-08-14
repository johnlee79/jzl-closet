import 'server-only';

import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';

/**
 * 회원 정보(profiles) 읽기·쓰기. 서버 전용이며 service_role 로만 접근합니다.
 * 로그인 계정 자체(이메일·비밀번호)는 Supabase 가 auth.users 에 관리합니다.
 */

const TABLE = 'profiles';

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

export function missingProfilesTableError(): Error {
  return new Error(
    'profiles 테이블이 없습니다. supabase/schema-2b.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.'
  );
}

export type MemberStatus = 'active' | 'inactive' | 'withdrawn';

export type Profile = {
  id: string;
  name: string;
  phone: string;
  email: string;
  postcode: string;
  address1: string;
  address2: string;
  status: MemberStatus;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  agreeAge14: boolean;
  agreeMarketing: boolean;
  agreedAt: string | null;
  lastLoginAt: string | null;
  withdrawnAt: string | null;
  adminMemo: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  postcode: string | null;
  address1: string | null;
  address2: string | null;
  status: string | null;
  agree_terms: boolean | null;
  agree_privacy: boolean | null;
  agree_age14: boolean | null;
  agree_marketing: boolean | null;
  agreed_at: string | null;
  last_login_at: string | null;
  withdrawn_at: string | null;
  admin_memo: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function toStatus(value: string | null): MemberStatus {
  return value === 'inactive' || value === 'withdrawn' ? value : 'active';
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    postcode: row.postcode ?? '',
    address1: row.address1 ?? '',
    address2: row.address2 ?? '',
    status: toStatus(row.status),
    agreeTerms: Boolean(row.agree_terms),
    agreePrivacy: Boolean(row.agree_privacy),
    agreeAge14: Boolean(row.agree_age14),
    agreeMarketing: Boolean(row.agree_marketing),
    agreedAt: row.agreed_at,
    lastLoginAt: row.last_login_at,
    withdrawnAt: row.withdrawn_at,
    adminMemo: row.admin_memo ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------
 * 읽기
 * ------------------------------------------------------------------ */

/**
 * profiles 테이블이 준비되어 있는지.
 * ★ 가입을 시작하기 전에 확인합니다. 이걸 건너뛰면 Supabase Auth 에는 계정이
 *   만들어졌는데 프로필은 없는 반쪽짜리 회원이 남습니다.
 */
export async function profilesTableReady(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from(TABLE).select('id').limit(1);
  return !error;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToProfile(data as ProfileRow);
}

/** 가입할 때 같은 이메일이 이미 있는지 확인합니다. */
export async function emailTaken(email: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select('id')
    .ilike('email', email.trim())
    .limit(1);

  if (error) return false;
  return (data ?? []).length > 0;
}

export type MemberFilter = {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

/** 관리자 회원 목록. 주문 수·총 구매금액을 함께 계산해 돌려줍니다. */
export async function getMembers(
  filter: MemberFilter = {}
): Promise<{
  members: (Profile & { orderCount: number; totalSpent: number })[];
  total: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { members: [], total: 0 };

  const term = (filter.search ?? '').replace(/[%,().]/g, '').trim();
  const searchExpression = term
    ? `name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
    : '';

  try {
    let countQuery = supabase.from(TABLE).select('id', { count: 'exact', head: true });
    if (filter.status && filter.status !== 'all') {
      countQuery = countQuery.eq('status', filter.status);
    }
    if (filter.from) countQuery = countQuery.gte('created_at', filter.from);
    if (filter.to) countQuery = countQuery.lte('created_at', filter.to);
    if (searchExpression) countQuery = countQuery.or(searchExpression);

    let listQuery = supabase.from(TABLE).select('*');
    if (filter.status && filter.status !== 'all') {
      listQuery = listQuery.eq('status', filter.status);
    }
    if (filter.from) listQuery = listQuery.gte('created_at', filter.from);
    if (filter.to) listQuery = listQuery.lte('created_at', filter.to);
    if (searchExpression) listQuery = listQuery.or(searchExpression);

    listQuery = listQuery.order('created_at', { ascending: false });
    if (filter.limit !== undefined) {
      const from = filter.offset ?? 0;
      listQuery = listQuery.range(from, from + filter.limit - 1);
    }

    const [countResult, listResult] = await Promise.all([countQuery, listQuery]);

    if (listResult.error) {
      if (!isMissingTable(listResult.error.code)) {
        console.error('[profiles] 목록 조회 실패:', listResult.error.message);
      }
      return { members: [], total: 0 };
    }

    const rows = (listResult.data ?? []) as ProfileRow[];
    const stats = await getOrderStats(rows.map((row) => row.id));

    return {
      members: rows.map((row) => ({
        ...rowToProfile(row),
        orderCount: stats.get(row.id)?.count ?? 0,
        totalSpent: stats.get(row.id)?.amount ?? 0,
      })),
      total: countResult.count ?? rows.length,
    };
  } catch (error) {
    console.error('[profiles] 목록 조회 실패:', error);
    return { members: [], total: 0 };
  }
}

/** 회원별 주문 수와 총 구매금액. 취소·반품·결제실패는 금액에서 뺍니다. */
export async function getOrderStats(
  userIds: string[]
): Promise<Map<string, { count: number; amount: number }>> {
  const result = new Map<string, { count: number; amount: number }>();
  if (userIds.length === 0) return result;

  const supabase = getSupabaseAdmin();
  if (!supabase) return result;

  const { data, error } = await supabase
    .from('orders')
    .select('user_id, total_amount, status')
    .in('user_id', userIds);

  if (error || !data) return result;

  for (const row of data as {
    user_id: string | null;
    total_amount: number | null;
    status: string;
  }[]) {
    if (!row.user_id) continue;
    const current = result.get(row.user_id) ?? { count: 0, amount: 0 };
    current.count += 1;
    if (!['cancelled', 'returned', 'failed'].includes(row.status)) {
      current.amount += row.total_amount ?? 0;
    }
    result.set(row.user_id, current);
  }
  return result;
}

export async function countMembersByStatus(): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};

  const { data, error } = await supabase.from(TABLE).select('status');
  if (error || !data) return {};

  const result: Record<string, number> = {};
  for (const row of data as { status: string | null }[]) {
    const status = toStatus(row.status);
    result[status] = (result[status] ?? 0) + 1;
  }
  return result;
}

/* ------------------------------------------------------------------
 * 쓰기
 * ------------------------------------------------------------------ */

export type ProfileInput = {
  id: string;
  name: string;
  phone: string;
  email: string;
  postcode: string;
  address1: string;
  address2: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  agreeAge14: boolean;
  agreeMarketing: boolean;
};

/** 가입 직후 프로필을 만듭니다. 동의 시각을 함께 남깁니다. */
export async function createProfile(input: ProfileInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(TABLE).upsert(
    {
      id: input.id,
      name: input.name.trim(),
      phone: input.phone.trim() || null,
      email: input.email.trim().toLowerCase(),
      postcode: input.postcode.trim() || null,
      address1: input.address1.trim() || null,
      address2: input.address2.trim() || null,
      status: 'active',
      agree_terms: input.agreeTerms,
      agree_privacy: input.agreePrivacy,
      agree_age14: input.agreeAge14,
      agree_marketing: input.agreeMarketing,
      // ★ 분쟁이 생기면 이 시각이 증거가 됩니다.
      agreed_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    if (isMissingTable(error.code)) throw missingProfilesTableError();
    throw new Error(`회원 정보를 저장하지 못했습니다: ${error.message}`);
  }
}

/**
 * 소셜 로그인(구글)으로 처음 들어온 계정의 프로필을 만들어 줍니다.
 *
 * ★ 구글은 약관 동의 화면을 따로 거치지 않습니다.
 *   그래서 로그인 버튼 아래에 "가입 시 이용약관과 개인정보처리방침에 동의하는
 *   것으로 간주됩니다" 를 표시하고, 여기서 필수 동의 세 가지를 true 로 남깁니다.
 *   동의 시각도 함께 기록해 두어야 나중에 근거가 됩니다.
 *
 * ★ 이미 프로필이 있으면 건드리지 않습니다.
 *   (이메일로 가입했던 계정에 구글을 연결한 경우 — 기존 이름·연락처를 지우면 안 됩니다)
 *   다만 비어 있는 이름·이메일만 조용히 채웁니다.
 *
 * @returns 새로 만들었으면 true
 */
export async function ensureProfile(input: {
  id: string;
  email: string;
  /** 구글이 준 이름. 없으면 이메일 앞부분을 씁니다. */
  name?: string;
}): Promise<boolean> {
  const supabase = requireSupabaseAdmin();
  const email = input.email.trim().toLowerCase();
  const name = (input.name ?? '').trim() || email.split('@')[0] || '회원';

  const existing = await getProfile(input.id);

  if (existing) {
    // 비어 있는 칸만 채웁니다. 이미 적혀 있는 값은 그대로 둡니다.
    const patch: Record<string, unknown> = {};
    if (!existing.name) patch.name = name;
    if (!existing.email && email) patch.email = email;

    if (Object.keys(patch).length > 0) {
      await supabase.from(TABLE).update(patch).eq('id', input.id);
    }
    return false;
  }

  const { error } = await supabase.from(TABLE).insert({
    id: input.id,
    name,
    email,
    status: 'active',
    agree_terms: true,
    agree_privacy: true,
    agree_age14: true,
    agree_marketing: false,
    agreed_at: new Date().toISOString(),
  });

  if (error) {
    if (isMissingTable(error.code)) throw missingProfilesTableError();
    // 같은 순간에 두 번 들어와 이미 만들어졌을 수 있습니다. 그건 오류가 아닙니다.
    if (error.code === '23505') return false;
    throw new Error(`회원 정보를 만들지 못했습니다: ${error.message}`);
  }
  return true;
}

/** 회원이 직접 고치는 항목만 받습니다. status·admin_memo 는 여기서 못 바꿉니다. */
export async function updateProfile(
  userId: string,
  patch: {
    name?: string;
    phone?: string;
    postcode?: string;
    address1?: string;
    address2?: string;
    agreeMarketing?: boolean;
  }
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.phone !== undefined) row.phone = patch.phone.trim() || null;
  if (patch.postcode !== undefined) row.postcode = patch.postcode.trim() || null;
  if (patch.address1 !== undefined) row.address1 = patch.address1.trim() || null;
  if (patch.address2 !== undefined) row.address2 = patch.address2.trim() || null;
  if (patch.agreeMarketing !== undefined) row.agree_marketing = patch.agreeMarketing;

  const { error } = await supabase.from(TABLE).update(row).eq('id', userId);
  if (error) throw new Error(`회원 정보를 수정하지 못했습니다: ${error.message}`);
}

/** 관리자용 — 상태와 메모까지 고칠 수 있습니다. */
export async function adminUpdateProfile(
  userId: string,
  patch: {
    name?: string;
    phone?: string;
    email?: string;
    postcode?: string;
    address1?: string;
    address2?: string;
    status?: MemberStatus;
    adminMemo?: string;
  }
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.phone !== undefined) row.phone = patch.phone.trim() || null;
  if (patch.email !== undefined) row.email = patch.email.trim().toLowerCase() || null;
  if (patch.postcode !== undefined) row.postcode = patch.postcode.trim() || null;
  if (patch.address1 !== undefined) row.address1 = patch.address1.trim() || null;
  if (patch.address2 !== undefined) row.address2 = patch.address2.trim() || null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.adminMemo !== undefined) row.admin_memo = patch.adminMemo.trim() || null;

  const { error } = await supabase.from(TABLE).update(row).eq('id', userId);
  if (error) throw new Error(`회원 정보를 수정하지 못했습니다: ${error.message}`);
}

export async function touchLastLogin(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  // 로그인 시각 기록이 실패해도 로그인 자체를 막지 않습니다.
  await supabase
    .from(TABLE)
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
}

/**
 * 탈퇴.
 * ★ 주문 내역은 지우지 않습니다. 전자상거래법상 거래기록은 5년 보관 의무가 있습니다.
 *   개인정보 필드만 마스킹하고 status 를 withdrawn 으로 바꿉니다.
 */
export async function withdrawProfile(userId: string, reason: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from(TABLE)
    .update({
      name: '탈퇴회원',
      phone: null,
      email: null,
      postcode: null,
      address1: null,
      address2: null,
      status: 'withdrawn',
      withdrawn_at: now,
      agree_marketing: false,
      admin_memo: reason.trim() ? `[탈퇴 사유] ${reason.trim()}` : '[탈퇴]',
    })
    .eq('id', userId);

  if (error) throw new Error(`탈퇴 처리에 실패했습니다: ${error.message}`);
}
