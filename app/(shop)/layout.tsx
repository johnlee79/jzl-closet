import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { CartProvider } from '@/lib/cart';
import { SITE_URL, store } from '@/lib/store';

/**
 * 프론트(고객이 보는 화면) 전용 레이아웃.
 * 괄호로 감싼 폴더명은 주소에 나타나지 않으므로 기존 URL 이 그대로 유지됩니다.
 * Organization JSON-LD 는 프론트 전 페이지에만 실립니다. (관리자에는 넣지 않습니다)
 */
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

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <CartProvider>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </CartProvider>
    </>
  );
}
