import 'server-only';
import { assertWritten } from '@/lib/db-write';

import { isSalesStatus } from '@/lib/order-status';
import { toProvider, type AuthProvider } from '@/lib/auth-provider';
import { MEMBER_STATUSES, isKnownMemberStatus } from '@/lib/member-status';
import type { MemberStatus } from '@/lib/member-status';
import { getSupabaseAdmin, requireSupabaseAdmin, getSupabaseAdminFresh } from '@/lib/supabase/server';
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

/*
 * ★ 회원 상태 목록은 lib/member-status.ts 한 곳에만 있습니다.
 *   화면 파일(클라이언트)도 같은 목록을 써야 해서 그쪽에 두었습니다.
 *   여기서는 그대로 다시 내보내 기존 import 를 깨지 않습니다.
 */
export {
  MEMBER_STATUSES,
  isKnownMemberStatus,
  memberStatusLabel,
  memberStatusBadgeClass,
} from '@/lib/member-status';
export type { MemberStatus } from '@/lib/member-status';

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
  /*
   * ★ DB 에 든 값 그대로입니다. MemberStatus 로 좁히지 않습니다.
   *   좁히면 모르는 값을 어딘가에서 다시 뭉개야 하고, 그게 이 문제였습니다.
   *   아는 값인지 볼 때는 isKnownMemberStatus() 를 쓰세요.
   */
  status: string;
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

/**
 * ============================================================
 * ★★ 모르는 상태값을 「활성」으로 뭉개지 않습니다 (2026-08-26)
 * ============================================================
 *
 * 전에는 이 한 줄이었습니다.
 *     return value === 'inactive' || value === 'withdrawn' ? value : 'active';
 *
 * 'active'·'inactive'·'withdrawn' 이 아닌 값은 **전부 활성**이 됐습니다.
 * NULL 도, 빈 값도, 대문자 'ACTIVE' 도, 아예 모르는 값도 활성이었습니다.
 *
 * 그런데 세는 쪽(countMembersByStatus)은 그 세 값과 **정확히 일치**할 때만
 * 셉니다. 그래서 이상한 값이 든 행이 있으면 이렇게 됩니다.
 *     목록  — 그 행까지 전부 「활성」으로 보임
 *     탭    — 그 행은 안 세어짐
 *   숫자만 어긋나고, 왜 어긋나는지는 화면 어디에도 안 보입니다.
 *
 * ★ 이제 있는 그대로 돌려줍니다. 화면이 빨간 「알 수 없음 · 원래값」
 *   딱지로 보여 줍니다. (lib/member-status.ts 의 memberStatusLabel)
 * ★ 그리고 반드시 로그를 남깁니다. 다음에 이상한 행이 들어오는 순간
 *   Vercel 함수 로그에 바로 드러납니다.
 */
function readStatus(value: string | null, userId: string): string {
  const raw = (value ?? '').trim();
  if (isKnownMemberStatus(raw)) return raw;

  console.error(
    `[members] 모르는 상태값입니다: ${raw === '' ? '(비어 있음)' : `'${raw}'`} — user id ${userId}`
  );
  // ★ 뭉개지 않고 그대로 돌려줍니다. 감추는 것이 이 문제의 원인이었습니다.
  return raw;
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
    status: readStatus(row.status, row.id),
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

  /*
   * ============================================================
   * ★★ 빈 값을 돌려줄 때는 반드시 이유를 남깁니다 (2026-08-25)
   * ============================================================
   *
   * 예전에는 이 한 줄이었습니다.
   *     if (error || !data) return null;
   *
   * DB 조회가 실패한 것과 "그런 회원이 없다" 는 것을 같은 null 로 뭉갰습니다.
   * 이 값이 비면 손님 화면 세 곳이 한꺼번에 어긋납니다.
   *   · 헤더가 "로그인 / 회원가입" 으로 바뀝니다        (api/auth/me 가 이 값을 봅니다)
   *   · 그 로그인을 누르면 미들웨어가 마이페이지로 보냅니다 (미들웨어는 이 값을 안 봅니다)
   *   · 마이페이지는 "이 계정으로는 쓸 수 없습니다" 를 띄웁니다
   * 그런데 왜 비었는지가 아무 데도 남지 않아 원인을 가릴 수 없었습니다.
   *
   * ★ 돌려주는 값은 그대로 null 입니다. 동작은 하나도 바뀌지 않습니다.
   *   로그만 늘립니다.
   *
   * ★ [profile] 로 시작합니다. Vercel 함수 로그에서 이 말로 찾으시면 됩니다.
   */
  if (error) {
    console.error(
      `[profile] 조회 실패 — user id ${userId}:`,
      error.message,
      error.code ? `(code ${error.code})` : ''
    );
    return null;
  }
  if (!data) {
    console.warn(`[profile] 해당 id 의 프로필이 없습니다 — user id ${userId}`);
    return null;
  }
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

/** 목록과 건수가 같은 조건을 보게, 상태·페이지만 뺀 나머지 */
export type MemberCountFilter = Omit<MemberFilter, 'status' | 'limit' | 'offset'>;

/**
 * 검색어를 조회식으로 바꿉니다.
 *
 * ★★ 목록과 건수가 이 함수 하나를 같이 씁니다.
 *   전에는 같은 식이 두 곳에 적혀 있었습니다. 한쪽만 고치면 목록과 탭이
 *   서로 다른 세계를 보게 됩니다. 실제로 그런 일이 있었습니다.
 */
function memberSearchExpression(search: string | undefined): string {
  const term = (search ?? '').replace(/[%,().]/g, '').trim();
  if (!term) return '';
  return `name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`;
}

/** 관리자 회원 목록. 주문 수·총 구매금액을 함께 계산해 돌려줍니다. */
export async function getMembers(
  filter: MemberFilter = {}
): Promise<{
  members: (Profile & { orderCount: number; totalSpent: number })[];
  total: number;
}> {
  /*
   * ★ 관리자 목록은 저장된 답을 쓰지 않는 클라이언트로 읽습니다. (2026-08-26)
   *   회원 목록에 DB 에 없는 사람이 11명 뜬 일이 있었습니다.
   *   까닭은 lib/supabase/server.ts 의 getSupabaseAdminFresh 설명에 있습니다.
   */
  const supabase = getSupabaseAdminFresh();
  if (!supabase) return { members: [], total: 0 };

  const searchExpression = memberSearchExpression(filter.search);

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

/**
 * 회원별 주문 수와 총 구매금액.
 *
 * ★★ 무엇을 매출로 볼지는 lib/order-status.ts 의 isSalesStatus 하나만 씁니다.
 *   (2026-08-25) 여기에 목록을 따로 적어 두고 있었습니다.
 *     ['cancelled', 'returned', 'failed']
 *   그래서 검토필요·승인확인실패 주문이 대시보드 매출에서는 빠지는데
 *   회원 총 구매금액에는 잡혔습니다. 같은 회사가 두 숫자를 말하고 있었습니다.
 *
 *   NON_SALES_STATUSES 위의 주석에 "예전에 목록이 세 곳에 흩어져 있어 매출이
 *   서로 다르게 나와서 모았다" 고 적혀 있는데, 이 한 곳이 안 모아져 있었습니다.
 *   목록을 두 곳에 두면 반드시 또 어긋납니다.
 */
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
    // ★ 주문 수는 전부 셉니다. 금액만 매출 기준으로 거릅니다.
    current.count += 1;
    if (isSalesStatus(row.status)) {
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
export async function countMembersByStatus(
  filter: MemberCountFilter = {}
): Promise<Record<string, number>> {
  /*
   * ============================================================
   * ★★ 탭 건수도 목록과 같은 조건으로 셉니다 (2026-08-26)
   * ============================================================
   *
   * ★★ 무엇이 문제였나
   *   전에는 이 함수가 조건을 아예 받지 않았습니다. 그래서 검색어나
   *   가입기간을 걸어 두면 **목록만 걸러지고 탭 숫자는 전체**를 보여 줬습니다.
   *   화면에 「전체 3」 인데 목록에는 1명만 나옵니다. 어느 쪽을 믿어야
   *   할지 알 수 없습니다.
   *
   *   탭을 눌러도 검색어는 그대로 따라갑니다. (MemberTable 의 buildHref)
   *   그러니 조건을 안 보는 쪽이 틀린 것입니다.
   *
   * ★ 주문 화면이 이미 이 방식입니다. (admin/(dashboard)/orders/page.tsx)
   *   같은 규칙을 따릅니다 — 상태만 빼고 나머지 조건은 전부 그대로.
   *   상태를 빼는 이유는 탭마다 상태가 다르기 때문입니다.
   *   페이지(limit·offset)도 뺍니다. 건수는 페이지와 상관이 없습니다.
   */
  /*
   * ★ 관리자 목록은 저장된 답을 쓰지 않는 클라이언트로 읽습니다. (2026-08-26)
   *   회원 목록에 DB 에 없는 사람이 11명 뜬 일이 있었습니다.
   *   까닭은 lib/supabase/server.ts 의 getSupabaseAdminFresh 설명에 있습니다.
   */
  const supabase = getSupabaseAdminFresh();
  if (!supabase) {
    console.warn('[members] 상태별 인원을 세지 못했습니다: Supabase 연결 정보가 없습니다.');
    return {};
  }

  // ★ 목록과 똑같은 검색식을 씁니다. 두 벌로 두면 반드시 어긋납니다.
  const searchExpression = memberSearchExpression(filter.search);
  // ★ 그리는 쪽과 같은 목록을 씁니다. (lib/member-status.ts)
  const statuses: readonly MemberStatus[] = MEMBER_STATUSES;

  const results = await Promise.all(
    statuses.map(async (status) => {
      let query = supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      if (filter.from) query = query.gte('created_at', filter.from);
      if (filter.to) query = query.lte('created_at', filter.to);
      if (searchExpression) query = query.or(searchExpression);

      const { count, error, status: httpStatus } = await query;

      /*
       * ============================================================
       * ★★ 조용히 0 으로 뭉개지 않습니다 (2026-08-26)
       * ============================================================
       *
       * 전에는 `count: error ? 0 : (count ?? 0)` 한 줄이었습니다.
       * 조회가 실패해도 그냥 0 이 되어 탭이 전부 0 으로 보였습니다.
       * 실제로 그 화면을 봤는데 왜 그런지 알 방법이 없었습니다.
       * ("회원이 없다" 와 "못 셌다" 가 화면에서 똑같이 0 입니다)
       *
       * ★★ error 만 봐서는 못 잡습니다. 실제로 확인한 결과입니다.
       *     없는 표를 조회  → HTTP 204 · count null · **error 는 null**
       *     없는 칼럼을 조회 → HTTP 400 · count null · error.message 가 빈 문자열
       *   head:true 조회는 본문이 없어서 오류가 제대로 안 실려 옵니다.
       *   그래서 **count 가 비었는지**를 기준으로 봅니다. 그게 유일하게
       *   믿을 수 있는 신호입니다. HTTP 상태도 함께 남깁니다.
       */
      if (error || count === null || count === undefined) {
        console.error(
          `[members] 상태별 인원을 세지 못했습니다 (${status}): ` +
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
  // ★ 탈퇴한 계정은 가입 경로를 알려 주지 않습니다.
  //   값을 뭉치지 않고 그대로 비교합니다. (readStatus 와 같은 원칙)
  if ((row.status ?? '').trim() === 'withdrawn') return null;
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
