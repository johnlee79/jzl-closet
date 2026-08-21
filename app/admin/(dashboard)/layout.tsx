import AdminShell from '@/components/admin/AdminShell';
import { countPendingInquiries } from '@/lib/inquiries';
import { countNeedsCheck, countPendingPayment, countUnshipped } from '@/lib/orders';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/** 사이드바가 있는 관리자 화면들. (로그인·미리보기는 이 레이아웃 밖에 있습니다) */
export const dynamic = 'force-dynamic';

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
      {children}
    </AdminShell>
  );
}
