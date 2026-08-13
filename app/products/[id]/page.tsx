import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';
import DetailBlocks from '@/components/DetailBlocks';
import MeasurementTable from '@/components/MeasurementTable';
import ProductCard from '@/components/ProductCard';
import ProductGallery from '@/components/ProductGallery';
import { getBrand, getBrandLabel, getBrandName } from '@/lib/brands';
import { getCategoryBySlug, getSubCategory } from '@/lib/categories';
import {
  formatPrice,
  getBrandRelated,
  getProduct,
  getRelated,
  isProductSoldOut,
  products,
} from '@/lib/products';
import { SITE_URL, store } from '@/lib/store';

type PageProps = { params: { id: string } };

export function generateStaticParams(): { id: string }[] {
  return products.map((product) => ({ id: product.id }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const product = getProduct(params.id);
  if (!product) {
    return { title: '상품을 찾을 수 없습니다' };
  }

  const brandName = getBrandName(product.brand);
  const description = `${brandName} ${product.name} — ${product.summary} 가격 ${formatPrice(product.price)}원. ${store.name}에서 만나보세요.`;

  return {
    title: `${product.name} — ${brandName}`,
    description,
    alternates: { canonical: `/products/${product.id}` },
    openGraph: {
      type: 'article',
      title: `${product.name} | ${store.name}`,
      description,
      url: `/products/${product.id}`,
      images: [{ url: product.thumbnails[0], alt: `${brandName} ${product.name}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | ${store.name}`,
      description,
    },
  };
}

export default function ProductDetailPage({ params }: PageProps) {
  const product = getProduct(params.id);
  if (!product) {
    notFound();
  }

  const brand = getBrand(product.brand);
  const brandName = getBrandName(product.brand); // alt·JSON-LD 용 정식 명칭
  const brandLabel = getBrandLabel(product.brand); // 화면 출력용
  const category = getCategoryBySlug(product.category);
  const subCategory = getSubCategory(product.category, product.subCategory);
  const related = getRelated(product, 4);
  const brandRelated = getBrandRelated(product, 4);
  const soldOut = isProductSoldOut(product);
  const discount =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round((1 - product.price / product.originalPrice) * 100)
      : 0;

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.thumbnails.map((src) => `${SITE_URL}${src}`),
    description: `${product.summary} — ${product.detail
      .filter(
        (block): block is { type: 'text'; heading?: string; body: string } =>
          block.type === 'text'
      )
      .map((block) => block.body)
      .join(' ')
      .slice(0, 300)}`,
    sku: product.id,
    category: [category?.nameKo, subCategory?.nameKo].filter(Boolean).join(' > '),
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/products/${product.id}`,
      price: product.price,
      priceCurrency: 'KRW',
      availability: soldOut
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: store.name,
      },
    },
  };

  const breadcrumbItems = [
    { name: '홈', item: SITE_URL },
    { name: '전체 상품', item: `${SITE_URL}/products` },
    category
      ? { name: category.nameKo, item: `${SITE_URL}/category/${category.slug}` }
      : null,
    subCategory && category
      ? {
          name: subCategory.nameKo,
          item: `${SITE_URL}/category/${category.slug}/${subCategory.slug}`,
        }
      : null,
    { name: product.name, item: `${SITE_URL}/products/${product.id}` },
  ].filter((item): item is { name: string; item: string } => item !== null);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };

  return (
    <article className="shell py-10 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
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
            <Link href="/products" className="hover:text-ink">
              전체 상품
            </Link>
          </li>
          {category ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={`/category/${category.slug}`} className="hover:text-ink">
                  {category.nameKo}
                </Link>
              </li>
            </>
          ) : null}
          {category && subCategory ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/category/${category.slug}/${subCategory.slug}`}
                  className="hover:text-ink"
                >
                  {subCategory.nameKo}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden="true">/</li>
          <li className="text-ink">{product.name}</li>
        </ol>
      </nav>

      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        <ProductGallery
          images={product.thumbnails}
          productName={product.name}
          brand={brandName}
        />

        <section aria-label="상품 정보" className="lg:pt-4">
          <Link
            href={`/brand/${product.brand}`}
            className="text-[12px] tracking-[0.16em] text-muted underline-offset-4 hover:underline"
          >
            {brandLabel}
          </Link>
          <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[32px]">
            {product.name}
          </h1>
          <p className="mt-4 text-[13px] leading-[1.9] text-muted md:text-[14px]">
            {product.summary}
          </p>

          <div className="mt-8 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-[32px] tracking-wide text-ink md:text-[38px]">
              {formatPrice(product.price)}
              <span className="ml-1 font-sans text-[14px]">원</span>
            </span>
            {product.originalPrice ? (
              <span className="text-[14px] text-muted line-through">
                {formatPrice(product.originalPrice)}원
              </span>
            ) : null}
            {discount > 0 ? (
              <span className="border border-wine px-2 py-1 text-[11px] tracking-[0.14em] text-wine">
                {discount}% OFF
              </span>
            ) : null}
            {product.isOutlet ? (
              <span className="border border-ink px-2 py-1 text-[11px] tracking-[0.14em] text-ink">
                OUTLET
              </span>
            ) : null}
          </div>

          <dl className="mt-8 flex flex-col gap-2 border-t border-stone pt-6 text-[12px]">
            <div className="flex gap-4">
              <dt className="w-20 shrink-0 text-muted">카테고리</dt>
              <dd className="text-ink">
                {[category?.nameKo, subCategory?.nameKo].filter(Boolean).join(' · ')}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-20 shrink-0 text-muted">배송</dt>
              <dd className="text-ink">주문 확인 후 1~3영업일 내 출고</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-20 shrink-0 text-muted">문의</dt>
              <dd className="text-ink">{store.phone}</dd>
            </div>
          </dl>

          <AddToCartButton product={product} />
        </section>
      </div>

      <section aria-labelledby="detail-title" className="section border-t border-stone">
        <h2 id="detail-title" className="sr-only">
          {product.name} 상세 설명
        </h2>
        <DetailBlocks blocks={product.detail} productName={product.name} />

        {product.measurements ? (
          <div className="mx-auto mt-16 w-full max-w-[860px] md:mt-24">
            <MeasurementTable
              measurements={product.measurements}
              productName={product.name}
            />
          </div>
        ) : null}
      </section>

      {brand ? (
        <section aria-labelledby="brand-title" className="section border-t border-stone">
          <p className="label-xs">BRAND</p>
          <h2
            id="brand-title"
            className="mt-3 font-serif text-[22px] leading-snug text-ink md:text-[28px]"
          >
            {brand.label}
          </h2>
          <p className="mt-4 max-w-[720px] text-[13px] leading-[1.9] text-muted md:text-[14px]">
            {brand.story[0]}
          </p>
          <Link href={`/brand/${brand.slug}`} className="btn-secondary mt-8">
            브랜드 소개 보기
          </Link>

          {brandRelated.length > 0 ? (
            <>
              <h3 className="mt-16 font-serif text-[18px] text-ink">
                이 브랜드의 다른 상품
              </h3>
              <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
                {brandRelated.map((item) => (
                  <ProductCard key={item.id} product={item} />
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="related-title" className="section border-t border-stone">
        <p className="label-xs">RELATED</p>
        <h2
          id="related-title"
          className="mt-3 font-serif text-[22px] leading-snug text-ink md:text-[28px]"
        >
          함께 보면 좋은 상품
        </h2>
        <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
          {related.map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
        </div>
      </section>
    </article>
  );
}
