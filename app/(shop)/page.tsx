import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/store';
import Link from 'next/link';
import BrandStrip from '@/components/BrandStrip';
import CategoryList from '@/components/CategoryList';
import MainBanner from '@/components/MainBanner';
import ProductCard from '@/components/ProductCard';
import RecentlyViewed from '@/components/RecentlyViewed';
import SafeImage from '@/components/SafeImage';
import { visibleBrands } from '@/lib/brands';
import { hasVisibleChildren, visibleCategories, visibleSubCategories } from '@/lib/categories';
import { resolveCopy } from '@/lib/copy';
import { getProducts } from '@/lib/products';
import {
  getCachedCopy,
  getCachedDesign,
  getCachedHeroButtons,
  getCachedStore,
} from '@/lib/settings';
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
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function HomePage() {
  // ★ 분류와 브랜드는 getTaxonomy 가 한 번에 돌려줍니다. 브랜드를 따로 읽지 않습니다.
  const [allProducts, { categories, brands }, store, copy, design, heroButtons] =
    await Promise.all([
      getProducts(),
      getTaxonomy(),
      getCachedStore(),
      getCachedCopy(),
      getCachedDesign(),
      getCachedHeroButtons(),
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
  // ★ orderSteps 는 3-J 에서 메인에서 뺐습니다. /order 페이지에서만 씁니다.
  const categoryHead = resolveCopy(copy.homeCategory, store)[0] ?? { heading: '', html: '' };

  /*
    등록한 배너 중 이미지가 있고 노출 중인 것만 씁니다.
    ★ 관리자에서 '메인 배너' 섹션을 끄면 배너가 있어도 그리지 않습니다. (3-K)
    ★ 예전에는 배너가 없을 때 /images/main/hero.jpg 를 대신 깔았습니다.
      그런데 그 파일이 없어(README.txt 뿐) 큰 회색 상자만 남았습니다.
      배너가 없으면 아무것도 그리지 않고 곧바로 브랜드명부터 시작합니다.
  */
  const sections = design.sections;
  const banners = sections.banner
    ? design.banners.filter((banner) => banner.isVisible && banner.imageUrl)
    : [];

  return (
    <>
      {/*
        ★ 배너와 히어로는 한 섹션 안에 있지만 관리자에서 따로 켜고 끕니다.
          둘 다 꺼져 있으면 섹션 태그째 그리지 않습니다. 빈 여백이 남지 않습니다.
      */}
      {banners.length > 0 || sections.hero ? (
        <section aria-labelledby="hero-title" className="pb-16 pt-8 md:pb-24 md:pt-10">
        <div className="shell">
          {banners.length > 0 ? (
            <MainBanner banners={banners} interval={design.interval} />
          ) : null}

          {sections.hero ? (
          <div className={`max-w-[640px] ${banners.length > 0 ? 'mt-10 md:mt-14' : ''}`}>
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
            {/*
              히어로 버튼 (3-J)
              ★ .btn-row 를 씁니다. 두 버튼의 높이·좌우 여백·글자 크기가 한 규칙에서
                나오므로 나란히 놓았을 때 어긋나지 않고, 좁은 화면에서는 폭을 반씩
                나눠 가지며 글자와 여백이 함께 줄어듭니다. (3-H 에서 만든 규칙)
              ★ 두 번째 버튼은 문구를 비우면 사라집니다. 그때 .btn-row 의
                :only-child 규칙이 첫 버튼을 제 폭으로 되돌립니다.
            */}
            <div className="btn-row mt-9 max-w-[420px]">
              <Link href={heroButtons.primaryHref} className="btn-primary">
                {heroButtons.primaryLabel}
              </Link>
              {heroButtons.secondaryLabel ? (
                <Link href={heroButtons.secondaryHref} className="btn-secondary">
                  {heroButtons.secondaryLabel}
                </Link>
              ) : null}
            </div>
          </div>
          ) : null}
        </div>
        </section>
      ) : null}

      {sections.newArrival ? (
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
      ) : null}

      {sections.selection ? (
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
      ) : null}

      {sections.category ? (
      <section aria-label="카테고리" className="section border-t border-stone">
        <div className="shell">
          {/*
            ★ 제목과 설명은 관리자 문구에서 옵니다. 기본값은 비어 있어 아무것도 안 나옵니다. (3-J)
              예전에는 '무엇을 찾고 계신가요' 가 적혀 있었는데, 바로 아래에 분류 네 칸이
              이어지는 자리라 굳이 물어볼 이유가 없고 아무 정보도 주지 않는 문장이었습니다.
              운영자가 관리자에 적으면 다시 나옵니다.
            ★ 영문 라벨 CATEGORY 는 그대로 둡니다. 섹션을 구분하는 표지입니다.
          */}
          <p className="label-xs">CATEGORY</p>
          {categoryHead.heading ? (
            <h2
              id="category-title"
              className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
            >
              {categoryHead.heading}
            </h2>
          ) : null}
          {categoryHead.html ? (
            <div
              className="detail-body mt-4 max-w-[640px] text-[16px] leading-[1.9] text-ink"
              dangerouslySetInnerHTML={{ __html: categoryHead.html }}
            />
          ) : null}

          {/*
            ★ 네 개 이하면 지금처럼 격자, 다섯 개부터 가로로 밀어 보게 바꿉니다. (3-L)
              격자에 다섯 개가 들어오면 한 줄에 넷, 다음 줄에 하나가 덩그러니 남습니다.
            ★ 가로로 갈 때는 칸마다 폭을 정해 줍니다. 격자와 달리 스스로 폭을 못 정합니다.
          */}
          <CategoryList grid={entryCategories.length <= 4}>
            {entryCategories.map((category) => {
              const count = countByCategory[category.slug] ?? 0;
              return (
                <li
                  key={category.slug}
                  // 가로로 밀 때만 폭을 못 박습니다. 격자에서는 칸이 폭을 정합니다.
                  className={
                    entryCategories.length <= 4
                      ? ''
                      : 'w-[46vw] shrink-0 snap-start sm:w-[30vw] md:w-[210px] lg:w-[240px]'
                  }
                >
                  <Link href={`/category/${category.slug}`} className="group block">
                    {/*
                      ★ 대표 이미지는 관리자 > 분류 관리에서 올립니다. (3-K)
                        예전에는 public/images/category/{slug}.jpg 를 보고 있었는데
                        그 파일이 없어 네 칸이 전부 회색 빈 상자였습니다.
                      ★ 올리지 않은 분류는 이미지 자리를 아예 만들지 않고 위에 얇은
                        구분선만 둡니다. 큰 회색 상자가 자리를 차지하는 것보다 낫습니다.
                        올리면 저절로 원래 카드 모양(3:4 사진)이 됩니다.
                    */}
                    {category.imageUrl ? (
                      <div className="aspect-[3/4] w-full overflow-hidden bg-stone">
                        <SafeImage
                          src={category.imageUrl}
                          alt={`${category.nameKo} 카테고리 대표 이미지 — ${store.name}`}
                          label={category.nameKo}
                          width={400}
                          height={533}
                        />
                      </div>
                    ) : (
                      <div className="border-t border-stone pt-1" aria-hidden="true" />
                    )}
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
          </CategoryList>
        </div>
      </section>
      ) : null}

      {/*
        취급 브랜드 (3-H C-3)
        ★ 편집숍에서 첫 방문자가 가장 궁금해하는 것은 "어떤 브랜드를 다루는가" 입니다.
          3-H 에서 HOW TO ORDER 자리로 끌어올렸고, 3-J 에서 그 HOW TO ORDER 를
          아예 뺐습니다. 지금은 메인의 마지막 섹션입니다.
      */}
      {sections.brands ? (
        <BrandStrip brands={homeBrands} className="section border-t border-stone" />
      ) : null}

      {/*
        ★ HOW TO ORDER 섹션은 3-J 에서 메인에서 뺐습니다.
          곧 PG 카드결제가 붙습니다. 카드로 즉시 결제되는 구조에서 '주문 방법 3단계' 를
          메인에 크게 설명할 이유가 없습니다. 누구나 아는 흐름이고 자리만 차지했습니다.
        ★ 문구 항목(copy.orderSteps)은 지우지 않았습니다. /order 페이지의 「주문 절차」에
          그대로 쓰이고, 되돌리기 기본값도 남아 있어 다시 쓰기로 하면 되살릴 수 있습니다.
      */}

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
