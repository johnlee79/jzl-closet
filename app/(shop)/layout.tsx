import Footer from '@/components/Footer';
import Header from '@/components/Header';
import SiteNotices from '@/components/SiteNotices';
import SiteProvider from '@/components/SiteProvider';
import { CartProvider } from '@/lib/cart';
import {
  getCachedBranding,
  getCachedShipping,
  getCachedStore,
  getEscrowNotice,
} from '@/lib/settings';
import { SITE_URL } from '@/lib/store';
import { getTaxonomy } from '@/lib/taxonomy';

/**
 * 프론트(고객이 보는 화면) 전용 레이아웃.
 * 괄호로 감싼 폴더명은 주소에 나타나지 않으므로 기존 URL 이 그대로 유지됩니다.
 *
 * 분류·브랜드·스토어 정보를 여기서 한 번만 읽어
 *   - 서버 컴포넌트(헤더·푸터)에는 props 로
 *   - 깊이 들어 있는 클라이언트 컴포넌트에는 SiteProvider 로
 * 내려 줍니다. 값은 캐시되어 있어 ISR·정적 생성을 방해하지 않습니다.
 *
 * Organization JSON-LD 는 프론트 전 페이지에만 실립니다.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [{ categories, brands }, store, shipping, branding, escrow] = await Promise.all([
    getTaxonomy(),
    getCachedStore(),
    getCachedShipping(),
    getCachedBranding(),
    // ★ 계좌번호가 아니라 구매안전 표시 정보만 뽑아 옵니다.
    getEscrowNotice(),
  ]);

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: store.name,
    alternateName: store.nameKo,
    url: SITE_URL,
    description: store.intro,
    slogan: store.slogan,
    telephone: store.phone,
    email: store.email || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: store.business.address,
      addressCountry: 'KR',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: store.phone,
      contactType: 'customer service',
      areaServed: 'KR',
      availableLanguage: ['Korean'],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <SiteProvider value={{ categories, brands, store, shipping }}>
        <CartProvider>
          <Header
            categories={categories}
            storeName={store.name}
            storePhone={store.phone}
            storeHours={store.hours}
            logoUrl={branding.logo?.url ?? ''}
          />
          {/* 연락처 미입력 같은 안내 줄. 로그인 상태는 브라우저에서 확인합니다. */}
          <SiteNotices />
          <main id="main">{children}</main>
          <Footer categories={categories} store={store} escrow={escrow} />
        </CartProvider>
      </SiteProvider>
    </>
  );
}
