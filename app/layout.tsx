import type { Metadata, Viewport } from 'next';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import {
  getCachedAnalytics,
  getCachedBranding,
  getCachedStore,
  hasCustomFavicon,
} from '@/lib/settings';
import { SITE_URL, SITE_VERIFICATION } from '@/lib/store';
import './globals.css';

/**
 * 루트 레이아웃은 html/body 껍데기만 담당합니다.
 * 프론트(헤더·푸터·장바구니)는 app/(shop)/layout.tsx,
 * 관리자(사이드바)는 app/admin/layout.tsx 가 각각 따로 그립니다.
 *
 * 파비콘과 브랜드명·소개 문구는 관리자 > 설정 에서 저장한 값을 씁니다.
 * 저장한 값이 없으면 lib/site-config.ts 의 기본값으로 갑니다.
 */
/**
 * 주소창·상단 막대 색.
 *
 * ★ Next 14 부터 themeColor 는 metadata 가 아니라 viewport 에 둡니다.
 *   metadata 에 넣으면 빌드에서 경고가 나고 무시됩니다.
 * ★ 홈 화면에서 앱처럼 열었을 때 위쪽 띠 색이 됩니다.
 *   manifest 의 theme_color 와 같은 값이어야 화면이 어긋나지 않습니다.
 */
export const viewport: Viewport = {
  themeColor: '#14141A',
};

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
    /*
      ★ 검색엔진 소유확인 (3-M)
        하위 페이지는 verification 을 따로 정의하지 않으므로 이 값이 그대로 내려갑니다.
        3-J 에서 openGraph 가 통째로 갈아 끼워지던 함정이 있어 같은 일이
        일어나는지 빌드 산출물로 확인했고, verification 은 정상적으로 상속됩니다.
      ★ 네이버는 Next 가 이름을 아는 항목이 아니라 other 로 넣습니다.
    */
    verification: {
      google: SITE_VERIFICATION.google,
      other: { 'naver-site-verification': SITE_VERIFICATION.naver },
    },
    /*
     * ★ 홈 화면에 추가(PWA) — app/manifest.ts 가 만드는 주소를 가리킵니다.
     *   브라우저가 이걸 읽어야 "추가할 수 있는 사이트" 로 봅니다.
     */
    manifest: '/manifest.webmanifest',
    /*
     * ★★ iOS 는 manifest 를 거의 보지 않습니다. 이 값들을 봅니다.
     *   capable 이 있어야 홈 화면에서 열 때 주소창 없이 뜹니다.
     *   title 은 홈 화면 아이콘 밑에 적히는 이름입니다.
     */
    appleWebApp: {
      capable: true,
      title: 'JZL CLOSET',
      statusBarStyle: 'default',
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
