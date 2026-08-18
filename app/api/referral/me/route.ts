import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getReferralCode, hasRunningGoal } from '@/lib/referrals';
import { getCachedReferral } from '@/lib/settings';

/**
 * 공유 버튼이 필요로 하는 것만 알려 줍니다.
 *
 * ★ 코드 말고는 아무 개인정보도 내려보내지 않습니다.
 * ★ 레이아웃에서 미리 내려보내면 프론트 전 페이지가 동적 렌더링이 되어
 *   정적 생성이 깨집니다. (/api/auth/me 와 같은 이유로 따로 뺐습니다)
 *
 * ★ 3-G — 공유 버튼 아래 안내 문구까지 여기서 함께 내려보냅니다.
 *   버튼이 이 주소를 이미 한 번 부르고 있어, 판단에 필요한 값을 같이 실어 보내면
 *   요청이 늘지 않습니다. 목표 진행 여부는 hasRunningGoal 이 캐시로 들고 있어
 *   상품을 볼 때마다 목표 표를 새로 읽지 않습니다.
 */
export const dynamic = 'force-dynamic';

/** 추천 기능이 꺼져 있을 때 내보내는 빈 응답. 화면은 버튼만 그립니다. */
const OFF = {
  code: '',
  shareLine: '',
  member: false,
  notice: '',
};

export async function GET() {
  const settings = await getCachedReferral();
  if (!settings.enabled) return NextResponse.json(OFF);

  const user = await getCurrentUser();
  const member = Boolean(user);

  const [code, eventRunning] = await Promise.all([
    user ? getReferralCode(user.id) : Promise.resolve(''),
    hasRunningGoal(),
  ]);

  /*
   * 버튼 아래 안내 문구.
   *   비회원         → 로그인을 권합니다. (코드가 없어 공유해도 실적이 안 쌓입니다)
   *   회원 + 이벤트  → 이벤트 안내
   *   회원 + 이벤트 없음 → 문구 없음
   *
   * ★ 마지막 경우에 아무 말도 하지 않는 것이 중요합니다.
   *   받을 것이 없는데 "받아가세요" 라고 적으면 그다음부터 아무도 안 믿습니다.
   */
  const notice = !member
    ? settings.shareNoticeGuest.trim()
    : eventRunning
      ? settings.shareNoticeEvent.trim()
      : '';

  return NextResponse.json(
    { code, shareLine: settings.shareLine, member, notice },
    { headers: { 'Cache-Control': 'no-store, private' } }
  );
}
