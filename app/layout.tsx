import type { Metadata } from 'next';
import { getCachedBranding, hasCustomFavicon } from '@/lib/settings';
import { SITE_URL, store } from '@/lib/store';
import './globals.css';

/**
 * 루트 레이아웃은 html/body 껍데기만 담당합니다.
 * 프론트(헤더·푸터·장바구니)는 app/(shop)/layout.tsx,
 * 관리자(사이드바)는 app/admin/layout.tsx 가 각각 따로 그립니다.
 *
 * 파비콘은 관리자 > 설정 > 브랜딩 에서 올린 값을 씁니다.
 * 등록된 값이 없으면 public/favicon.svg 를 그대로 씁니다.
 */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getCachedBranding();

  const icon = branding.favicon
    ? [{ url: branding.favicon.url, type: branding.favicon.type, sizes: branding.favicon.sizes }]
    : [];
  // 기본 파비콘일 때는 svg 를 읽지 못하는 브라우저를 위해 png 도 함께 겁니다.
  if (!hasCustomFavicon(branding)) {
    icon.push({ url: '/favicon-32.png', type: 'image/png', sizes: '32x32' });
  }

  return {
    ...baseMetadata,
    icons: {
      icon,
      apple: branding.appleTouchIcon
        ? [
            {
              url: branding.appleTouchIcon.url,
              type: branding.appleTouchIcon.type,
              sizes: branding.appleTouchIcon.sizes,
            },
          ]
        : undefined,
    },
  };
}

const baseMetadata: Metadata = {
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
