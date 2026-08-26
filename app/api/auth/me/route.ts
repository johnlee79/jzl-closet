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

  /*
   * ============================================================
   * ★★ 이름이 아직 닉네임인 회원에게 안내합니다 (2026-08-26)
   * ============================================================
   *
   * ★★ 왜 필요한가
   *   구글·카카오로 가입하면 그쪽 닉네임이 profiles.name 으로 들어옵니다.
   *   그 이름이 주문서의 입금자명으로 그대로 들어가는데, 통장에 찍히는
   *   이름과 다르면 입금 확인이 안 되어 배송이 밀립니다.
   *
   * ★★ 왜 updated_at 을 안 보는가 — 실제로 확인했습니다.
   *   "회원정보를 한 번이라도 저장했으면 확인한 것으로 친다" 로 하면,
   *   연락처 배너를 보고 **연락처만** 넣은 회원이 확인한 것으로 처리됩니다.
   *   그런데 그 사람이 정확히 우리가 잡으려던 대상입니다.
   *   2026-08-26 기준 회원 3명 모두 updated_at 이 바뀌어 있었고, 그중
   *   2명은 이름이 아직 닉네임 그대로였습니다. updated_at 방식이었다면
   *   아무에게도 안 떴을 것입니다.
   *
   * ★★ 그래서 "지금 이름이 가입 때 들어온 닉네임과 같은가" 를 봅니다.
   *   이름을 고치면 달라집니다. 연락처만 고치면 그대로입니다.
   *   저장하는 값이 없어 DB 에 칸을 만들 필요도 없습니다.
   *
   * ★ 한계 — 실명이 곧 닉네임인 분에게는 계속 뜹니다.
   *   (카카오 이름을 실명으로 쓰는 경우가 흔합니다)
   *   그분들은 배너를 닫으면 이번 방문에서는 안 보입니다. 그리고 주문서의
   *   확인창이 마지막으로 한 번 더 잡아 줍니다. 이 한계를 없애려면
   *   "확인했음" 을 어딘가 저장해야 하는데, 그러려면 DB 에 칸이 필요합니다.
   *
   * ★ 이메일로 가입한 회원에게는 뜨지 않습니다. 닉네임이 없습니다.
   */
  const nickname = user?.nickname.trim() ?? '';
  const currentName = (profile?.name ?? '').trim();
  const needsRealName = active && (!currentName || (nickname !== '' && currentName === nickname));

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
      needsRealName,
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
