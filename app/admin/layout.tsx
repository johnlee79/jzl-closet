import type { Metadata } from 'next';

/**
 * 관리자 영역의 껍데기. 실제 사이드바는 app/admin/(dashboard)/layout.tsx 가 그립니다.
 * 로그인 화면과 미리보기 화면은 사이드바 없이 나와야 하므로 여기서 나눠 두었습니다.
 */
export const metadata: Metadata = {
  title: '관리자',
  robots: { index: false, follow: false },
};

/**
 * 다크모드를 그리기 전에 미리 켭니다.
 *
 * ★ React 가 붙은 뒤에 켜면 밝은 화면이 한 번 번쩍입니다.
 *   그래서 아주 짧은 스크립트로 html 에 .dark 를 먼저 붙여 둡니다.
 * ★ 기본값은 라이트입니다. 저장해 둔 값이 'dark' 일 때만 켭니다.
 *   (기기 설정이 다크여도 따라가지 않습니다 — 상품 이미지 색감 판단 때문)
 * ★ 이 클래스는 /admin 안에서만 의미가 있습니다. 고객 화면은 .dark 규칙을 쓰지 않습니다.
 */
const THEME_SCRIPT = `try{if(localStorage.getItem('jzl-admin-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {children}
    </>
  );
}
