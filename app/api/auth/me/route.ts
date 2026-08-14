import { NextResponse } from 'next/server';
import { getCurrentProfile, getCurrentUser, displayName } from '@/lib/auth';

/**
 * 헤더에 보여 줄 로그인 상태만 알려 줍니다.
 *
 * ★ 왜 API 로 뺐는가
 *   레이아웃에서 쿠키를 읽으면 프론트 전 페이지가 동적 렌더링으로 바뀝니다.
 *   이 사이트는 SEO 가 최우선이라 상품·카테고리·브랜드 페이지가 정적으로
 *   구워져야 합니다. 그래서 로그인 여부만 브라우저에서 따로 물어봅니다.
 *   (로그인 이름은 검색에 필요한 내용이 아니라 정적 HTML 에 없어도 됩니다)
 *
 * ★ 이름 말고는 아무것도 내려보내지 않습니다.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);

  // 탈퇴한 계정은 로그인하지 않은 것으로 봅니다.
  const name =
    user && profile && profile.status !== 'withdrawn' ? displayName(profile, user) : '';

  return NextResponse.json(
    { name },
    { headers: { 'Cache-Control': 'no-store, private' } }
  );
}
