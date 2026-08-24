'use server';

import { headers } from 'next/headers';
import { isAdminEmail, isAdminEmailConfigured } from '@/lib/admin-auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { createAuthClient } from '@/lib/supabase/auth-server';

/**
 * ============================================================
 * 관리자 이메일 로그인 (2단계)
 * ============================================================
 *
 * ★★ 관리자 전용 계정 체계를 따로 만들지 않습니다.
 *   Supabase 계정 하나일 뿐이고, "관리자인가" 는 오직 ADMIN_EMAILS 목록이
 *   정합니다. DB 에 is_admin 같은 칸을 두지 않았으므로, DB 에 쓸 수 있게 되어도
 *   스스로를 관리자로 만들 수 없습니다.
 *
 * ★★ 목록에 없는 이메일은 Supabase 에 물어보지도 않습니다.
 *   물어보면 이 화면이 "이 이메일·비밀번호가 맞는지" 알려 주는 도구가 됩니다.
 *   손님 계정 비밀번호를 여기서 시험할 수 있게 되는 셈입니다.
 *   관리자 목록에 있는 이메일일 때만 인증을 시도합니다.
 *
 * ★ 로그인에 성공하면 Supabase 세션 쿠키가 심어집니다.
 *   관리자 전용 쿠키(jzl_admin_session)는 발급하지 않습니다.
 *   middleware 와 lib/admin-guard.ts 가 그 세션을 보고 판단합니다.
 *
 * ★ 옛 비밀번호 로그인(/api/admin/login)은 그대로 살아 있습니다.
 *   둘 중 아무거나로 들어갈 수 있습니다. 옛 길은 4단계에서 닫습니다.
 */

export type LoginResult = { ok: true } | { ok: false; error: string };

/** 손님 로그인과 같은 기준입니다. (1분에 5회) */
const LIMIT = 5;
const WINDOW_MS = 60_000;

export async function adminEmailLoginAction(
  email: string,
  password: string
): Promise<LoginResult> {
  /*
   * ★ 비밀번호를 다루기 전에 겁니다.
   *   옛 비밀번호 로그인과 같은 저장소를 쓰므로, 두 방식을 번갈아 두드려도
   *   합쳐서 5회입니다. 한쪽만 막으면 다른 쪽으로 계속 두드릴 수 있습니다.
   */
  const limited = rateLimit(`admin-login:${clientIp(headers())}`, LIMIT, WINDOW_MS);
  if (!limited.ok) {
    return {
      ok: false,
      error: `로그인 시도가 ${LIMIT}회를 넘었습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  if (!isAdminEmailConfigured()) {
    return {
      ok: false,
      error:
        'ADMIN_EMAILS 가 설정되지 않았습니다. 배포 환경의 환경변수에 관리자 이메일을 넣어 주세요. 그때까지는 아래 비밀번호로 들어오실 수 있습니다.',
    };
  }

  const address = email.trim().toLowerCase();

  /*
   * ★★ 목록에 없으면 여기서 끝냅니다. Supabase 에 묻지 않습니다.
   *   메시지는 비밀번호가 틀렸을 때와 똑같이 둡니다. 어느 이메일이
   *   관리자인지 알려 주지 않기 위해서입니다.
   */
  if (!isAdminEmail(address)) {
    return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  const supabase = createAuthClient();
  if (!supabase) {
    return { ok: false, error: '로그인 설정이 아직 준비되지 않았습니다.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: address,
    password,
  });

  if (error || !data.user) {
    /*
     * ★ 인증 메일을 아직 안 누른 경우만 따로 안내합니다.
     *   관리자가 이 벽에 막히면 들어올 방법이 없어지므로,
     *   무엇을 해야 하는지 정확히 알려 줍니다.
     */
    if (error && /email not confirmed|not confirmed/i.test(error.message)) {
      return {
        ok: false,
        error:
          '이 계정의 이메일 인증이 아직 확인되지 않았습니다. Supabase 콘솔 > Authentication > Users 에서 해당 계정을 열어 확인 처리해 주세요. 그때까지는 아래 비밀번호로 들어오실 수 있습니다.',
      };
    }
    return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  /*
   * ★ 로그인은 됐는데 목록에 없는 경우 — 위에서 걸렀으므로 여기 올 일은
   *   거의 없습니다. 다만 목록이 바뀌는 순간에 걸릴 수 있어 한 번 더 봅니다.
   *   그때는 세션을 지워 손님으로도 남지 않게 합니다.
   */
  if (!isAdminEmail(data.user.email)) {
    await supabase.auth.signOut();
    return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  return { ok: true };
}

/**
 * 관리자 로그아웃.
 *
 * ★★ 두 가지 길로 들어올 수 있으므로 나갈 때도 둘 다 정리합니다.
 *   옛 쿠키만 지우면 Supabase 세션이 살아 있어 그대로 다시 들어가집니다.
 *   Supabase 만 지우면 옛 쿠키가 살아 있어 마찬가지입니다.
 *   "로그아웃했는데 그대로 들어가진다" 는 가장 놀라운 종류의 버그입니다.
 *
 * ★ 옛 쿠키는 /api/admin/login 의 DELETE 가 지웁니다. 화면이 둘 다 부릅니다.
 *   여기서는 Supabase 쪽만 맡습니다.
 */
export async function adminSignOutAction(): Promise<void> {
  const supabase = createAuthClient();
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* 이미 세션이 없으면 할 일이 없습니다. */
  }
}
