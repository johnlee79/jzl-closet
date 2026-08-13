import type { Metadata } from 'next';
import { SITE_URL, store } from '@/lib/store';
import './globals.css';

/**
 * 루트 레이아웃은 html/body 껍데기만 담당합니다.
 * 프론트(헤더·푸터·장바구니)는 app/(shop)/layout.tsx,
 * 관리자(사이드바)는 app/admin/layout.tsx 가 각각 따로 그립니다.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${store.name} — ${store.slogan}`,
    template: `%s | ${store.name}`,
  },
  description: `${store.intro} 의류, 가방·지갑, 슈즈, 액세서리를 취급하는 브랜드 편집숍 ${store.nameKo}입니다.`,
  keywords: [
    'JZL CLOSET',
    '제이진엘 클로젯',
    '브랜드 편집숍',
    '의류',
    '아우터',
    '니트',
    '가방',
    '지갑',
    '슈즈',
    '액세서리',
    '데일리룩',
  ],
  authors: [{ name: store.name }],
  applicationName: store.name,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: store.name,
    title: `${store.name} — ${store.slogan}`,
    description: store.intro,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${store.name} — ${store.slogan}`,
    description: store.intro,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
