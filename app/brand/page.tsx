import type { Metadata } from 'next';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import { brands } from '@/lib/brands';
import { getProductsByBrand } from '@/lib/products';
import { store } from '@/lib/store';

export const metadata: Metadata = {
  title: '브랜드',
  description: `${store.name}이 소개하는 브랜드입니다. 브랜드별 소개와 취급 상품을 확인하세요.`,
  alternates: { canonical: '/brand' },
  openGraph: {
    title: `브랜드 | ${store.name}`,
    description: `${store.name}이 소개하는 브랜드 목록입니다.`,
    url: '/brand',
  },
};

export default function BrandListPage() {
  return (
    <div className="shell py-14 md:py-20">
      <nav aria-label="현재 위치" className="text-[11px] tracking-[0.14em] text-muted">
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
        <p className="mt-4 text-[13px] leading-[1.9] text-muted md:text-[14px]">
          {store.name}이 함께 일하는 브랜드입니다. 브랜드마다 만드는 방식과 기준이 달라,
          같은 품목이라도 결과가 다릅니다.
        </p>
      </header>

      <ul className="mt-14 grid grid-cols-1 gap-x-6 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand) => {
          const count = getProductsByBrand(brand.slug).length;
          return (
            <li key={brand.slug}>
              <article>
                <Link href={`/brand/${brand.slug}`} className="block">
                  <div className="aspect-[4/3] w-full overflow-hidden bg-stone">
                    <SafeImage
                      src={`/images/brands/${brand.slug}.jpg`}
                      alt={`${brand.name} 브랜드 대표 이미지`}
                      label={brand.name}
                      width={640}
                      height={480}
                    />
                  </div>
                  <h2 className="mt-5 font-display text-[20px] tracking-[0.16em] text-ink">
                    {brand.label}
                  </h2>
                  <p className="mt-1 font-serif text-[13px] text-muted">{brand.nameKo}</p>
                  <p className="mt-3 text-[13px] leading-[1.9] text-muted">
                    {brand.tagline}
                  </p>
                  <p className="mt-3 text-[11px] tracking-[0.14em] text-muted">
                    {count}개 상품 · {brand.origin} · SINCE {brand.since}
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
