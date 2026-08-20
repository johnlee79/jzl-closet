import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductList from '@/components/ProductList';
import {
  findSubCategory,
  findVisibleCategory,
  visibleCategories,
  visibleSubCategories,
} from '@/lib/categories';
import { getProductsByCategory } from '@/lib/products';
import {
  getCachedStore,
  getOgImage,
} from '@/lib/settings';
import { SITE_URL } from '@/lib/store';
import { getCachedCategories } from '@/lib/taxonomy';

type PageProps = { params: { slug: string; sub: string } };

export const revalidate = 60;
export const dynamicParams = true;

/** 노출 중인 대분류의 노출 중인 children 을 모두 정적 생성합니다. */
export async function generateStaticParams(): Promise<{ slug: string; sub: string }[]> {
  const categories = await getCachedCategories();
  return visibleCategories(categories).flatMap((category) =>
    visibleSubCategories(categories, category.slug).map((child) => ({
      slug: category.slug,
      sub: child.slug,
    }))
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [categories, store] = await Promise.all([getCachedCategories(), getCachedStore()]);
  const category = findVisibleCategory(categories, params.slug);
  const sub = category ? findSubCategory(categories, category.slug, params.sub) : undefined;
  if (!category || !sub) {
    return { title: '카테고리를 찾을 수 없습니다' };
  }

  const description = `${store.name}의 ${category.nameKo} 중 ${sub.nameKo} 상품입니다. ${category.description}`;

  return {
    title: `${sub.nameKo} — ${category.nameKo}`,
    description,
    alternates: { canonical: `/category/${category.slug}/${sub.slug}` },
    openGraph: {
      title: `${sub.nameKo} | ${store.name}`,
      description,
      url: `/category/${category.slug}/${sub.slug}`,
      images: [await getOgImage()],
    },
  };
}

export default async function SubCategoryPage({ params }: PageProps) {
  const categories = await getCachedCategories();
  const category = findVisibleCategory(categories, params.slug);
  const sub = category ? findSubCategory(categories, category.slug, params.sub) : undefined;
  if (!category || !sub) {
    notFound();
  }

  const items = await getProductsByCategory(category.slug, sub.slug);
  const subs = visibleSubCategories(categories, category.slug);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: category.nameKo,
        item: `${SITE_URL}/category/${category.slug}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: sub.nameKo,
        item: `${SITE_URL}/category/${category.slug}/${sub.slug}`,
      },
    ],
  };

  return (
    <div className="shell py-14 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <nav aria-label="현재 위치" className="text-[14px] tracking-[0.14em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-ink">
              HOME
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/category/${category.slug}`} className="hover:text-ink">
              {category.nameKo}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-ink">{sub.nameKo}</li>
        </ol>
      </nav>

      <header className="mt-8 max-w-[680px]">
        <p className="label-xs">
          {category.label} · {sub.label}
        </p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          {sub.nameKo}
        </h1>
        <p className="mt-4 text-[17px] leading-[1.9] text-ink md:text-[18px]">
          {sub.description || `${category.nameKo} 가운데 ${sub.nameKo} 상품입니다. ${category.description}`}
        </p>
      </header>

      <section aria-label={`${sub.nameKo} 상품 목록`} className="mt-10">
        <ProductList
          products={items}
          subFilter={{
            items: subs.map((child) => ({ slug: child.slug, label: child.label })),
            basePath: `/category/${category.slug}`,
            activeSlug: sub.slug,
          }}
        />
      </section>
    </div>
  );
}
