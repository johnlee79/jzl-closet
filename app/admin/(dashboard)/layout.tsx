import AdminShell from '@/components/admin/AdminShell';
import AdminSessionKeeper from '@/components/admin/AdminSessionKeeper';
import { countPendingInquiries } from '@/lib/inquiries';
import { countNeedsCheck, countPendingPayment, countUnshipped } from '@/lib/orders';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/** 사이드바가 있는 관리자 화면들. (로그인·미리보기는 이 레이아웃 밖에 있습니다) */
export const dynamic = 'force-dynamic';

/**
 * ============================================================
 * ★★ 관리자 화면은 캐시된 조회 결과를 쓰지 않습니다 (2026-08-25)
 * ============================================================
 *
 * ★★ 왜 넣었는가
 *   새로 들어온 주문이 관리자 목록에 안 나타나는 일이 있었습니다.
 *   직접 원인은 revalidatePath 누락이었고 그건 따로 고쳤습니다.
 *   다만 그 방식은 "고치는 쪽이 잊지 않는 것" 에 기대고 있습니다.
 *   실제로 주문 생성과 카드 결제완료 네 곳이 한꺼번에 빠져 있었습니다.
 *
 *   관리자 화면은 "지금 이 순간" 이 중요한 곳입니다. 손님 주문을 놓치면
 *   물건이 안 나갑니다. 조금 느린 것보다 틀린 것이 훨씬 나쁩니다.
 *   그래서 앞으로 누가 revalidatePath 를 빠뜨려도 관리자 화면만은
 *   항상 지금 값을 보도록 못박습니다.
 *
 * ★★ 손님 화면은 건드리지 않습니다.
 *   이 설정은 /admin 아래 화면에만 적용됩니다. 상품·분류·브랜드 페이지의
 *   정적 생성은 그대로입니다. 그쪽은 SEO 가 최우선이라 손대면 안 됩니다.
 *   (빌드 결과의 ○ · ● 표시로 확인합니다)
 *
 * ★ dynamic = 'force-dynamic' 만으로는 부족했습니다.
 *   그것은 화면을 매번 새로 그리게 할 뿐, 그 안에서 부른 조회의 결과가
 *   재사용되는 것까지 막아 주지는 않았습니다. 이 줄이 그것을 막습니다.
 */
export const fetchCache = 'force-no-store';

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * 매일 확인해야 하는 숫자를 사이드바 뱃지로 보여 줍니다.
   *
   * ★ 네 조회를 한꺼번에 보냅니다. 줄 세워 보내면 사이드바가 그만큼 늦게 그려집니다.
   * ★ 전부 건수만 세는 조회(head: true)라 행을 읽지 않습니다.
   */
  const [pendingCount, needsCheckCount, unshippedCount, pendingInquiryCount] =
    isSupabaseConfigured()
      ? await Promise.all([
          countPendingPayment(),
          countNeedsCheck(),
          countUnshipped(),
          countPendingInquiries(),
        ])
      : [0, 0, 0, 0];

  return (
    <AdminShell
      pendingCount={pendingCount}
      needsCheckCount={needsCheckCount}
      unshippedCount={unshippedCount}
      pendingInquiryCount={pendingInquiryCount}
    >
      {/*
        ★ 관리자 로그인이 쓰는 동안 안 끊기게 조용히 이어 줍니다. (2026-08-26)
          상품 등록 화면에 오래 머물다 [저장]을 누르면 로그아웃되던 문제입니다.
          아무것도 그리지 않습니다. 자세한 내용은 그 파일의 설명을 보세요.
      */}
      <AdminSessionKeeper />
      {children}
    </AdminShell>
  );
}
