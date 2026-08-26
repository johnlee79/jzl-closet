import { countPendingInquiries } from '@/lib/inquiries';
import {
  countCancelRequested,
  countNeedsCheck,
  countPendingPayment,
  countUnshipped,
} from '@/lib/orders';
import { isAdmin } from '@/lib/admin-guard';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * ============================================================
 * ★★ 사이드바 숫자만 돌려줍니다 (2026-08-26)
 * ============================================================
 *
 * ★★ 왜 필요한가 — 사이드바가 레이아웃에서 그려지기 때문입니다.
 *   Next.js 는 화면을 옮길 때 **레이아웃을 다시 그리지 않습니다.**
 *   바뀌는 것은 가운데 본문뿐이고, 감싸는 레이아웃은 그대로 재사용합니다.
 *   그래서 관리자 창을 한 번 연 뒤로는 F5 를 누르기 전까지 사이드바 숫자가
 *   처음 값에 얼어붙어 있었습니다.
 *
 *   손님이 취소 요청을 눌러도 관리자는 그것을 몰랐습니다.
 *   revalidatePath 는 "다음에 물어보면 새 걸 주겠다" 는 약속일 뿐,
 *   서버가 이미 열려 있는 관리자 창에게 먼저 말을 걸 방법은 없습니다.
 *
 * ★★ 세는 방법을 새로 만들지 않았습니다.
 *   레이아웃(app/admin/(dashboard)/layout.tsx)이 쓰는 그 함수 다섯 개를
 *   그대로 부릅니다. 두 곳이 다른 방법으로 세면 반드시 어긋납니다.
 *
 * ★ 전부 개수만 세는 조회입니다. 행을 읽지 않습니다.
 *   주문이 몇 만 건으로 늘어도 이 주소의 비용은 늘지 않습니다.
 *
 * ★ 다섯 개를 한꺼번에 보냅니다. 줄 세워 보내면 그만큼 느려집니다.
 *
 * ★★ 이 주소가 관리자 세션도 이어 줍니다.
 *   아래 isAdmin() 이 getUser() 를 부르고, 그때 만료된 액세스 토큰이
 *   갱신됩니다. 전에는 components/admin/AdminSessionKeeper.tsx 가 30분마다
 *   하던 일인데, 하는 일이 같아 이쪽으로 합쳤습니다.
 *   (비밀번호로 들어온 경우에는 계산만 하고 끝나 왕복이 아예 없습니다)
 *
 * ★ 미들웨어는 /admin/* 만 봅니다. /api/** 는 지나가지 않습니다.
 *   그래서 여기서 직접 isAdmin() 으로 막습니다.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  if (!(await isAdmin())) {
    // ★ 왜 막혔는지는 lib/admin-guard.ts 가 [auth] 로 남깁니다.
    return new Response(null, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({
      needsCheck: 0,
      cancelRequested: 0,
      pendingPayment: 0,
      unshipped: 0,
      inquiries: 0,
    });
  }

  const [needsCheck, cancelRequested, pendingPayment, unshipped, inquiries] =
    await Promise.all([
      countNeedsCheck(),
      countCancelRequested(),
      countPendingPayment(),
      countUnshipped(),
      countPendingInquiries(),
    ]);

  return Response.json(
    { needsCheck, cancelRequested, pendingPayment, unshipped, inquiries },
    {
      /*
       * ★ 중간에 아무도 이 답을 보관하지 못하게 합니다.
       *   숫자가 낡으면 이 장치를 만든 이유가 사라집니다.
       */
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
