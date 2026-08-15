import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductList from '@/components/ProductList';
import BrandMark from '@/components/BrandMark';
import SafeImage from '@/components/SafeImage';
import { brandImage, findBrand } from '@/lib/brands';
import { getProductsByBrand } from '@/lib/products';
import { getCachedStore } from '@/lib/settings';
import { SITE_URL } from '@/lib/store';
import { getCachedBrands } from '@/lib/taxonomy';

type PageProps = { params: { slug: string } };

export const revalidate = 60;
/** 관리자에서 브랜드를 새로 만들면 첫 요청 때 서버에서 구워 내보냅니다. */
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const brands = await getCachedBrands();
  return brands.map((brand) => ({ slug: brand.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [brands, store] = await Promise.all([getCachedBrands(), getCachedStore()]);
  const brand = findBrand(brands, params.slug);
  if (!brand) {
    return { title: '브랜드를 찾을 수 없습니다' };
  }

  // 브랜드 스토리 첫 문단을 설명으로 씁니다. 검색 결과에 그대로 노출됩니다.
  const description = [
    `${brand.name}${brand.nameKo ? `(${brand.nameKo})` : ''}`,
    brand.tagline,
    brand.story[0],
  ]
    .filter(Boolean)
    .join(' — ')
    .slice(0, 300);

  return {
    title: brand.nameKo ? `${brand.name} — ${brand.nameKo}` : brand.name,
    description,
    alternates: { canonical: `/brand/${brand.slug}` },
    openGraph: {
      title: `${brand.name} | ${store.name}`,
      description,
      url: `/brand/${brand.slug}`,
      images: brand.imageUrl ? [{ url: brand.imageUrl, alt: brand.name }] : undefined,
    },
  };
}

export default async function BrandDetailPage({ params }: PageProps) {
  const brands = await getCachedBrands();
  const brand = findBrand(brands, params.slug);
  if (!brand) {
    notFound();
  }

  const [items, store] = await Promise.all([
    getProductsByBrand(brand.slug),
    getCachedStore(),
  ]);

  const brandJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Brand',
    name: brand.name,
    alternateName: brand.nameKo || undefined,
    slogan: brand.tagline || undefined,
    description: brand.story.join(' '),
    url: `${SITE_URL}/brand/${brand.slug}`,
    logo: brand.imageUrl || undefined,
  };

  return (
    <div className="shell py-14 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(brandJsonLd) }}
      />

      <nav aria-label="현재 위치" className="text-[13px] tracking-[0.14em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-ink">
              HOME
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/brand" className="hover:text-ink">
              브랜드
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-ink">{brand.label}</li>
        </ol>
      </nav>

      <header className="mt-8 max-w-[680px]">
        {brand.origin || brand.since ? (
          <p className="label-xs">
            {[brand.origin, brand.since ? `SINCE ${brand.since}` : ''].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          {brand.nameKo || brand.name}
        </h1>
        {/* 로고를 올린 브랜드는 로고로, 아니면 브랜드명을 글자로 보여 줍니다. */}
        <div className="mt-3 flex items-center text-ink">
          <BrandMark brand={brand} size="lg" />
        </div>
        {brand.tagline ? (
          <p className="mt-5 text-[16px] leading-relaxed text-ink">{brand.tagline}</p>
        ) : null}
      </header>

      <div className="mt-10 aspect-[4/5] w-full overflow-hidden bg-stone md:aspect-[21/9]">
        <SafeImage
          src={brandImage(brand)}
          alt={`${brand.name} 브랜드 대표 이미지`}
          label={brand.name}
          width={1400}
          height={600}
          priority
        />
      </div>

      {/* ★ 브랜드 스토리 — 검색 유입 경로입니다. 실제 텍스트로 출력합니다. */}
      {brand.story.length > 0 ? (
        <section aria-labelledby="brand-story" className="section border-b border-stone">
          <h2 id="brand-story" className="font-serif text-[22px] text-ink md:text-[26px]">
            {brand.name} 브랜드 소개
          </h2>
          <div className="mt-6 flex max-w-[760px] flex-col gap-6">
            {brand.story.map((paragraph, index) => (
              <p
                key={index}
                className="text-[16px] leading-[2.1] text-ink md:text-[17px]"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="brand-products" className="mt-14">
        <h2
          id="brand-products"
          className="font-serif text-[22px] text-ink md:text-[26px]"
        >
          {brand.label} 상품
        </h2>
        <div className="mt-8">
          {items.length === 0 ? (
            <div className="border-t border-stone py-16">
              <p className="text-[16px] leading-relaxed text-ink">
                준비 중인 브랜드입니다. 입고 소식은 고객센터 {store.phone}으로 문의해
                주세요.
              </p>
              <Link href="/products" className="btn-primary mt-8">
                전체 상품 보기
              </Link>
            </div>
          ) : (
            <ProductList products={items} showBrandFilter={false} />
          )}
        </div>
      </section>
    </div>
  );
}
