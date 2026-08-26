import { createAdminAuthClient } from '@/lib/supabase/auth-server';
import { isJustLoggedOut } from '@/lib/member-session';

/**
 * ============================================================
 * ★★ 관리자 세션을 조용히 이어 줍니다 (2026-08-26)
 * ============================================================
 *
 * ★★ 왜 필요한가
 *   관리자가 상품 등록 화면에 한 시간 넘게 머물다 [저장]을 누르면
 *   로그아웃되는 일이 있었습니다. 그 사이 아무 요청도 안 나가서
 *   액세스 토큰이 만료된 채로 방치되기 때문입니다.
 *
 *   손님 화면에는 MemberSync 가 있어 화면을 옮길 때마다 /api/auth/me 를
 *   부르고, 그 요청이 토큰을 갱신해 줍니다. 관리자 화면에는 그런 것이
 *   하나도 없었습니다.
 *
 * ★★ 이 주소가 하는 일은 getUser() 한 번뿐입니다.
 *   getUser() 는 토큰이 만료됐으면 리프레시 토큰으로 갱신합니다.
 *   여기는 Route Handler 라 쿠키를 쓸 수 있어, 갱신된 토큰이 제대로
 *   저장됩니다. (서버 컴포넌트에서는 쿠키를 못 씁니다)
 *
 * ★ 아무것도 돌려주지 않습니다. 204 입니다.
 *   부르는 쪽은 답을 보지 않습니다. 이름·이메일 같은 것을 내보낼 이유가
 *   없습니다. 관리자 화면은 이미 자기 정보를 알고 있습니다.
 *
 * ★ 관리자 비밀번호로 들어온 경우에는 Supabase 세션이 없습니다.
 *   그때는 아무 일도 일어나지 않고 그냥 204 입니다. 해가 없습니다.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createAdminAuthClient();
  if (!supabase) return new Response(null, { status: 204 });

  try {
    const { data, error } = await supabase.auth.getUser();

    /*
     * ★★ 갱신이 실패하면 반드시 남깁니다.
     *   여기서 조용히 넘어가면 "언제부터 세션이 죽었는지" 를 알 수 없습니다.
     *
     * ★ error 만 보지 않습니다. 값이 비었는데 오류도 없는 경우가 실제로
     *   있었습니다. (회원 뱃지를 셀 때 HTTP 204 에 error 가 null 이었습니다)
     * ★ "그냥 로그인 안 함" 은 남기지 않습니다. 관리자 비밀번호로 들어온
     *   경우가 늘 그 상태라 매번 찍히면 로그가 무의미해집니다.
     */
    if (error && !isJustLoggedOut(error)) {
      console.warn(
        `[auth] 관리자 세션 이어주기 실패: ${error.message || '(오류 메시지 없음)'}`
      );
    } else if (!error && !data.user) {
      console.warn('[auth] 관리자 세션 이어주기 — 값이 비었는데 오류도 없습니다.');
    }
  } catch (error) {
    console.warn(
      '[auth] 관리자 세션 이어주기 중 오류:',
      error instanceof Error ? error.message : String(error)
    );
  }

  return new Response(null, { status: 204 });
}
