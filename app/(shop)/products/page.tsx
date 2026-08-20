import type { Metadata } from 'next';
import Link from 'next/link';
import ProductList from '@/components/ProductList';
import { visibleCategories } from '@/lib/categories';
import { getProducts } from '@/lib/products';
import {
  getCachedStore,
  getOgImage,
} from '@/lib/settings';
import { getCachedCategories } from '@/lib/taxonomy';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: '전체 상품',
    description: `${store.name}의 전체 상품입니다. 의류, 가방·지갑, 슈즈, 액세서리를 카테고리와 브랜드, 가격순으로 살펴보세요.`,
    alternates: { canonical: '/products' },
    openGraph: {
      title: `전체 상품 | ${store.name}`,
      description: `${store.name}의 의류, 가방·지갑, 슈즈, 액세서리 전체 목록입니다.`,
      url: '/products',
      images: [await getOgImage()],
    },
  };
}

export default async function ProductsPage() {
  const [categories, products] = await Promise.all([
    getCachedCategories(),
    getProducts(),
  ]);
  const menu = visibleCategories(categories);

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[640px]">
        <p className="label-xs">ALL PRODUCTS</p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          전체 상품
        </h1>
        <p className="mt-4 text-[17px] leading-[1.9] text-ink md:text-[18px]">
          매일 손이 가는 물건만 남겼습니다. 총 {products.length}개의 상품을 카테고리와
          브랜드, 가격 순으로 정리해 두었습니다.
        </p>
      </header>

      {/* 대분류 이동 — 소분류 필터는 각 카테고리 페이지에서 제공합니다. */}
      <nav aria-label="카테고리" className="mt-10">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {menu.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/category/${category.slug}`}
                className="text-[16px] tracking-[0.1em] text-ink transition-colors duration-200 hover:text-ink"
              >
                {category.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label="상품 목록" className="mt-10">
        <ProductList products={products} />
      </section>
    </div>
  );
}
