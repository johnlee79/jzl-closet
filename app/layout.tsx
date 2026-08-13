import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { CartProvider } from '@/lib/cart';
import { SITE_URL, store } from '@/lib/store';
import './globals.css';

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

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: store.name,
  alternateName: store.nameKo,
  url: SITE_URL,
  description: store.intro,
  slogan: store.slogan,
  telephone: store.business.phone,
  address: {
    '@type': 'PostalAddress',
    streetAddress: '부일로 38, 1102호 (부개동)',
    addressLocality: '부평구',
    addressRegion: '인천광역시',
    addressCountry: 'KR',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: `+82-32-209-1058`,
    contactType: 'customer service',
    areaServed: 'KR',
    availableLanguage: ['Korean'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-paper text-ink antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <CartProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
