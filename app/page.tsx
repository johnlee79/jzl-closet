import type { Metadata } from 'next';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import SafeImage from '@/components/SafeImage';
import {
  getVisibleCategories,
  getVisibleSubCategories,
  hasChildren,
} from '@/lib/categories';
import { getNewProducts, getProductsByCategorySlug } from '@/lib/products';
import { orderSteps, store } from '@/lib/store';

export const metadata: Metadata = {
  title: `${store.name} — ${store.slogan}`,
  description: `${store.intro} 의류와 가방, 슈즈, 액세서리를 소개하는 브랜드 편집숍입니다.`,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${store.name} — ${store.slogan}`,
    description: store.intro,
    url: '/',
  },
};

export default function HomePage() {
  const newProducts = getNewProducts(4);
  /** 하위 분류를 가진 대분류만 진입 블록으로 노출합니다. (전체/세일 같은 모음은 제외) */
  const entryCategories = getVisibleCategories().filter(hasChildren);

  return (
    <>
      <section aria-labelledby="hero-title" className="pb-16 pt-8 md:pb-24 md:pt-10">
        <div className="shell">
          <div className="aspect-[4/5] w-full overflow-hidden bg-stone md:aspect-[21/9]">
            <SafeImage
              src="/images/main/hero.jpg"
              alt="JZL CLOSET 시즌 캠페인 컷 — 코트와 토트백을 함께 연출한 이미지"
              label="JZL CLOSET — 메인 이미지"
              width={1400}
              height={600}
              priority
            />
          </div>

          <div className="mt-10 max-w-[640px] md:mt-14">
            <h1
              id="hero-title"
              className="font-display text-[38px] font-light leading-none tracking-[0.24em] text-ink md:text-[56px]"
            >
              JZL CLOSET
            </h1>
            <p className="mt-5 font-serif text-[18px] leading-relaxed text-ink md:text-[22px]">
              {store.slogan}
            </p>
            <p className="mt-4 text-[13px] leading-relaxed text-muted md:text-[14px]">
              {store.intro}
              <br />
              의류와 가방, 슈즈와 액세서리까지 매일의 옷차림을 정리해 주는 물건을 고릅니다.
            </p>
            <Link href="/products" className="btn-primary mt-9">
              컬렉션 보기
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="new-title" className="section border-t border-stone">
        <div className="shell">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="label-xs">NEW ARRIVAL</p>
              <h2
                id="new-title"
                className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
              >
                이번에 새로 들어온 것
              </h2>
            </div>
            <Link
              href="/products"
              className="shrink-0 text-[12px] tracking-[0.14em] text-muted underline underline-offset-4"
            >
              전체 보기
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
            {newProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 2} />
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="story-title" className="section border-t border-stone">
        <div className="shell grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-24">
          <div>
            <p className="label-xs">OUR STORY</p>
            <h2
              id="story-title"
              className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
            >
              오래 쓰는 쪽을 택합니다
            </h2>
            <Link href="/about" className="btn-secondary mt-8">
              브랜드 소개
            </Link>
          </div>
          <div className="flex flex-col gap-7">
            {store.story.map((paragraph) => (
              <p
                key={paragraph.slice(0, 12)}
                className="text-[14px] leading-[2.1] text-muted md:text-[15px]"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="category-title" className="section border-t border-stone">
        <div className="shell">
          <p className="label-xs">CATEGORY</p>
          <h2
            id="category-title"
            className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
          >
            무엇을 찾고 계신가요
          </h2>

          <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
            {entryCategories.map((category) => {
              const count = getProductsByCategorySlug(category.slug).length;
              return (
                <li key={category.slug}>
                  <Link href={`/category/${category.slug}`} className="group block">
                    <div className="aspect-[3/4] w-full overflow-hidden bg-stone">
                      <SafeImage
                        src={`/images/category/${category.slug}.jpg`}
                        alt={`${category.nameKo} 카테고리 대표 이미지 — JZL CLOSET`}
                        label={category.nameKo}
                        width={400}
                        height={533}
                      />
                    </div>
                    <h3 className="mt-4 font-serif text-[17px] text-ink">
                      {category.nameKo}
                    </h3>
                    <p className="mt-1 text-[11px] tracking-[0.14em] text-muted">
                      {category.label} · {count}개 상품
                    </p>
                  </Link>

                  <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                    {getVisibleSubCategories(category.slug)
                      .slice(0, 4)
                      .map((child) => (
                        <li key={child.slug}>
                          <Link
                            href={`/category/${category.slug}/${child.slug}`}
                            className="text-[11px] text-muted underline-offset-4 hover:text-ink hover:underline"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section aria-labelledby="order-title" className="section border-t border-stone">
        <div className="shell">
          <p className="label-xs">HOW TO ORDER</p>
          <h2
            id="order-title"
            className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
          >
            주문은 세 단계로 끝납니다
          </h2>

          <ol className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            {orderSteps.map((step) => (
              <li key={step.step} className="border-t border-stone pt-6">
                <p className="font-display text-[34px] font-light tracking-[0.1em] text-ink">
                  {step.step}
                </p>
                <h3 className="mt-3 font-serif text-[17px] text-ink">{step.title}</h3>
                <p className="mt-3 text-[13px] leading-[1.9] text-muted">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link href="/order" className="btn-primary">
              장바구니 확인
            </Link>
            <Link href="/guide" className="btn-secondary">
              배송·교환 안내
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
