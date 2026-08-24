import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';
import { ADMIN_COOKIE, isAdminEmail, verifySessionToken } from '@/lib/admin-auth';
import { createAuthClient } from '@/lib/supabase/auth-server';

/**
 * ============================================================
 * 관리자인지 확인하는 단 하나의 문
 * ============================================================
 *
 * ★★ 왜 한 곳으로 모았는가
 *   예전에는 똑같은 3줄짜리 assertAdmin 이 서버 액션 파일 9곳에 복사되어
 *   있었고, /api/admin/* 8곳은 또 각자 인라인으로 같은 검사를 하고 있었습니다.
 *   전부 17벌입니다. 방식을 바꿀 때 하나라도 빠뜨리면 그게 그대로 구멍입니다.
 *   막는 방법이 여럿인 것보다, 하나뿐이고 그게 확실한 편이 낫습니다.
 *
 * ★★ 두 가지 길을 모두 인정합니다. (전환 중)
 *
 *   1) 옛 길 — 비밀번호 하나로 받은 서명 쿠키 (jzl_admin_session)
 *   2) 새 길 — Supabase 로그인 + 이메일이 ADMIN_EMAILS 목록에 있음
 *
 *   둘 중 하나만 통과해도 관리자입니다. 전환하는 동안 어느 쪽으로도
 *   들어갈 수 있어야 잠기는 일이 없습니다.
 *   옛 길은 4단계에서 지웁니다. 이 파일과 middleware 두 곳만 고치면 됩니다.
 *
 * ★★ 순서가 중요합니다. 옛 쿠키를 먼저 봅니다.
 *   그쪽은 네트워크를 쓰지 않는 계산이라 즉시 끝납니다.
 *   Supabase 확인은 매번 Supabase 서버에 물어보는 왕복이 있습니다.
 *   옛 쿠키로 이미 들어와 있는 동안에는 그 왕복이 아예 일어나지 않습니다.
 *
 * ★ 한 요청 안에서 여러 번 불러도 실제 확인은 한 번만 합니다. (React cache)
 *   한 화면이 액션을 여러 개 부르는 일이 흔합니다.
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  /* ── 1. 옛 길 — 비밀번호로 받은 서명 쿠키 ── */
  if (await verifySessionToken(cookies().get(ADMIN_COOKIE)?.value)) return true;

  /* ── 2. 새 길 — Supabase 로그인 + 관리자 이메일 ── */
  return isAdminBySupabase();
});

/**
 * Supabase 로 로그인한 사람이 관리자 이메일인지.
 *
 * ★ 로그인 자체는 손님과 같은 구조를 씁니다. 관리자용 회원가입을 따로
 *   만들지 않습니다. 관리자 계정도 Supabase 계정 하나일 뿐이고,
 *   "관리자인가" 는 오직 환경변수 목록이 정합니다.
 *
 * ★ getUser() 를 씁니다. getSession() 이 아닙니다.
 *   getSession 은 쿠키에 든 토큰을 그대로 믿습니다. getUser 는 Supabase
 *   서버에 다시 물어 확인합니다. 관리자 문에서 쿠키만 믿으면 안 됩니다.
 *
 * ★ 실패는 전부 "관리자 아님" 입니다. 조용히 false 를 돌려줍니다.
 */
async function isAdminBySupabase(): Promise<boolean> {
  const supabase = createAuthClient();
  if (!supabase) return false;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return false;
    return isAdminEmail(data.user.email);
  } catch {
    return false;
  }
}

/**
 * 서버 액션에서 쓰는 형태.
 *
 * ★ 관리자가 아니면 결과 객체를 돌려줍니다. 예외를 던지지 않습니다.
 *   액션은 화면에 메시지를 보여 줘야 하는데, 예외를 던지면 그 자리가
 *   빈 오류 화면으로 바뀝니다. 쓰던 내용도 함께 사라집니다.
 */
export async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
  if (await isAdmin()) return null;
  return { ok: false, error: '로그인이 필요합니다. 다시 로그인해 주세요.' };
}
