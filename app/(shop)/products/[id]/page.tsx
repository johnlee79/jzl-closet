import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';
import BrandMark from '@/components/BrandMark';
import DetailBlocks from '@/components/DetailBlocks';
import MeasurementTable from '@/components/MeasurementTable';
import ProductCard from '@/components/ProductCard';
import ProductGallery from '@/components/ProductGallery';
import ShareButton from '@/components/ShareButton';
import ProductQna from '@/components/ProductQna';
import ProductReviews from '@/components/ProductReviews';
import ProductTabs from '@/components/ProductTabs';
import RecentlyViewed from '@/components/RecentlyViewed';
import RecentlyViewedRecorder from '@/components/RecentlyViewedRecorder';
import SalesInfo from '@/components/SalesInfo';
import StarRating from '@/components/StarRating';
import ViewItemTracker from '@/components/ViewItemTracker';
import { getProductInquiries } from '@/lib/inquiries';
import { getProductReviews, summarize } from '@/lib/reviews';
import { findBrand } from '@/lib/brands';
import { findCategory, findSubCategory } from '@/lib/categories';
import { formatPrice, getDiscountRate, isProductSoldOut } from '@/lib/product-utils';
import {
  getAllProductSlugs,
  getProductBySlug,
  getProductNeighbours,
} from '@/lib/products';
import {
  getCachedEvent,
  getCachedPoints,
  getCachedSales,
  getCachedShipping,
  getCachedStore,
} from '@/lib/settings';
import {
  expectedPurchasePoints,
  fillTokens,
  productShippingLine,
} from '@/lib/site-config';
import { SITE_URL } from '@/lib/store';
import { getCachedBrands, getCachedCategories } from '@/lib/taxonomy';

/** 폴더명은 [id] 지만 실제로 들어오는 값은 상품 slug 입니다. (기존 주소 유지) */
type PageProps = { params: { id: string } };

/**
 * ISR — 서버에서 HTML 을 완성해 내보내고 30초마다 갱신합니다.
 *
 * ★ 리뷰·Q&A 가 바뀌면 관리자·손님 동작에서 곧바로 revalidatePath 로 이 페이지를 다시 굽습니다.
 *   그래서 평소에는 이 숫자를 기다릴 일이 없습니다.
 *   이 값은 Supabase 대시보드에서 데이터를 직접 고친 경우처럼
 *   앱을 거치지 않은 변경에만 걸리는 마지막 안전망입니다.
 */
export const revalidate = 30;
/** 빌드 이후에 등록된 상품도 첫 요청 때 서버에서 구워 내보냅니다. */
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ id: string }[]> {
  const slugs = await getAllProductSlugs();
  return slugs.map((slug) => ({ id: slug }));
}

/** 상대 경로는 사이트 주소를 붙이고, R2 같은 절대 URL 은 그대로 둡니다. */
function toAbsolute(src: string): string {
  return /^https?:\/\//i.test(src) ? src : `${SITE_URL}${src}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [product, brands, store] = await Promise.all([
    getProductBySlug(params.id),
    getCachedBrands(),
    getCachedStore(),
  ]);
  if (!product) {
    return { title: '상품을 찾을 수 없습니다' };
  }

  const brand = findBrand(brands, product.brandSlug);
  const brandName = brand?.name ?? store.name;
  const description = `${brandName} ${product.name} — ${product.summary} 가격 ${formatPrice(product.price)}원. ${store.name}에서 만나보세요.`;
  const cover = product.thumbnails[0];

  return {
    title: `${product.name} — ${brandName}`,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'article',
      title: `${product.name} | ${store.name}`,
      description,
      url: `/products/${product.slug}`,
      images: cover ? [{ url: cover, alt: `${brandName} ${product.name}` }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | ${store.name}`,
      description,
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const product = await getProductBySlug(params.id);
  if (!product || !product.isVisible) {
    notFound();
  }

  const [
    neighbours,
    categories,
    brands,
    store,
    shipping,
    sales,
    points,
    event,
    inquiries,
    reviews,
  ] = await Promise.all([
    // ★ DB 조회 한 번으로 '함께 보면 좋은 상품' 과 '이 브랜드의 다른 상품' 을 함께 얻습니다.
    getProductNeighbours(product, { related: 8, brand: 4 }),
    getCachedCategories(),
    getCachedBrands(),
    getCachedStore(),
    getCachedShipping(),
    getCachedSales(),
    getCachedPoints(),
    getCachedEvent(),
    // 비밀글은 서버에서 제목·내용·답변을 잘라 내려보냅니다.
    getProductInquiries(product.id),
    // 노출 중인 리뷰만 내려옵니다. 작성자명은 서버에서 가립니다.
    getProductReviews(product.id),
  ]);

  const { related, brandRelated } = neighbours;

  const reviewSummary = summarize(reviews);

  const brand = findBrand(brands, product.brandSlug);
  const brandName = brand?.name ?? store.name; // alt·JSON-LD 용 정식 명칭
  const brandLabel = brand?.label ?? ''; // 화면 출력용
  const category = findCategory(categories, product.categorySlug);
  const subCategory = product.subCategorySlug
    ? findSubCategory(categories, product.categorySlug, product.subCategorySlug)
    : undefined;

  /*
   * 구매 영역에 넣을 배송 한 줄.
   *
   * ★ 예전에는 여기에 leadTime(출고·도착 소요일)까지 이어 붙였습니다.
   *   좁은 자리라 두세 줄로 접히면서 오른쪽 영역만 계속 길어졌습니다.
   *   자세한 배송 안내는 아래 [판매정보] 탭에 그대로 있으므로 여기서는 한 줄만 씁니다.
   *   문구는 관리자 > 설정 > 배송·반품의 "상품 상세용 배송 한 줄 문구" 로 바꿉니다.
   */
  const shippingNote = productShippingLine(product.freeShipping, shipping);
  const soldOut = isProductSoldOut(product);
  const discount = getDiscountRate(product);

  // ★ 적립 안내는 화면에서 계산합니다. DB 조회가 늘지 않습니다.
  const earnPoints = expectedPurchasePoints(product.price, points);
  const earnNotice =
    earnPoints > 0
      ? fillTokens(event.earnNotice, { points: formatPrice(earnPoints) })
      : '';

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.thumbnails.map(toAbsolute),
    description: `${product.summary} — ${product.detail
      .filter(
        (block): block is { type: 'text'; heading?: string; body: string } =>
          block.type === 'text'
      )
      .map((block) => block.body.replace(/<[^>]*>/g, ' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 300)}`,
    sku: product.slug,
    category: [category?.nameKo, subCategory?.nameKo].filter(Boolean).join(' > '),
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
    // 후기가 있으면 검색 결과에 별점이 함께 나옵니다.
    ...(reviewSummary.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: reviewSummary.average,
            reviewCount: reviewSummary.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/products/${product.slug}`,
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
    { name: product.name, item: `${SITE_URL}/products/${product.slug}` },
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

      {/* GA4 view_item — 측정 ID 를 넣지 않았으면 아무 일도 하지 않습니다. */}
      <ViewItemTracker
        item={{
          item_id: product.slug,
          item_name: product.name,
          item_brand: brandName,
          item_category: [category?.nameKo, subCategory?.nameKo]
            .filter(Boolean)
            .join(' > '),
          price: product.price,
        }}
      />

      {/* 최근 본 상품 기록 — 브라우저에만 남깁니다. 화면에는 아무것도 그리지 않습니다. */}
      <RecentlyViewedRecorder product={product} />

      <nav aria-label="현재 위치" className="text-[14px] tracking-[0.14em] text-muted">
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

      {/*
        ★ 왼쪽 사진을 조금 더 크게 잡습니다. (1.12 : 1)
          옷은 사진이 전부라 조금이라도 크게 보이는 편이 낫습니다.
          다만 오른쪽 구매 영역과 높이를 억지로 맞추지는 않습니다.
          맞추려 들면 3:4 비율이 깨져 세로로 길쭉한 사진이 됩니다.
      */}
      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1.12fr_1fr] lg:gap-14">
        {/*
          ★ 사진을 화면에 붙여 둡니다. (스크롤을 따라옵니다)

          왼쪽 사진과 오른쪽 구매 영역은 높이가 같아질 수 없습니다.
          옵션이 많은 상품은 색상·사이즈 버튼만으로도 700px 을 넘고,
          사진은 3:4 비율이라 폭이 정해지면 높이도 정해지기 때문입니다.
          실제로 이 상품은 사진 746px · 구매 영역 1310px 로 564px 차이가 납니다.

          억지로 맞추려면 사진을 늘려 비율을 깨거나 옵션을 접어야 하는데
          둘 다 손해입니다. 대신 사진을 붙여 두면, 옵션을 고르며 내려가는 동안
          사진이 계속 보이고 왼쪽이 빈 채로 남지 않습니다.

          top-[97px] 은 상단 고정 헤더(81px) 아래에 여백을 둔 값입니다.
          자리가 좁은 모바일·태블릿에서는 위아래로 쌓이므로 적용하지 않습니다.
        */}
        <div className="lg:sticky lg:top-[97px] lg:self-start">
          <ProductGallery
            images={product.thumbnails}
            productName={product.name}
            brand={brandName}
          />
        </div>

        <section aria-label="상품 정보" className="lg:pt-4">
          {product.brandSlug ? (
            /* 카드와 같은 자리·같은 역할이라 같은 방식으로 보여 줍니다. */
            <Link
              href={`/brand/${product.brandSlug}`}
              className="inline-flex min-h-[25px] items-center text-[14px] tracking-[0.16em] text-muted underline-offset-4 hover:underline"
            >
              {brand ? <BrandMark brand={brand} size="card" /> : brandLabel}
            </Link>
          ) : null}
          <h1 className="mt-3 text-[28px] font-semibold leading-snug text-ink md:text-[34px]">
            {product.name}
          </h1>

          {/* 평균 별점 요약 — 누르면 아래 리뷰 영역으로 갑니다. */}
          {reviewSummary.count > 0 ? (
            <a href="#review-title" className="mt-3 inline-flex items-center gap-2">
              <StarRating value={reviewSummary.average} size={15} />
              <span className="text-[15px] text-ink">
                {reviewSummary.average.toFixed(1)}
              </span>
              <span className="text-[15px] text-muted underline underline-offset-4">
                후기 {reviewSummary.count}개
              </span>
            </a>
          ) : null}

          {/*
            ★ 한 줄 소개와 적립 안내를 같은 줄에 둡니다.
              따로 두면 구매 영역만 두 줄씩 길어져서 왼쪽 사진보다 훨씬 아래로
              내려가고, 그만큼 사진이 눌려 보입니다.
              좁은 화면에서는 flex-wrap 이 알아서 다음 줄로 내려 줍니다.
              배지는 shrink-0 으로 두어, 자리가 모자라도 글자가 깨지지 않습니다.
          */}
          {product.summary || earnNotice ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {product.summary ? (
                <p className="text-[17px] leading-[1.9] text-ink md:text-[18px]">
                  {product.summary}
                </p>
              ) : null}
              {earnNotice ? (
                <span className="shrink-0 border border-stone px-3 py-1.5 text-[14px] tracking-[0.06em] text-wine">
                  {earnNotice}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-[34px] font-medium tracking-wide text-ink md:text-[40px]">
              {formatPrice(product.price)}
              <span className="ml-1 font-sans text-[17px]">원</span>
            </span>
            {product.originalPrice ? (
              <span className="text-[17px] text-muted line-through">
                {formatPrice(product.originalPrice)}원
              </span>
            ) : null}
            {discount > 0 ? (
              <span className="border border-wine px-2 py-1 text-[14px] tracking-[0.14em] text-wine">
                {discount}% OFF
              </span>
            ) : null}
            {product.isNew ? (
              <span className="border border-ink px-2 py-1 text-[14px] tracking-[0.14em] text-ink">
                NEW
              </span>
            ) : null}
          </div>

          <dl className="mt-8 flex flex-col gap-2 border-t border-stone pt-6 text-[14px]">
            <div className="flex gap-4">
              <dt className="w-20 shrink-0 text-muted">카테고리</dt>
              <dd className="text-ink">
                {[category?.nameKo, subCategory?.nameKo].filter(Boolean).join(' · ')}
              </dd>
            </div>
            {product.origin ? (
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 text-muted">원산지</dt>
                <dd className="text-ink">{product.origin}</dd>
              </div>
            ) : null}
            {product.manufacturer ? (
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 text-muted">제조사</dt>
                <dd className="text-ink">{product.manufacturer}</dd>
              </div>
            ) : null}
            {/* ★ 시즌은 관리자에서 입력받으면서도 손님 화면 어디에도 나오지 않았습니다.
                (내보내기 CSV 에만 실렸습니다) 옷은 시즌이 구매 판단에 들어가므로 여기에 둡니다. */}
            {product.season ? (
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 text-muted">시즌</dt>
                <dd className="text-ink">{product.season}</dd>
              </div>
            ) : null}
            <div className="flex gap-4">
              <dt className="w-20 shrink-0 text-muted">배송</dt>
              <dd className="text-ink">{shippingNote}</dd>
            </div>
            {/* ★ 전화번호는 여기서 빼고 [판매정보] 탭의 판매자 정보에만 둡니다.
                구매 영역에는 카카오톡 문의 버튼이 대신 들어갑니다.
                같은 번호를 여러 곳에 두면 바꿀 때 한 곳을 빠뜨리게 됩니다. */}
          </dl>

          <AddToCartButton product={product} />

          {/* 공유 — 로그인한 회원이면 주소에 자기 추천 코드가 따라붙습니다. */}
          <div className="mt-6 border-t border-stone pt-5">
            <ShareButton
              path={`/products/${product.slug}`}
              title={product.name}
              label="친구에게 공유하기"
            />
          </div>
        </section>
      </div>

      {/* ── 상세 4탭 ────────────────────────────────────
       * 네 판을 모두 HTML 에 심어 두고 보이는 쪽만 바꿉니다.
       * 검색엔진이 리뷰·판매정보까지 그대로 읽어 갑니다. */}
      <ProductTabs
        reviewCount={reviewSummary.count}
        qnaCount={inquiries.length}
        info={
          <section aria-labelledby="detail-title" className="section">
            <h2 id="detail-title" className="sr-only">
              {product.name} 상세 설명
            </h2>
            <DetailBlocks blocks={product.detail} productName={product.name} />

            {product.measurements.length > 0 ? (
              <div className="mx-auto mt-16 w-full max-w-[860px] md:mt-24">
                <MeasurementTable
                  measurements={product.measurements}
                  productName={product.name}
                />
              </div>
            ) : null}
          </section>
        }
        review={<ProductReviews reviews={reviews} summary={reviewSummary} />}
        qna={
          <ProductQna
            inquiries={inquiries}
            productId={product.id}
            productSlug={product.slug}
            productName={product.name}
          />
        }
        sales={<SalesInfo sales={sales} shipping={shipping} store={store} />}
      />

      {brand ? (
        <section aria-labelledby="brand-title" className="section border-t border-stone">
          <p className="label-xs">BRAND</p>
          <h2
            id="brand-title"
            className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
          >
            {brand.label}
          </h2>
          {brand.story[0] ? (
            <p className="mt-4 max-w-[720px] text-[17px] leading-[1.9] text-ink md:text-[18px]">
              {brand.story[0]}
            </p>
          ) : null}
          <Link href={`/brand/${brand.slug}`} className="btn-secondary mt-8">
            브랜드 소개 보기
          </Link>

          {brandRelated.length > 0 ? (
            <>
              <h3 className="mt-16 font-serif text-[19px] text-ink">
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

      {/*
        함께 보면 좋은 상품 (3-H C-2)
        ★ 같은 브랜드+같은 소분류 → 같은 브랜드 → 같은 소분류 → 같은 대분류 순으로
          최대 8개입니다. 순서는 lib/products.ts 의 getProductNeighbours 가 정합니다.
        ★ 추천할 게 하나도 없으면 이 자리 자체가 사라집니다.
          "추천 상품이 없습니다" 를 띄우면 없다는 사실만 크게 알리는 셈입니다.
      */}
      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="section border-t border-stone">
          <p className="label-xs">YOU MAY ALSO LIKE</p>
          <h2
            id="related-title"
            className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
          >
            함께 보면 좋은 상품
          </h2>
          <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      {/*
        최근 본 상품 (3-H C-1) — 브라우저에 남은 기록으로 그립니다. DB 를 보지 않습니다.
        ★ 지금 보고 있는 상품은 빼고 보여 줍니다. 제 페이지에서 자기를 또 권할 이유가 없습니다.
      */}
      <RecentlyViewed
        excludeSlug={product.slug}
        className="section border-t border-stone"
      />
    </article>
  );
}
