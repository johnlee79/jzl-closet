import type { Metadata } from 'next';

/**
 * 관리자 영역의 껍데기. 실제 사이드바는 app/admin/(dashboard)/layout.tsx 가 그립니다.
 * 로그인 화면과 미리보기 화면은 사이드바 없이 나와야 하므로 여기서 나눠 두었습니다.
 */
export const metadata: Metadata = {
  title: '관리자',
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
