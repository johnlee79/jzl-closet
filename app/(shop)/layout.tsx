import AnchorFlash from '@/components/AnchorFlash';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import MemberSync from '@/components/MemberSync';
// ★ 홈 화면 추가 안내는 잠시 내렸습니다. (2026-08-25) 아래 레이아웃의 주석 참고
// import InstallPrompt from '@/components/InstallPrompt';
import PaymentReturnWatch from '@/components/PaymentReturnWatch';
import PointPopup from '@/components/PointPopup';
import PopupLayer from '@/components/PopupLayer';
import ReferralCapture from '@/components/ReferralCapture';
import ScrollToTop from '@/components/ScrollToTop';
import SiteNotices from '@/components/SiteNotices';
import { Suspense } from 'react';
import SiteProvider from '@/components/SiteProvider';
import TopRibbon from '@/components/TopRibbon';
import { CartProvider } from '@/lib/cart';
import {
  getCachedBranding,
  getCachedEvent,
  getCachedPoints,
  getCachedShipping,
  getCachedSns,
  getCachedStore,
  getEscrowNotice,
} from '@/lib/settings';
import { isRibbonActive } from '@/lib/site-config';
import { SITE_URL } from '@/lib/store';
import { getActivePopups } from '@/lib/popups';
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
  const [
    { categories, brands },
    store,
    shipping,
    branding,
    escrow,
    popups,
    event,
    points,
    sns,
  ] = await Promise.all([
    getTaxonomy(),
    getCachedStore(),
    getCachedShipping(),
    getCachedBranding(),
    // ★ 계좌번호가 아니라 구매안전 표시 정보만 뽑아 옵니다.
    getEscrowNotice(),
    // 노출 기간에 든 팝업만 내려옵니다.
    getActivePopups(),
    getCachedEvent(),
    getCachedPoints(),
    getCachedSns(),
  ]);

  /*
   * ★ 3-H 에서 푸터 첫 줄을 '편집숍 소개 → /about' 으로 고정했습니다.
   *   그래서 자체 브랜드(jzl-closet)가 노출 중인지 여기서 볼 일이 없어졌습니다.
   *   /about 은 편집숍 자체 소개, /brand/jzl-closet 은 자체 기획 라인으로
   *   성격이 다른 페이지입니다. 둘을 하나로 합치지 마세요.
   *   자체 기획 상품이 생기면 브랜드 목록(/brands)에서 자연히 드러납니다.
   */

  // 띠배너 노출 기간은 한국시간 날짜로 판단합니다.
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ribbon = isRibbonActive(event.ribbon, todayKst) ? event.ribbon : null;

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
      <SiteProvider value={{ categories, brands, store, shipping, points, event }}>
        <CartProvider>
          {ribbon ? (
            <TopRibbon
              text={ribbon.text}
              linkUrl={ribbon.linkUrl}
              tone={ribbon.tone}
            />
          ) : null}
          <Header
            categories={categories}
            storeName={store.name}
            storePhone={store.phone}
            storeHours={store.hours}
            logoUrl={branding.logo?.url ?? ''}
          />
          {/*
            로그인 상태를 언제 다시 물어볼지 여기서 한 번만 정합니다.
            ★ 화면마다 따로 묻지 않습니다. 예전에는 헤더·안내 띠·상품 담기 버튼·
              상품 문의·포인트 팝업이 각자 물어서 한 화면에 요청이 다섯 번 나갔고,
              서로 다른 순간에 답을 받아 화면이 여러 번 움찔거렸습니다.
          */}
          <MemberSync />
          {/*
            결제하고 돌아왔는데 결과 화면을 못 본 손님을 붙잡습니다. (2026-08-25)

            ★ 결제창으로 넘어갈 때 남긴 표시가 있을 때만 딱 한 번 물어봅니다.
              표시가 없으면 요청이 아예 나가지 않습니다. 대부분의 방문이 여기입니다.
            ★ 모바일에서 결제창→우리 서버로 돌아오는 요청이 아예 일어나지 않은
              경우를 잡는 유일한 길입니다. 그때는 303 도 스크립트도 실행되지 않습니다.
          */}
          <PaymentReturnWatch />
          {/*
            ★★ 홈 화면에 추가 안내(InstallPrompt)를 잠시 내렸습니다. (2026-08-25)

              오픈 직후 로그인 상태가 헤더와 서버에서 다르게 보이는 일이 있었습니다.
              원인은 lib/member.ts 가 확인에 실패했을 때 "비회원" 으로 확정하던
              것이었고 이 컴포넌트와는 무관합니다. 그래도 그날 새로 들어간
              전역 장치를 남겨 두면 다음에 무슨 일이 나도 매번 다시 의심하게
              되므로, 로그인이 안정될 때까지 내려 둡니다.

              ★ 이 컴포넌트가 서비스 워커를 등록했습니다. 여기서 빼면 새로
                등록되지 않고, 이미 설치된 손님 브라우저에서는 public/sw.js 가
                스스로 해제합니다.
              ★ 다시 켤 때 — 아래 주석을 풀고 public/sw.js 를 예전 내용으로
                되돌리면 됩니다. app/manifest.ts 와 아이콘은 그대로 두었습니다.
                그것들은 정적 파일이라 아무 동작도 하지 않습니다.
          */}
          {/* <InstallPrompt /> */}
          {/* 연락처 미입력 같은 안내 줄. 로그인 상태는 브라우저에서 확인합니다. */}
          <SiteNotices />
          <main id="main">{children}</main>
          <Footer
            categories={categories}
            store={store}
            sns={sns}
            escrow={escrow}
          />
          {/*
            #앵커로 들어온 자리를 잠깐 밝힙니다.
            ★ 관리자 문구 화면의 [페이지 보기] 가 자리를 찍어 보내는데,
              도착한 곳을 표시해 주지 않으면 어느 문단인지 알 수 없습니다.
          */}
          <AnchorFlash />
          {/* 맨 위로 — 고객 화면 전체에 실립니다. 두 화면 높이만큼 내려가야 나타납니다. */}
          <ScrollToTop />
          {/* 팝업 — 노출 화면(메인만/전체) 판단은 컴포넌트가 주소를 보고 합니다. */}
          <PopupLayer popups={popups} />
          {/* 보유 포인트 안내. 공지 팝업이 떠 있으면 이번에는 뜨지 않습니다. */}
          <PointPopup />
          {/*
            추천 링크(?ref=…)로 들어온 손님 기록.
            ★ Suspense 로 감싸야 합니다. useSearchParams 는 감싸지 않으면
              이 레이아웃을 쓰는 모든 페이지의 정적 생성이 통째로 풀립니다.
          */}
          <Suspense fallback={null}>
            <ReferralCapture />
          </Suspense>
        </CartProvider>
      </SiteProvider>
    </>
  );
}
