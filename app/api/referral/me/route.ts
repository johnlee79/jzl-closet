import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getReferralCode } from '@/lib/referrals';
import { getCachedReferral } from '@/lib/settings';

/**
 * 로그인한 회원의 추천 코드만 알려 줍니다.
 *
 * ★ 공유 버튼이 이 값을 씁니다.
 *   레이아웃에서 미리 내려보내면 프론트 전 페이지가 동적 렌더링이 되어
 *   정적 생성이 깨집니다. (/api/auth/me 와 같은 이유로 따로 뺐습니다)
 * ★ 코드 말고는 아무것도 내려보내지 않습니다.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getCachedReferral();
  if (!settings.enabled) return NextResponse.json({ code: '', shareLine: '' });

  const user = await getCurrentUser();
  const code = user ? await getReferralCode(user.id) : '';

  // 공유 문구도 함께 내려보냅니다. 버튼이 두 번 물어보지 않게 하기 위함입니다.
  return NextResponse.json(
    { code, shareLine: settings.shareLine },
    { headers: { 'Cache-Control': 'no-store, private' } }
  );
}
