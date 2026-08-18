import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/store';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductList from '@/components/ProductList';
import {
  findVisibleCategory,
  visibleCategories,
  visibleSubCategories,
} from '@/lib/categories';
import { getProductsByCategory } from '@/lib/products';
import { getCachedStore } from '@/lib/settings';
import { getCachedCategories } from '@/lib/taxonomy';

type PageProps = { params: { slug: string } };

export const revalidate = 60;
/** 관리자에서 분류를 새로 만들면 첫 요청 때 서버에서 구워 내보냅니다. */
export const dynamicParams = true;

/** 노출 중인 대분류만 정적 생성합니다. isVisible:false 는 라우트 자체가 만들어지지 않습니다. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const categories = await getCachedCategories();
  return visibleCategories(categories).map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [categories, store] = await Promise.all([getCachedCategories(), getCachedStore()]);
  const category = findVisibleCategory(categories, params.slug);
  if (!category) {
    return { title: '카테고리를 찾을 수 없습니다' };
  }

  const description = `${store.name}의 ${category.nameKo} 상품입니다. ${category.description}`;

  return {
    title: category.nameKo,
    description,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: `${category.nameKo} | ${store.name}`,
      description,
      url: `/category/${category.slug}`,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const categories = await getCachedCategories();
  const category = findVisibleCategory(categories, params.slug);
  if (!category) {
    notFound();
  }

  const items = await getProductsByCategory(category.slug);
  const menu = visibleCategories(categories);
  const subs = visibleSubCategories(categories, category.slug);

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
          <li className="text-ink">{category.nameKo}</li>
        </ol>
      </nav>

      <header className="mt-8 max-w-[680px]">
        <p className="label-xs">{category.label}</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          {category.nameKo}
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          {category.description}
        </p>
      </header>

      <nav aria-label="카테고리" className="mt-10">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {menu.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/category/${item.slug}`}
                aria-current={item.slug === category.slug ? 'page' : undefined}
                className={`text-[15px] tracking-[0.1em] transition-colors duration-200 ${
                  item.slug === category.slug
                    ? 'text-ink underline decoration-wine underline-offset-[6px]'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label={`${category.nameKo} 상품 목록`} className="mt-10">
        <ProductList
          products={items}
          subFilter={
            subs.length > 0
              ? {
                  items: subs.map((sub) => ({ slug: sub.slug, label: sub.label })),
                  basePath: `/category/${category.slug}`,
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}
