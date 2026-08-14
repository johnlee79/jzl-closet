'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  createProfile,
  emailTaken,
  getProfile,
  profilesTableReady,
  touchLastLogin,
} from '@/lib/profiles';
import { earnSignupPoints } from '@/lib/points';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { SITE_URL } from '@/lib/store';
import { createAuthClient } from '@/lib/supabase/auth-server';

/**
 * 회원가입 · 로그인 · 비밀번호 재설정.
 *
 * 인증은 Supabase Auth(이메일 + 비밀번호)를 씁니다.
 * 소셜 로그인(카카오 등)은 이번 범위가 아닙니다. 나중에 붙일 때는
 * signInWithOAuth 를 부르는 액션을 여기에 하나 더 만들면 됩니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  /** needsVerification 이 true 면 인증 메일을 아직 누르지 않은 계정입니다. */
  | { ok: false; error: string; needsVerification?: boolean };

/**
 * 비밀번호 규칙 — 8자 이상, 영문과 숫자를 모두 포함.
 * ★ 'use server' 파일에서는 async 함수만 내보낼 수 있어 상수를 export 하지 않습니다.
 *   화면에 보여 주는 규칙 안내는 각 폼 컴포넌트가 직접 들고 있습니다.
 */
function checkPassword(password: string): string | null {
  if (password.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (!/[A-Za-z]/.test(password)) return '비밀번호에 영문을 포함해 주세요.';
  if (!/[0-9]/.test(password)) return '비밀번호에 숫자를 포함해 주세요.';
  return null;
}

function checkEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? null
    : '이메일 주소를 다시 확인해 주세요.';
}

function noAuth(): { ok: false; error: string } {
  return {
    ok: false,
    error:
      '로그인 기능이 아직 설정되지 않았습니다. .env.local 의 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 확인해 주세요.',
  };
}

/* ------------------------------------------------------------------
 * 이메일 중복 확인
 * ------------------------------------------------------------------ */

export async function checkEmailAction(
  email: string
): Promise<ActionResult<{ available: boolean }>> {
  const problem = checkEmail(email);
  if (problem) return { ok: false, error: problem };

  // 이메일을 하나씩 넣어 가입 여부를 캐내는 시도를 늦춥니다.
  const limited = rateLimit(`email-check:${clientIp(headers())}`, 20, 60_000);
  if (!limited.ok) {
    return { ok: false, error: '확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' };
  }

  return { ok: true, data: { available: !(await emailTaken(email)) } };
}

/* ------------------------------------------------------------------
 * 회원가입
 * ------------------------------------------------------------------ */

export type SignupInput = {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  agreeAge14: boolean;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  agreeMarketing: boolean;
};

export async function signupAction(
  input: SignupInput
): Promise<ActionResult<{ loggedIn: boolean }>> {
  const limited = rateLimit(`signup:${clientIp(headers())}`, 5, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `요청이 너무 많습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  const emailProblem = checkEmail(input.email);
  if (emailProblem) return { ok: false, error: emailProblem };

  const passwordProblem = checkPassword(input.password);
  if (passwordProblem) return { ok: false, error: passwordProblem };

  if (input.password !== input.passwordConfirm) {
    return { ok: false, error: '비밀번호가 서로 다릅니다.' };
  }
  if (!input.name.trim()) return { ok: false, error: '이름을 입력해 주세요.' };

  // ★ 필수 동의가 하나라도 빠지면 가입할 수 없습니다.
  if (!input.agreeAge14) return { ok: false, error: '만 14세 이상 확인에 동의해 주세요.' };
  if (!input.agreeTerms) return { ok: false, error: '이용약관에 동의해 주세요.' };
  if (!input.agreePrivacy) {
    return { ok: false, error: '개인정보 수집·이용에 동의해 주세요.' };
  }

  // ★ 계정을 만들기 전에 profiles 테이블부터 확인합니다.
  //   순서를 바꾸면 Auth 에만 계정이 남는 반쪽짜리 회원이 생깁니다.
  if (!(await profilesTableReady())) {
    return {
      ok: false,
      error:
        '회원 기능이 아직 준비되지 않았습니다. supabase/schema-2b.sql 을 실행한 뒤 다시 시도해 주세요. (회원가입 없이도 주문하실 수 있습니다)',
    };
  }

  const email = input.email.trim().toLowerCase();
  if (await emailTaken(email)) {
    return { ok: false, error: '이미 가입된 이메일입니다. 로그인해 주세요.' };
  }

  const supabase = createAuthClient();
  if (!supabase) return noAuth();

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      // 이메일 인증을 켜 둔 경우 확인 링크가 이 주소로 옵니다.
      emailRedirectTo: `${SITE_URL}/auth/callback?next=/mypage`,
      data: { name: input.name.trim() },
    },
  });

  if (error) {
    // Supabase 가 돌려주는 영문 메시지를 그대로 보여 주지 않습니다.
    const message = /already registered|already exists/i.test(error.message)
      ? '이미 가입된 이메일입니다. 로그인해 주세요.'
      : `가입에 실패했습니다: ${error.message}`;
    return { ok: false, error: message };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { ok: false, error: '가입 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  try {
    await createProfile({
      id: userId,
      name: input.name,
      phone: input.phone,
      email,
      postcode: input.postcode,
      address1: input.address1,
      address2: input.address2,
      agreeTerms: input.agreeTerms,
      agreePrivacy: input.agreePrivacy,
      agreeAge14: input.agreeAge14,
      agreeMarketing: input.agreeMarketing,
    });
  } catch (profileError) {
    const message =
      profileError instanceof Error
        ? profileError.message
        : '회원 정보를 저장하지 못했습니다.';
    return { ok: false, error: message };
  }

  // 회원가입 축하 포인트 — 실패해도 가입은 그대로 진행됩니다.
  await earnSignupPoints(userId);

  // 이메일 인증이 꺼져 있으면 여기서 이미 세션이 생겨 자동 로그인 상태입니다.
  // 켜져 있으면 세션이 없고, 손님은 메일의 링크를 눌러야 합니다.
  const loggedIn = Boolean(data.session);
  if (loggedIn) await touchLastLogin(userId);

  revalidatePath('/', 'layout');
  return { ok: true, data: { loggedIn } };
}

/* ------------------------------------------------------------------
 * 로그인
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
 * 구글 간편로그인
 *
 * 클라이언트 ID / Secret 은 Supabase 대시보드에만 있습니다. 코드에 넣지 않습니다.
 * 여기서는 구글 동의 화면 주소만 받아 돌려주고, 실제 이동은 브라우저가 합니다.
 * (이 액션이 응답하면서 PKCE 검증용 쿠키가 함께 심어집니다)
 * ------------------------------------------------------------------ */

/** 사이트 안쪽 주소만 허용합니다. 열린 리다이렉트를 막습니다. */
function safeNext(value: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/mypage';
  return value;
}

export async function signInWithGoogleAction(
  next: string
): Promise<ActionResult<{ url: string }>> {
  const supabase = createAuthClient();
  if (!supabase) return noAuth();

  const target = safeNext(next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(target)}`,
      queryParams: {
        // 계정을 고를 수 있게 합니다. (기기를 함께 쓰는 경우를 위해)
        prompt: 'select_account',
      },
    },
  });

  if (error || !data?.url) {
    console.error('[auth] 구글 로그인 시작 실패:', error?.message);
    return {
      ok: false,
      error:
        '구글 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주시거나 이메일로 로그인해 주세요.',
    };
  }

  return { ok: true, data: { url: data.url } };
}

/* ------------------------------------------------------------------
 * 로그인
 * ------------------------------------------------------------------ */

export async function loginAction(
  email: string,
  password: string
): Promise<ActionResult<{ withdrawn: boolean }>> {
  // ★ 5회 연속 실패하면 1분간 막습니다.
  const ip = clientIp(headers());
  const key = `login:${ip}`;
  const limited = rateLimit(key, 5, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `로그인 시도가 5회를 넘었습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  const supabase = createAuthClient();
  if (!supabase) return noAuth();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) {
    // 인증 메일을 아직 누르지 않은 경우만 따로 안내합니다.
    // (Supabase 가 "Email not confirmed" 로 알려 줍니다)
    if (error && /email not confirmed|not confirmed/i.test(error.message)) {
      return {
        ok: false,
        error: '이메일 인증이 완료되지 않았습니다.',
        needsVerification: true,
      };
    }
    // ★ 그 밖에는 어느 쪽이 틀렸는지 알려 주지 않습니다. 가입 여부가 노출됩니다.
    return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  const profile = await getProfile(data.user.id);
  if (profile?.status === 'withdrawn') {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: '탈퇴한 계정입니다. 새로 가입해 주시거나 고객센터로 문의해 주세요.',
    };
  }
  if (profile?.status === 'inactive') {
    await supabase.auth.signOut();
    return { ok: false, error: '이용이 제한된 계정입니다. 고객센터로 문의해 주세요.' };
  }

  await touchLastLogin(data.user.id);
  revalidatePath('/', 'layout');
  return { ok: true, data: { withdrawn: false } };
}

/**
 * 인증 메일 다시 보내기.
 * ★ 가입 여부를 알려 주지 않기 위해 결과와 상관없이 같은 답을 합니다.
 *   (이미 인증을 마친 계정이면 Supabase 가 메일을 보내지 않습니다)
 */
export async function resendVerificationAction(email: string): Promise<ActionResult> {
  // 메일 폭탄을 막습니다. 화면에서도 60초 동안 버튼을 잠급니다.
  const limited = rateLimit(`resend:${clientIp(headers())}`, 5, 5 * 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `재전송 요청이 너무 많습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  const problem = checkEmail(email);
  if (problem) return { ok: false, error: problem };

  const supabase = createAuthClient();
  if (!supabase) return noAuth();

  await supabase.auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=/mypage` },
  });

  return { ok: true, data: undefined };
}

export async function logoutAction(): Promise<ActionResult> {
  const supabase = createAuthClient();
  if (supabase) await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/* ------------------------------------------------------------------
 * 비밀번호 재설정
 * ------------------------------------------------------------------ */

/** 재설정 메일을 보냅니다. 가입 여부를 알려 주지 않도록 항상 성공으로 답합니다. */
export async function requestPasswordResetAction(email: string): Promise<ActionResult> {
  const limited = rateLimit(`reset:${clientIp(headers())}`, 5, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `요청이 너무 많습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  const problem = checkEmail(email);
  if (problem) return { ok: false, error: problem };

  const supabase = createAuthClient();
  if (!supabase) return noAuth();

  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${SITE_URL}/auth/callback?next=/reset-password/update`,
  });

  // ★ 가입한 이메일인지 알려 주지 않기 위해 결과와 상관없이 같은 답을 합니다.
  return { ok: true, data: undefined };
}

/** 메일 링크로 들어와 새 비밀번호를 정합니다. (링크로 이미 세션이 생긴 상태) */
export async function updatePasswordAction(
  password: string,
  passwordConfirm: string
): Promise<ActionResult> {
  const problem = checkPassword(password);
  if (problem) return { ok: false, error: problem };
  if (password !== passwordConfirm) {
    return { ok: false, error: '비밀번호가 서로 다릅니다.' };
  }

  const supabase = createAuthClient();
  if (!supabase) return noAuth();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return {
      ok: false,
      error: '재설정 링크가 만료되었습니다. 비밀번호 찾기를 다시 시도해 주세요.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: `비밀번호를 바꾸지 못했습니다: ${error.message}` };

  revalidatePath('/', 'layout');
  return { ok: true, data: undefined };
}

/** 마이페이지에서 비밀번호 변경 — 현재 비밀번호를 먼저 확인합니다. */
export async function changePasswordAction(
  currentPassword: string,
  password: string,
  passwordConfirm: string
): Promise<ActionResult> {
  const problem = checkPassword(password);
  if (problem) return { ok: false, error: problem };
  if (password !== passwordConfirm) {
    return { ok: false, error: '새 비밀번호가 서로 다릅니다.' };
  }

  const supabase = createAuthClient();
  if (!supabase) return noAuth();

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) return { ok: false, error: '로그인이 필요합니다.' };

  // ★ 현재 비밀번호를 다시 대조합니다. 자리를 비운 사이 남이 바꾸는 것을 막습니다.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError) {
    return { ok: false, error: '현재 비밀번호가 올바르지 않습니다.' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: `비밀번호를 바꾸지 못했습니다: ${error.message}` };

  return { ok: true, data: undefined };
}
