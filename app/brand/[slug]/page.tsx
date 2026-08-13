import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductList from '@/components/ProductList';
import SafeImage from '@/components/SafeImage';
import { brands, getBrand } from '@/lib/brands';
import { getProductsByBrand } from '@/lib/products';
import { SITE_URL, store } from '@/lib/store';

type PageProps = { params: { slug: string } };

export function generateStaticParams(): { slug: string }[] {
  return brands.map((brand) => ({ slug: brand.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const brand = getBrand(params.slug);
  if (!brand) {
    return { title: '브랜드를 찾을 수 없습니다' };
  }

  const description = `${brand.name}(${brand.nameKo}) — ${brand.tagline}. ${brand.story[0]}`;

  return {
    title: `${brand.name} — ${brand.nameKo}`,
    description,
    alternates: { canonical: `/brand/${brand.slug}` },
    openGraph: {
      title: `${brand.name} | ${store.name}`,
      description,
      url: `/brand/${brand.slug}`,
    },
  };
}

export default function BrandDetailPage({ params }: PageProps) {
  const brand = getBrand(params.slug);
  if (!brand) {
    notFound();
  }

  const items = getProductsByBrand(brand.slug);

  const brandJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Brand',
    name: brand.name,
    alternateName: brand.nameKo,
    slogan: brand.tagline,
    description: brand.story.join(' '),
    url: `${SITE_URL}/brand/${brand.slug}`,
  };

  return (
    <div className="shell py-14 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(brandJsonLd) }}
      />

      <nav aria-label="현재 위치" className="text-[11px] tracking-[0.14em] text-muted">
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
        <p className="label-xs">{brand.origin} · SINCE {brand.since}</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          {brand.nameKo}
        </h1>
        <p className="mt-3 font-display text-[22px] tracking-[0.16em] text-ink">
          {brand.label}
        </p>
        <p className="mt-5 text-[14px] leading-relaxed text-ink">{brand.tagline}</p>
      </header>

      <div className="mt-10 aspect-[4/5] w-full overflow-hidden bg-stone md:aspect-[21/9]">
        <SafeImage
          src={`/images/brands/${brand.slug}.jpg`}
          alt={`${brand.name} 브랜드 대표 이미지`}
          label={brand.name}
          width={1400}
          height={600}
          priority
        />
      </div>

      <section aria-labelledby="brand-story" className="section border-b border-stone">
        <h2 id="brand-story" className="font-serif text-[22px] text-ink md:text-[26px]">
          브랜드 소개
        </h2>
        <div className="mt-6 flex max-w-[760px] flex-col gap-6">
          {brand.story.map((paragraph) => (
            <p
              key={paragraph.slice(0, 12)}
              className="text-[14px] leading-[2.1] text-muted md:text-[15px]"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </section>

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
              <p className="text-[14px] leading-relaxed text-ink">
                준비 중인 브랜드입니다.
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
