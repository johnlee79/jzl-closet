'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import { adminUpdateProfile, getProfile } from '@/lib/profiles';
import { MEMBER_STATUSES, type MemberStatus } from '@/lib/member-status';
import { SITE_URL } from '@/lib/store';
import { createAuthClient } from '@/lib/supabase/auth-server';

/**
 * 관리자 회원 관리 서버 액션.
 *
 * ★ 관리자는 회원 비밀번호를 볼 수도, 직접 바꿀 수도 없습니다.
 *   필요하면 재설정 메일만 보냅니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin/members]', message);
  return { ok: false, error: message };
}

// ★ 화면·집계와 같은 목록을 씁니다. (lib/member-status.ts)
const STATUSES: readonly MemberStatus[] = MEMBER_STATUSES;

export async function updateMemberAction(
  userId: string,
  patch: {
    name: string;
    phone: string;
    email: string;
    postcode: string;
    address1: string;
    address2: string;
    status: string;
    adminMemo: string;
  }
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!patch.name.trim()) return { ok: false, error: '이름은 비울 수 없습니다.' };
  if (!STATUSES.includes(patch.status as MemberStatus)) {
    return { ok: false, error: '알 수 없는 상태입니다.' };
  }

  try {
    await adminUpdateProfile(userId, {
      ...patch,
      status: patch.status as MemberStatus,
    });
    revalidatePath('/admin/members');
    revalidatePath(`/admin/members/${userId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '회원 정보를 저장하지 못했습니다.');
  }
}

/**
 * 비밀번호 재설정 메일 보내기.
 * ★ 관리자가 새 비밀번호를 정하지 않습니다. 회원이 메일 링크로 직접 정합니다.
 */
export async function sendResetMailAction(userId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const profile = await getProfile(userId);
  if (!profile?.email) {
    return { ok: false, error: '이 회원의 이메일이 없어 메일을 보낼 수 없습니다.' };
  }

  /*
   * * 여기만 손님용 클라이언트를 그대로 씁니다. 일부러입니다. (2026-08-26)
   *   관리자 쪽 세션은 전부 createAdminAuthClient() 로 옮겼지만,
   *   이 자리는 resetPasswordForEmail() 만 부릅니다. 세션을 읽지도 쓰지도
   *   않아서 어느 쿠키 칸을 보든 하는 일이 똑같습니다.
   *   빠뜨린 것이 아니라 옮길 이유가 없어서 두었습니다.
   */
  const supabase = createAuthClient();
  if (!supabase) {
    return { ok: false, error: 'Supabase 설정이 없어 메일을 보낼 수 없습니다.' };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${SITE_URL}/auth/callback?next=/reset-password/update`,
  });
  if (error) {
    return { ok: false, error: `메일을 보내지 못했습니다: ${error.message}` };
  }

  return { ok: true, data: undefined };
}
