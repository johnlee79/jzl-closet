import type { Metadata } from 'next';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import {
  getCachedAnalytics,
  getCachedBranding,
  getCachedStore,
  hasCustomFavicon,
} from '@/lib/settings';
import { SITE_URL } from '@/lib/store';
import './globals.css';

/**
 * 루트 레이아웃은 html/body 껍데기만 담당합니다.
 * 프론트(헤더·푸터·장바구니)는 app/(shop)/layout.tsx,
 * 관리자(사이드바)는 app/admin/layout.tsx 가 각각 따로 그립니다.
 *
 * 파비콘과 브랜드명·소개 문구는 관리자 > 설정 에서 저장한 값을 씁니다.
 * 저장한 값이 없으면 lib/site-config.ts 의 기본값으로 갑니다.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [branding, store] = await Promise.all([getCachedBranding(), getCachedStore()]);

  const icon = branding.favicon
    ? [{ url: branding.favicon.url, type: branding.favicon.type, sizes: branding.favicon.sizes }]
    : [];
  // 기본 파비콘일 때는 svg 를 읽지 못하는 브라우저를 위해 png 도 함께 겁니다.
  if (!hasCustomFavicon(branding)) {
    icon.push({ url: '/favicon-32.png', type: 'image/png', sizes: '32x32' });
  }

  const title = `${store.name} — ${store.slogan}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s | ${store.name}`,
    },
    description: `${store.intro} ${store.category}인 ${store.nameKo}입니다.`,
    keywords: [
      store.name,
      store.nameKo,
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
      title,
      description: store.intro,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: store.intro,
    },
    robots: {
      index: true,
      follow: true,
    },
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 측정 ID 가 비어 있으면 GoogleAnalytics 가 아무것도 그리지 않습니다.
  const analytics = await getCachedAnalytics();

  return (
    <html lang="ko">
      <body className="bg-paper text-ink antialiased">
        {children}
        <GoogleAnalytics id={analytics.ga4Id} />
      </body>
    </html>
  );
}
