'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  REF_COOKIE,
  isReferralCode,
  normalizeReferralCode,
} from '@/lib/referral-code';
import { attachReferrer, deviceKeyOf, ipHashOf } from '@/lib/referrals';
import {
  createProfile,
  emailTaken,
  getProfile,
  getProviderByEmail,
  isSocialProvider,
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
 * 인증은 Supabase Auth 를 씁니다.
 *   · 이메일 + 비밀번호
 *   · 간편로그인 — 구글 · 카카오 (아래 startOAuth)
 *
 * 네이버는 Supabase 가 지원하지 않아 아직 없습니다. 직접 붙여야 합니다.
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

/**
 * 가입한 회원에게 추천인을 붙입니다.
 *
 * ★ 코드가 없거나 틀려도 가입은 그대로 성공입니다.
 *   추천은 덤이지 가입 조건이 아닙니다. 여기서 막으면 손님만 잃습니다.
 * ★ 손님이 적어 넣은 코드를 쿠키보다 먼저 씁니다.
 *   링크를 눌러 들어왔더라도, 직접 고쳐 적었다면 그쪽이 손님의 뜻입니다.
 */
async function linkReferrer(userId: string, typed: string): Promise<void> {
  const jar = cookies();
  const fromCookie = jar.get(REF_COOKIE)?.value ?? '';
  const code = normalizeReferralCode(typed) || normalizeReferralCode(fromCookie);
  if (!isReferralCode(code)) return;

  try {
    const head = headers();
    await attachReferrer({
      inviteeId: userId,
      code,
      ipHash: ipHashOf(head),
      deviceKey: deviceKeyOf(head),
    });
  } catch (error) {
    console.warn('[auth] 추천 관계를 남기지 못했습니다:', error);
  }
}

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
  /**
   * 손님이 직접 적어 넣은 추천 코드 (선택).
   * ★ 링크로 들어왔으면 쿠키에도 있습니다. 적어 넣은 값이 있으면 그쪽을 먼저 씁니다.
   *   오프라인에서 코드를 받아 적는 손님이 실제로 있기 때문입니다.
   */
  referralCode?: string;
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

  // 추천 관계 — 실패해도 가입은 그대로 끝냅니다.
  await linkReferrer(userId, input.referralCode ?? '');

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
 * 소셜 간편로그인 (구글 · 카카오)
 *
 * 클라이언트 ID / Secret 은 Supabase 대시보드에만 있습니다. 코드에 넣지 않습니다.
 * 여기서는 동의 화면 주소만 받아 돌려주고, 실제 이동은 브라우저가 합니다.
 * (이 액션이 응답하면서 PKCE 검증용 쿠키가 함께 심어집니다)
 *
 * ★ 두 provider 의 흐름이 완전히 같습니다. 갈라지는 것은 provider 값뿐이라
 *   아래 startOAuth 하나로 모으고 액션은 얇게 둡니다. 한쪽만 고쳐지는 일을 막습니다.
 * ------------------------------------------------------------------ */

/** 사이트 안쪽 주소만 허용합니다. 열린 리다이렉트를 막습니다. */
function safeNext(value: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/mypage';
  return value;
}

async function startOAuth(
  provider: 'google' | 'kakao',
  label: string,
  next: string,
  options?: {
    /** 동의 화면에 덧붙일 값. 없으면 넘기지 않습니다. */
    queryParams?: Record<string, string>;
  }
): Promise<ActionResult<{ url: string }>> {
  const supabase = createAuthClient();
  if (!supabase) return noAuth();

  const target = safeNext(next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(target)}`,
      ...(options?.queryParams ? { queryParams: options.queryParams } : {}),
    },
  });

  if (error || !data?.url) {
    console.error(`[auth] ${label} 로그인 시작 실패:`, error?.message);
    return {
      ok: false,
      error: `${label} 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주시거나 이메일로 로그인해 주세요.`,
    };
  }

  return { ok: true, data: { url: data.url } };
}

export async function signInWithGoogleAction(
  next: string
): Promise<ActionResult<{ url: string }>> {
  // 계정을 고를 수 있게 합니다. (기기를 함께 쓰는 경우를 위해)
  return startOAuth('google', '구글', next, {
    queryParams: { prompt: 'select_account' },
  });
}

/**
 * 카카오 간편로그인.
 *
 * ★ 돌아온 뒤 처리는 구글과 같습니다. app/auth/callback/route.ts 가
 *   app_metadata.provider 를 읽어 profiles.provider 에 'kakao' 로 남깁니다.
 *   그 값 하나로 비밀번호 항목 숨김·비밀번호 찾기 안내·탈퇴 문구 입력이 모두 갈립니다.
 *
 * ★ scope 를 넘기지 않습니다. 넘겨도 소용이 없습니다.
 *   Supabase 는 카카오에 늘 `account_email profile_image profile_nickname` 을 보냅니다.
 *   options.scopes 를 주면 그것을 대신 쓰는 게 아니라 뒤에 이어 붙이기만 합니다.
 *   (실제로 확인함: scope=account_email+profile_image+profile_nickname+profile_nickname+account_email)
 *
 *   ⚠ 그래서 카카오 개발자 콘솔의 동의항목에 **프로필 사진**이 반드시 켜져 있어야 합니다.
 *     닉네임·이메일만 켜 두면 카카오가 동의 화면을 띄우지 않고
 *     KOE205 "잘못된 요청 — 서비스 설정에 오류가 있어 이용할 수 없습니다" 로 되돌립니다.
 *     우리 코드에서는 고칠 수 없는 부분입니다. 콘솔에서 켜 주세요.
 *     (받아 온 사진은 쓰지 않습니다. callback 은 닉네임과 이메일만 읽습니다)
 */
export async function signInWithKakaoAction(
  next: string
): Promise<ActionResult<{ url: string }>> {
  return startOAuth('kakao', '카카오', next);
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
/**
 * 비밀번호 재설정 메일 요청.
 *
 * ★ 가입 여부는 절대 알려 주지 않습니다. 가입하지 않은 주소로 요청해도
 *   "메일을 보냈습니다" 로 똑같이 답합니다. (계정 목록을 긁어 가는 것을 막습니다)
 *
 * ★ 예외 하나 — 간편가입(구글·카카오·네이버) 계정입니다.
 *   이 계정에는 비밀번호가 없어 메일을 보내도 손님이 할 수 있는 일이 없습니다.
 *   그래서 어느 소셜로 가입했는지만 알려 주고 메일은 보내지 않습니다.
 */
export async function requestPasswordResetAction(
  email: string
): Promise<ActionResult<{ socialProvider: string }>> {
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

  const address = email.trim().toLowerCase();

  const provider = await getProviderByEmail(address);
  if (provider && isSocialProvider(provider)) {
    return { ok: true, data: { socialProvider: provider } };
  }

  await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: `${SITE_URL}/auth/callback?next=/reset-password/update`,
  });

  // ★ 가입한 이메일인지 알려 주지 않기 위해 결과와 상관없이 같은 답을 합니다.
  return { ok: true, data: { socialProvider: '' } };
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
