import AdminShell from '@/components/admin/AdminShell';

/** 사이드바가 있는 관리자 화면들. (로그인·미리보기는 이 레이아웃 밖에 있습니다) */
export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
