/**
 * 가입 경로. 서버·클라이언트 공용(순수 값만) 입니다.
 *
 * ★ lib/profiles.ts 는 server-only 라 클라이언트 컴포넌트에서 못 씁니다.
 *   화면에서 "간편가입이냐" 를 판단해야 하는 곳이 많아 이 파일로 따로 뺐습니다.
 */

export const SOCIAL_PROVIDERS = ['google', 'kakao', 'naver'] as const;

export type AuthProvider = 'email' | (typeof SOCIAL_PROVIDERS)[number];

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  kakao: '카카오',
  naver: '네이버',
  email: '이메일',
};

/** 화면에 그대로 쓰는 이름. 모르는 값은 그대로 돌려줍니다. */
export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

/** 구글·카카오·네이버로 가입했으면 true — 관리할 비밀번호가 없습니다. */
export function isSocialProvider(provider: string): boolean {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(provider);
}

export function toProvider(value: string | null | undefined): AuthProvider {
  return value && isSocialProvider(value) ? (value as AuthProvider) : 'email';
}
