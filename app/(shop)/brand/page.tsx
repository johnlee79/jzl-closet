import type { Metadata } from 'next';
import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import SafeImage from '@/components/SafeImage';
import { brandImage, visibleBrands } from '@/lib/brands';
import { getProducts } from '@/lib/products';
import { getCachedStore } from '@/lib/settings';
import { getCachedBrands } from '@/lib/taxonomy';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: '브랜드',
    description: `${store.name}이 소개하는 브랜드입니다. 브랜드별 소개와 취급 상품을 확인하세요.`,
    alternates: { canonical: '/brand' },
    openGraph: {
      title: `브랜드 | ${store.name}`,
      description: `${store.name}이 소개하는 브랜드 목록입니다.`,
      url: '/brand',
    },
  };
}

export default async function BrandListPage() {
  const [allProducts, allBrands, store] = await Promise.all([
    getProducts(),
    getCachedBrands(),
    getCachedStore(),
  ]);

  const countByBrand = allProducts.reduce<Record<string, number>>((acc, product) => {
    if (product.brandSlug) acc[product.brandSlug] = (acc[product.brandSlug] ?? 0) + 1;
    return acc;
  }, {});

  // 강조 브랜드를 앞으로 올립니다. 그 안에서는 등록 순서를 지킵니다.
  const list = visibleBrands(allBrands);
  const brands = [
    ...list.filter((brand) => brand.isFeatured),
    ...list.filter((brand) => !brand.isFeatured),
  ];

  return (
    <div className="shell py-14 md:py-20">
      <nav aria-label="현재 위치" className="text-[13px] tracking-[0.14em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-ink">
              HOME
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-ink">브랜드</li>
        </ol>
      </nav>

      <header className="mt-8 max-w-[680px]">
        <p className="label-xs">BRAND</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          브랜드
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          {store.name}이 함께 일하는 브랜드입니다. 브랜드마다 만드는 방식과 기준이 달라,
          같은 품목이라도 결과가 다릅니다.
        </p>
      </header>

      <ul className="mt-14 grid grid-cols-1 gap-x-6 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand) => {
          const count = countByBrand[brand.slug] ?? 0;
          return (
            <li key={brand.slug} className={brand.isFeatured ? 'md:col-span-2' : undefined}>
              <article>
                <Link href={`/brand/${brand.slug}`} className="block">
                  <div
                    className={`w-full overflow-hidden bg-stone ${
                      brand.isFeatured ? 'aspect-[16/9]' : 'aspect-[4/3]'
                    }`}
                  >
                    <SafeImage
                      src={brandImage(brand)}
                      alt={`${brand.name} 브랜드 대표 이미지`}
                      label={brand.name}
                      width={brand.isFeatured ? 1200 : 640}
                      height={brand.isFeatured ? 675 : 480}
                    />
                  </div>
                  {/* 로고가 있으면 로고, 없으면 브랜드명 — 목록에서도 같은 규칙입니다. */}
                  <h2 className="mt-5 flex items-center text-ink">
                    <BrandMark brand={brand} size="lg" className="!text-[20px] md:!text-[22px]" />
                  </h2>
                  {brand.nameKo ? (
                    <p className="mt-1 font-serif text-[15px] text-muted">{brand.nameKo}</p>
                  ) : null}
                  {brand.tagline ? (
                    <p className="mt-3 text-[15px] leading-[1.9] text-ink">{brand.tagline}</p>
                  ) : null}
                  <p className="mt-3 text-[13px] tracking-[0.14em] text-muted">
                    {count}개 상품
                    {brand.origin ? ` · ${brand.origin}` : ''}
                    {brand.since ? ` · SINCE ${brand.since}` : ''}
                  </p>
                </Link>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
