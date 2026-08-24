import 'server-only';
import { assertWritten } from '@/lib/db-write';

import { toProvider, type AuthProvider } from '@/lib/auth-provider';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';
import { notifyProfileFillFailed } from '@/lib/telegram';

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

// 가입 경로 판단은 클라이언트 컴포넌트에서도 필요해 lib/auth-provider.ts 로 뺐습니다.
export { SOCIAL_PROVIDERS, isSocialProvider, providerLabel } from '@/lib/auth-provider';
export type { AuthProvider } from '@/lib/auth-provider';

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
  /** 보유 포인트. 바꿀 때는 lib/points.ts 의 changePoints 만 씁니다. */
  pointBalance: number;
  /** 30일 안에 소멸될 포인트. DB 가 미리 채워 둔 값을 그대로 읽습니다. */
  pointExpiringSoon: number;
  /** 가입 경로. google·kakao·naver 면 비밀번호 화면을 보여 주지 않습니다. */
  provider: AuthProvider;
  /** 생일 (YYYY-MM-DD). 생일 축하 포인트에 씁니다. */
  birthday: string;
  /** 생일 포인트를 마지막으로 받은 연도 */
  birthdayPointYear: number | null;
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
  /** 3-A 에서 추가한 컬럼. 아직 없을 수 있어 선택 항목으로 둡니다. */
  point_balance?: number | null;
  /** 3-B 에서 추가한 컬럼들. 마찬가지로 선택 항목입니다. */
  point_expiring_soon?: number | null;
  provider?: string | null;
  birthday?: string | null;
  birthday_point_year?: number | null;
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
    pointBalance: row.point_balance ?? 0,
    pointExpiringSoon: row.point_expiring_soon ?? 0,
    provider: toProvider(row.provider),
    birthday: row.birthday ?? '',
    birthdayPointYear: row.birthday_point_year ?? null,
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

/**
 * 상태별 회원 수.
 * ★ 행을 가져와 세지 않고 상태마다 count 쿼리를 던집니다.
 */
export async function countMembersByStatus(): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};

  const statuses: MemberStatus[] = ['active', 'inactive', 'withdrawn'];

  const results = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      return { status, count: error ? 0 : (count ?? 0) };
    })
  );

  const result: Record<string, number> = {};
  for (const row of results) {
    if (row.count > 0) result[row.status] = row.count;
  }
  return result;
}

/**
 * 이메일로 가입 경로만 확인합니다.
 *
 * ★ 비밀번호 찾기 화면에서 씁니다.
 *   회원이 아니면 null 을 돌려주지만, 화면에서는 그 사실을 절대 알려 주지 않습니다.
 *   (가입 여부가 새어 나가면 계정 목록을 긁어 갈 수 있습니다)
 *   간편가입일 때만 "소셜로 로그인하세요" 안내를 예외적으로 보여 줍니다.
 */
export async function getProviderByEmail(email: string): Promise<AuthProvider | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('provider, status')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { provider: string | null; status: string | null };
  if (toStatus(row.status) === 'withdrawn') return null;
  return toProvider(row.provider);
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
  /** 비워 두면 이메일 가입으로 봅니다. */
  provider?: AuthProvider;
  birthday?: string;
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
      provider: input.provider ?? 'email',
      birthday: input.birthday?.trim() || null,
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
  /** 어느 소셜로 들어왔는지. 비워 두면 google 로 봅니다. */
  provider?: AuthProvider;
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
    // 이메일로 가입했다가 소셜을 붙인 계정은 provider 를 바꾸지 않습니다.
    // (비밀번호가 이미 있으므로 비밀번호 변경 화면이 계속 필요합니다)

    if (Object.keys(patch).length > 0) {
      /*
       * ★★ 결과를 확인합니다. 예전에는 보내 놓고 그냥 넘어갔습니다.
       *   실패해도 아무도 몰랐습니다. 이름이 빈 채로 남은 회원이 생기고,
       *   주문서가 미리 채워지지 않고, 문의에 답할 때 부를 이름이 없습니다.
       *
       * ★ 실패해도 로그인은 막지 않습니다. 본인 확인은 이미 끝났습니다.
       *   이름을 못 채웠다는 이유로 못 들어가게 하면 그게 더 큰 문제입니다.
       *   대신 반드시 알려서 사람이 채워 넣을 수 있게 합니다.
       *
       * ★ select('id') 를 붙여야 몇 줄이 바뀌었는지 알 수 있습니다.
       *   붙이지 않으면 한 줄도 못 바꿨을 때도 error 가 null 로 옵니다.
       */
      const { data, error } = await supabase
        .from(TABLE)
        .update(patch)
        .eq('id', input.id)
        .select('id');

      const failed = error
        ? error.message
        : !data || data.length === 0
          ? '해당 회원 행을 찾지 못했습니다.'
          : '';

      if (failed) {
        console.error('[profiles] 소셜 로그인 회원 정보 보정 실패:', input.id, failed);
        await notifyProfileFillFailed(input.id, email, failed);
      }
    }
    return false;
  }

  const { error } = await supabase.from(TABLE).insert({
    id: input.id,
    name,
    email,
    status: 'active',
    provider: input.provider ?? 'google',
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
    birthday?: string;
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
  if (patch.birthday !== undefined) row.birthday = patch.birthday.trim() || null;

  assertWritten(
    await supabase.from(TABLE).update(row).eq('id', userId).select('id'),
    '회원 정보를 수정하지 못했습니다'
  );
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
    birthday?: string;
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
  if (patch.birthday !== undefined) row.birthday = patch.birthday.trim() || null;

  assertWritten(
    await supabase.from(TABLE).update(row).eq('id', userId).select('id'),
    '회원 정보를 수정하지 못했습니다'
  );
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
 * 탈퇴 — 개인정보는 지우고 거래 기록은 남깁니다.
 *
 * ★ 주문 내역은 삭제하지 않습니다. 전자상거래법상 거래기록은 5년 보관 의무가 있습니다.
 *   또 JZL CLOSET 은 위탁배송 구조라, 이미 발송 요청이 나간 주문의 정보가 사라지면
 *   배송 사고에 대응할 수 없습니다.
 *
 * 처리 내용
 *   · 회원 계정: 이름·연락처·주소·이메일을 지우고 status 를 withdrawn 으로 (로그인 차단)
 *   · 주문 기록: 주문번호·금액·상품·일자는 그대로 두고 이름·연락처·주소만 마스킹
 *   · 리뷰: 글은 남기고 작성자명만 '탈퇴회원' 으로
 *   · 포인트: 잔액을 0 으로 소멸 (복구 불가)
 */
export async function withdrawProfile(userId: string, reason: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const now = new Date().toISOString();

  // 1) 보유 포인트 소멸 — 잔액과 내역을 함께 남기기 위해 DB 함수를 씁니다.
  const before = await getProfile(userId);
  if (before && before.pointBalance > 0) {
    try {
      await supabase.rpc('apply_point_change', {
        p_user_id: userId,
        p_amount: -before.pointBalance,
        p_reason: 'withdraw',
        p_memo: '탈퇴로 소멸',
      });
    } catch {
      // 포인트 소멸이 실패해도 탈퇴 자체는 막지 않습니다. (로그인은 아래에서 차단됩니다)
    }
  }

  // 2) 주문 기록 익명화 — 금액·상품·일자는 그대로 둡니다.
  await supabase
    .from('orders')
    .update({
      // ★ orderer_phone · receiver_phone 은 not null 컬럼이라 빈 문자열로 지웁니다.
      orderer_name: '탈퇴회원',
      orderer_phone: '',
      orderer_email: null,
      receiver_name: '탈퇴회원',
      receiver_phone: '',
      address2: null,
      delivery_memo: null,
    })
    .eq('user_id', userId);

  // 3) 리뷰는 남기고 작성자명만 가립니다.
  await supabase.from('reviews').update({ writer_name: '탈퇴회원' }).eq('user_id', userId);

  // 4) 문의도 같은 방식으로 가립니다.
  await supabase
    .from('inquiries')
    .update({ writer_name: '탈퇴회원', writer_phone: null, writer_email: null })
    .eq('user_id', userId);

  // 5) 회원 계정
  assertWritten(
    await supabase
      .from(TABLE)
      .update({
        name: '탈퇴회원',
        phone: null,
        email: null,
        postcode: null,
        address1: null,
        address2: null,
        birthday: null,
        status: 'withdrawn',
        withdrawn_at: now,
        agree_marketing: false,
        point_balance: 0,
        point_expiring_soon: 0,
        admin_memo: reason.trim() ? `[탈퇴 사유] ${reason.trim()}` : '[탈퇴]',
      })
      .eq('id', userId)
      .select('id'),
    '탈퇴 처리에 실패했습니다'
  );
}
