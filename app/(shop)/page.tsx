import type { Metadata } from 'next';
import Link from 'next/link';
import BrandStrip from '@/components/BrandStrip';
import MainBanner from '@/components/MainBanner';
import ProductCard from '@/components/ProductCard';
import RecentlyViewed from '@/components/RecentlyViewed';
import SafeImage from '@/components/SafeImage';
import { visibleBrands } from '@/lib/brands';
import { hasVisibleChildren, visibleCategories, visibleSubCategories } from '@/lib/categories';
import { resolveCopy } from '@/lib/copy';
import { getProducts } from '@/lib/products';
import { getCachedCopy, getCachedDesign, getCachedStore } from '@/lib/settings';
import { getTaxonomy } from '@/lib/taxonomy';

/** ISR — 60초마다 다시 굽고, 관리자가 저장하면 revalidatePath 로 즉시 갱신됩니다. */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: `${store.name} — ${store.slogan}`,
    description: `${store.intro} 의류와 가방, 슈즈, 액세서리를 소개하는 브랜드 편집숍입니다.`,
    alternates: { canonical: '/' },
    openGraph: {
      title: `${store.name} — ${store.slogan}`,
      description: store.intro,
      url: '/',
    },
  };
}

export default async function HomePage() {
  // ★ 분류와 브랜드는 getTaxonomy 가 한 번에 돌려줍니다. 브랜드를 따로 읽지 않습니다.
  const [allProducts, { categories, brands }, store, copy, design] = await Promise.all([
    getProducts(),
    getTaxonomy(),
    getCachedStore(),
    getCachedCopy(),
    getCachedDesign(),
  ]);

  const newProducts = [
    ...allProducts.filter((product) => product.isNew),
    ...allProducts.filter((product) => !product.isNew),
  ].slice(0, 4);

  /** 하위 분류를 가진 대분류만 진입 블록으로 노출합니다. (전체/세일 같은 모음은 제외) */
  const entryCategories = visibleCategories(categories).filter(hasVisibleChildren);
  const countByCategory = allProducts.reduce<Record<string, number>>((acc, product) => {
    acc[product.categorySlug] = (acc[product.categorySlug] ?? 0) + 1;
    return acc;
  }, {});

  /*
   * 메인에 늘어놓을 브랜드. (3-H C-3)
   *
   * ★ 노출을 켠 브랜드만, 관리자가 정한 순서대로입니다.
   *   visibleBrands 가 이미 order 오름차순으로 돌려주므로 여기서 다시 정렬하지 않습니다.
   * ★ 상품이 하나도 없는 브랜드는 뺍니다. 눌러서 빈 페이지가 나오면
   *   "취급 브랜드" 라고 써 둔 말이 거짓이 됩니다.
   *   자체 기획 라인(jzl-closet)도 상품이 생기기 전까지는 이 규칙으로 저절로 빠집니다.
   * ★ 이 때문에 DB 조회가 늘지는 않습니다. 위에서 이미 읽은 allProducts 를 셉니다.
   */
  const productCountByBrand = allProducts.reduce<Record<string, number>>((acc, product) => {
    if (product.brandSlug) acc[product.brandSlug] = (acc[product.brandSlug] ?? 0) + 1;
    return acc;
  }, {});
  const homeBrands = visibleBrands(brands).filter(
    (brand) => (productCountByBrand[brand.slug] ?? 0) > 0
  );

  const hero = resolveCopy(copy.homeHero, store)[0];
  const story = resolveCopy(copy.homeStory, store);
  const steps = resolveCopy(copy.orderSteps, store);

  /** 등록한 배너 중 이미지가 있고 노출 중인 것만 씁니다. */
  const banners = design.banners.filter((banner) => banner.isVisible && banner.imageUrl);

  return (
    <>
      <section aria-labelledby="hero-title" className="pb-16 pt-8 md:pb-24 md:pt-10">
        <div className="shell">
          {banners.length > 0 ? (
            <MainBanner banners={banners} interval={design.interval} />
          ) : (
            <div className="aspect-[4/5] w-full overflow-hidden bg-stone md:aspect-[21/9]">
              <SafeImage
                src="/images/main/hero.jpg"
                alt={`${store.name} 시즌 캠페인 컷 — 코트와 토트백을 함께 연출한 이미지`}
                label={`${store.name} — 메인 이미지`}
                width={1400}
                height={600}
                priority
              />
            </div>
          )}

          <div className="mt-10 max-w-[640px] md:mt-14">
            <h1
              id="hero-title"
              className="font-display text-[38px] font-light leading-none tracking-[0.24em] text-ink md:text-[56px]"
            >
              {store.name}
            </h1>
            {hero?.heading ? (
              <p className="mt-5 font-serif text-[18px] leading-relaxed text-ink md:text-[22px]">
                {hero.heading}
              </p>
            ) : null}
            {hero?.html ? (
              <div
                className="detail-body mt-4 text-[16px] leading-relaxed text-ink md:text-[17px]"
                dangerouslySetInnerHTML={{ __html: hero.html }}
              />
            ) : null}
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
              className="shrink-0 text-[13px] tracking-[0.14em] text-muted underline underline-offset-4"
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
              {story[0]?.heading || '오래 쓰는 쪽을 택합니다'}
            </h2>
            {/* ★ /about 은 편집숍 자체 소개입니다. 헤더·푸터와 이름을 맞춥니다. (3-H A-1) */}
            <Link href="/about" className="btn-secondary mt-8">
              편집숍 소개
            </Link>
          </div>
          <div className="flex flex-col gap-7">
            {story.map((block, index) => (
              <div
                key={index}
                className="detail-body text-[16px] leading-[2.1] text-ink md:text-[17px]"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
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
              const count = countByCategory[category.slug] ?? 0;
              return (
                <li key={category.slug}>
                  <Link href={`/category/${category.slug}`} className="group block">
                    <div className="aspect-[3/4] w-full overflow-hidden bg-stone">
                      <SafeImage
                        src={`/images/category/${category.slug}.jpg`}
                        alt={`${category.nameKo} 카테고리 대표 이미지 — ${store.name}`}
                        label={category.nameKo}
                        width={400}
                        height={533}
                      />
                    </div>
                    <h3 className="mt-4 font-serif text-[19px] text-ink">
                      {category.nameKo}
                    </h3>
                    <p className="mt-1 text-[13px] tracking-[0.14em] text-muted">
                      {category.label} · {count}개 상품
                    </p>
                  </Link>

                  <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                    {visibleSubCategories(categories, category.slug)
                      .slice(0, 4)
                      .map((child) => (
                        <li key={child.slug}>
                          <Link
                            href={`/category/${category.slug}/${child.slug}`}
                            className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
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

      {/*
        취급 브랜드 (3-H C-3)
        ★ HOW TO ORDER 가 있던 자리입니다. 주문 방법은 아래로 내렸습니다.
          편집숍에서 첫 방문자가 가장 궁금해하는 것은 "어떤 브랜드를 다루는가" 이고,
          주문 방법은 살 마음을 먹은 뒤에야 읽습니다. 순서를 바꿔 둡니다.
      */}
      <BrandStrip brands={homeBrands} className="section border-t border-stone" />

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
            {steps.map((step, index) => (
              <li key={index} className="border-t border-stone pt-6">
                <p className="font-display text-[34px] font-light tracking-[0.1em] text-ink">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-3 font-serif text-[19px] text-ink">{step.heading}</h3>
                <div
                  className="detail-body mt-3 text-[15px] leading-[1.9] text-ink"
                  dangerouslySetInnerHTML={{ __html: step.html }}
                />
              </li>
            ))}
          </ol>

          <div className="btn-row mt-12">
            <Link href="/order" className="btn-primary">
              장바구니 확인
            </Link>
            <Link href="/guide" className="btn-secondary">
              배송·교환 안내
            </Link>
          </div>
        </div>
      </section>

      {/*
        최근 본 상품 (3-H C-1) — 기록이 있을 때만 나옵니다.
        ★ 브라우저에 남은 기록으로 그리므로 첫 방문자에게는 이 자리가 없습니다.
          메인은 ISR 로 구워 두는 페이지지만 이 부분만 브라우저에서 따로 그립니다.
      */}
      <div className="shell">
        <RecentlyViewed className="section border-t border-stone" />
      </div>
    </>
  );
}
