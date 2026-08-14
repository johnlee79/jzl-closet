import AdminShell from '@/components/admin/AdminShell';
import { countPendingInquiries } from '@/lib/inquiries';
import { countPendingPayment } from '@/lib/orders';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/** 사이드바가 있는 관리자 화면들. (로그인·미리보기는 이 레이아웃 밖에 있습니다) */
export const dynamic = 'force-dynamic';

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 매일 확인해야 하는 두 숫자를 사이드바 뱃지로 보여 줍니다.
  const [pendingCount, pendingInquiryCount] = isSupabaseConfigured()
    ? await Promise.all([countPendingPayment(), countPendingInquiries()])
    : [0, 0];

  return (
    <AdminShell pendingCount={pendingCount} pendingInquiryCount={pendingInquiryCount}>
      {children}
    </AdminShell>
  );
}
