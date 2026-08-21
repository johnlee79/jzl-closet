import type { Metadata } from 'next';
import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import SafeImage from '@/components/SafeImage';
import SnsLinks from '@/components/SnsLinks';
import { brandImage, visibleBrands, type Brand } from '@/lib/brands';
import { getProducts } from '@/lib/products';
import {
  getCachedSns,
  getCachedStore,
  getOgImage,
} from '@/lib/settings';
import { SITE_URL } from '@/lib/store';
import { getCachedBrands } from '@/lib/taxonomy';

/**
 * ============================================================
 * 브랜드 목록 /brands
 * ============================================================
 *
 * 관리자에 입력한 브랜드 스토리가 검색 유입 경로가 되도록 만든 목록입니다.
 * 각 줄을 누르면 /brand/{slug} 상세로 들어갑니다.
 *
 * ★ 대표 이미지는 원본 비율 그대로 나갑니다. (085e550 에서 정한 규칙과 같습니다)
 *   틀을 정해 두고 잘라내면 운영자가 잡은 구도가 망가집니다.
 * ★ 이미지가 없는 브랜드는 브랜드명을 Cormorant Garamond 로 크게 보여 줍니다.
 *   회색 네모를 띄우는 것보다 낫고, 로고를 올린 브랜드는 로고가 그대로 쓰입니다.
 * ★ 강조(featured) 브랜드는 위쪽에 더 크게 나옵니다.
 * ★ 예전 주소 /brand 는 이 페이지로 넘겨 둡니다. 같은 목록이 두 주소에 있으면
 *   검색엔진이 어느 쪽을 본문으로 볼지 정하지 못합니다.
 */

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  const description = `${store.name}이 다루는 브랜드입니다. 브랜드별 소개와 취급 상품을 확인하세요.`;

  return {
    title: '브랜드 목록',
    description,
    alternates: { canonical: '/brands' },
    openGraph: {
      title: `브랜드 목록 | ${store.name}`,
      description,
      url: '/brands',
      images: [await getOgImage()],
    },
  };
}

/** 「덴마크 · 2000」 처럼 원산지와 설립연도를 한 줄로 */
function originLine(brand: Brand): string {
  return [brand.origin, brand.since].filter(Boolean).join(' · ');
}

export default async function BrandsPage() {
  const [allProducts, allBrands, store, sns] = await Promise.all([
    getProducts(),
    getCachedBrands(),
    getCachedStore(),
    getCachedSns(),
  ]);

  const countByBrand = allProducts.reduce<Record<string, number>>((acc, product) => {
    if (product.brandSlug) acc[product.brandSlug] = (acc[product.brandSlug] ?? 0) + 1;
    return acc;
  }, {});

  /*
   * 노출을 켠 브랜드만, 관리자가 정한 순서대로.
   * ★ visibleBrands 가 이미 order 오름차순으로 정렬해 돌려줍니다.
   *   그 안에서 강조 브랜드만 위로 끌어올립니다. (순서 자체는 그대로 지킵니다)
   */
  const list = visibleBrands(allBrands);
  const brands = [
    ...list.filter((brand) => brand.isFeatured),
    ...list.filter((brand) => !brand.isFeatured),
  ];

  // ★ 검색엔진이 목록의 순서와 각 브랜드의 주소를 그대로 읽어 가게 합니다.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${store.name} 브랜드 목록`,
    numberOfItems: brands.length,
    itemListElement: brands.map((brand, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Brand',
        name: brand.name,
        alternateName: brand.nameKo || undefined,
        slogan: brand.tagline || undefined,
        url: `${SITE_URL}/brand/${brand.slug}`,
        logo: brand.logoUrl || undefined,
        image: brand.imageUrl || undefined,
      },
    })),
  };

  return (
    <div className="shell py-14 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="현재 위치" className="text-[14px] tracking-[0.14em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-ink">
              HOME
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-ink">브랜드 목록</li>
        </ol>
      </nav>

      <header className="mt-8 max-w-[680px]">
        <p className="label-xs">BRANDS</p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          {store.name}이 다루는 브랜드입니다
        </h1>
      </header>

      {brands.length === 0 ? (
        <div className="mt-12 border-t border-stone py-16">
          <p className="text-[17px] leading-relaxed text-ink">
            아직 소개할 브랜드가 없습니다.
          </p>
          <Link href="/products" className="btn-primary mt-8">
            전체 상품 보기
          </Link>
        </div>
      ) : (
        <ul className="mt-12 border-t border-stone">
          {brands.map((brand) => {
            const count = countByBrand[brand.slug] ?? 0;
            const origin = originLine(brand);
            const featured = brand.isFeatured;

            return (
              <li key={brand.slug} className="border-b border-stone">
                {/*
                  줄 전체가 링크입니다.
                  ★ 안쪽에 "상품 보기" 를 또 링크로 걸면 a 안에 a 가 되어
                    브라우저가 마크업을 고쳐 버립니다. span 으로 모양만 냅니다.
                */}
                <Link
                  href={`/brand/${brand.slug}`}
                  className="group grid grid-cols-1 items-center gap-6 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-10 md:py-10"
                >
                  {/* 대표 이미지 — 원본 비율 그대로. 틀에 맞춰 자르지 않습니다. */}
                  <div className={featured ? 'md:max-w-[620px]' : 'md:max-w-[440px]'}>
                    {brand.imageUrl ? (
                      <div className="w-full bg-stone">
                        <SafeImage
                          src={brandImage(brand)}
                          alt={`${brand.name} 브랜드 대표 이미지`}
                          label={brand.name}
                          // 원본 크기를 모르므로 비율을 찍어 두지 않습니다.
                          width={0}
                          height={0}
                          fit="natural"
                        />
                      </div>
                    ) : (
                      /* 이미지가 없으면 브랜드명을 크게. 회색 네모를 띄우지 않습니다. */
                      <div
                        className={`flex w-full items-center justify-center border border-stone px-6 ${
                          featured ? 'py-16 md:py-24' : 'py-12 md:py-16'
                        }`}
                      >
                        <span
                          className={`text-center font-display font-light leading-none tracking-[0.22em] text-ink ${
                            featured ? 'text-[32px] md:text-[46px]' : 'text-[26px] md:text-[36px]'
                          }`}
                        >
                          {brand.label}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink">
                      {/*
                        ★ 크기 예외를 주지 않습니다. 로고 크기는 이미지에 구워져 있고
                          (800×360 캔버스에 면적 기준 배치), 여기서 또 키우면 어긋납니다.
                      */}
                      <BrandMark brand={brand} size="lg" />
                      {brand.nameKo ? (
                        <span className="font-serif text-[16px] text-muted md:text-[17px]">
                          · {brand.nameKo}
                        </span>
                      ) : null}
                    </h2>

                    {brand.tagline ? (
                      <p
                        className={`mt-4 leading-[1.9] text-ink ${
                          featured ? 'text-[18px] md:text-[20px]' : 'text-[16px] md:text-[17px]'
                        }`}
                      >
                        {brand.tagline}
                      </p>
                    ) : null}

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                      <p className="text-[14px] tracking-[0.14em] text-muted">
                        {origin ? `${origin} · ` : ''}
                        {count}개 상품
                      </p>
                      <span className="inline-flex items-center gap-2 text-[14px] tracking-[0.14em] text-ink transition-opacity duration-200 group-hover:opacity-60">
                        상품 보기
                        <svg
                          width="16"
                          height="8"
                          viewBox="0 0 16 8"
                          fill="none"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M0 4h15M11.5 0.5L15 4l-3.5 3.5" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* 브랜드 페이지와 같은 SNS 줄을 여기에도 둡니다. */}
      <SnsLinks sns={sns} className="mt-14" />
    </div>
  );
}
