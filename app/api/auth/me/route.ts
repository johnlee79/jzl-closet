import { NextResponse } from 'next/server';
import { getCurrentProfile, getCurrentUser, displayName } from '@/lib/auth';
import { isActiveMember } from '@/lib/member-session';
import { earnBirthdayPoints } from '@/lib/points';
import { getCachedPoints } from '@/lib/settings';

/**
 * 헤더·팝업에 필요한 로그인 상태만 알려 줍니다.
 *
 * ★ 왜 API 로 뺐는가
 *   레이아웃에서 쿠키를 읽으면 프론트 전 페이지가 동적 렌더링으로 바뀝니다.
 *   이 사이트는 SEO 가 최우선이라 상품·카테고리·브랜드 페이지가 정적으로
 *   구워져야 합니다. 그래서 로그인 여부만 브라우저에서 따로 물어봅니다.
 *   (로그인 이름은 검색에 필요한 내용이 아니라 정적 HTML 에 없어도 됩니다)
 *
 * ★ 포인트 잔액도 여기서 함께 내려보냅니다.
 *   이미 회원 정보를 읽고 있으므로 DB 조회가 늘지 않습니다.
 *   보유 포인트 팝업은 이 값만 보고 뜹니다. (내역을 다시 합산하지 않습니다)
 *
 * ★ 이름·포인트 말고는 아무것도 내려보내지 않습니다.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);

  /*
   * ★ 회원 판정 규칙은 lib/member-session.ts 한 곳에만 있습니다.
   *   전에는 이 줄에 규칙이 직접 적혀 있었고, 미들웨어에는 다른 규칙이
   *   적혀 있어 헤더와 로그인 화면이 서로 다른 말을 했습니다.
   */
  const active = Boolean(user) && isActiveMember(profile);
  const name = active ? displayName(profile, user) : '';

  // ★ 구글 로그인은 연락처를 주지 않습니다. 주문에 필요하므로 안내 배너를 띄웁니다.
  const needsPhone = active && !profile?.phone;

  const points = await getCachedPoints();

  // 생일 축하 포인트 — 오늘이 생일이고 올해 아직 안 받았으면 지급합니다.
  // 이미 읽어 둔 회원 정보로 판단하므로 평소에는 추가 조회가 없습니다.
  let balance = profile?.pointBalance ?? 0;
  let expiringSoon = profile?.pointExpiringSoon ?? 0;

  if (active && profile) {
    const earned = await earnBirthdayPoints(profile, points);
    if (earned > 0) balance += earned;
  }

  if (!active) {
    balance = 0;
    expiringSoon = 0;
  }

  return NextResponse.json(
    {
      name,
      needsPhone,
      loggedIn: active,
      pointBalance: balance,
      pointExpiringSoon: expiringSoon,
      pointMinUse: points.minUse,
      pointUseUnit: points.useUnit,
      pointPopupEnabled: points.popupEnabled,
      pointPopupIntervalHours: points.popupIntervalHours,
    },
    { headers: { 'Cache-Control': 'no-store, private' } }
  );
}
