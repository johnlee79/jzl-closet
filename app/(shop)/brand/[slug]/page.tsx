import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductFilterProvider from '@/components/ProductFilterProvider';
import ProductList from '@/components/ProductList';
import BrandMark from '@/components/BrandMark';
import KakaoChatButton from '@/components/KakaoChatButton';
import SafeImage from '@/components/SafeImage';
import SnsLinks from '@/components/SnsLinks';
import { brandImage, visibleBrands } from '@/lib/brands';
import { getProductsByBrand } from '@/lib/products';
import { getCachedSns, getCachedStore } from '@/lib/settings';
import { SITE_URL } from '@/lib/store';
import { getCachedBrands } from '@/lib/taxonomy';

type PageProps = { params: { slug: string } };

export const revalidate = 60;
/** 관리자에서 브랜드를 새로 만들면 첫 요청 때 서버에서 구워 내보냅니다. */
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const brands = await getCachedBrands();
  // ★ 숨긴 브랜드는 미리 굽지 않습니다. 아래에서 404 로 막을 페이지라 만들 이유가 없습니다.
  return visibleBrands(brands).map((brand) => ({ slug: brand.slug }));
}

/**
 * 손님에게 보여 줄 브랜드만 찾습니다.
 *
 * ★ getCachedBrands() 는 숨긴 브랜드까지 전부 돌려줍니다. (관리자 화면도 같은 값을 씁니다)
 *   그대로 findBrand 에 넘기면 "노출 끔" 으로 내려 둔 브랜드의 페이지가 그냥 열립니다.
 *   주소만 알면 누구나 볼 수 있게 되므로, 노출 여부를 여기서 한 번 더 확인합니다.
 */
async function findVisibleBrand(slug: string) {
  const brands = await getCachedBrands();
  return visibleBrands(brands).find((brand) => brand.slug === slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [brand, store] = await Promise.all([
    findVisibleBrand(params.slug),
    getCachedStore(),
  ]);
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
  const brand = await findVisibleBrand(params.slug);
  // 없는 브랜드도, 노출을 꺼 둔 브랜드도 똑같이 404 입니다.
  if (!brand) {
    notFound();
  }

  // ★ store 는 더 읽지 않습니다. 품절 안내에 있던 고객센터 번호를 카카오톡으로 바꿔
  //   이 화면에서 쓸 일이 없어졌습니다. (메타데이터에서는 그대로 씁니다)
  const [items, sns] = await Promise.all([
    getProductsByBrand(brand.slug),
    getCachedSns(),
  ]);

  const brandJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Brand',
    name: brand.name,
    alternateName: brand.nameKo || undefined,
    slogan: brand.tagline || undefined,
    description: brand.story.join(' '),
    url: `${SITE_URL}/brand/${brand.slug}`,
    // ★ logo 와 image 는 다른 것입니다.
    //   logo 는 상표(정사각·투명 배경), image 는 대표 사진(가로 배너)입니다.
    //   예전에는 대표 사진을 logo 로 넣고 있었습니다. 검색엔진이 상표로 오해합니다.
    logo: brand.logoUrl || undefined,
    image: brand.imageUrl || undefined,
  };

  return (
    <div className="shell py-14 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(brandJsonLd) }}
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
            <Link href="/brands" className="hover:text-ink">
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
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          {brand.nameKo || brand.name}
        </h1>
        {/* 로고를 올린 브랜드는 로고로, 아니면 브랜드명을 글자로 보여 줍니다. */}
        <div className="mt-3 flex items-center text-ink">
          <BrandMark brand={brand} size="lg" />
        </div>
        {brand.tagline ? (
          <p className="mt-5 text-[17px] leading-relaxed text-ink">{brand.tagline}</p>
        ) : null}
      </header>

      {/*
        대표 이미지 — 가로로 넓게 깔리는 배너입니다.

        ★ 원본 비율을 그대로 씁니다. 21:9 틀에 넣고 잘라내지 않습니다.
          예전에는 틀을 21:9 로 못 박고 object-fit: cover 를 걸어 두어,
          16:9 로 올린 사진의 좌우가 잘려 나갔습니다.
          브랜드 사진은 운영자가 구도를 잡아 올리는 것이라 잘리면 안 됩니다.

        ★ 높이 상한을 두지 않습니다.
          상한을 두면 그 순간 다시 잘리거나 좌우에 빈 띠가 생깁니다.
          어떤 비율로 올릴지는 운영자가 정하는 것이고, 관리자 화면에
          가로로 넓은 사진을 권한다고 적어 두었습니다.
      */}
      <div className="mt-10 w-full bg-stone">
        <SafeImage
          src={brandImage(brand)}
          alt={`${brand.name} 브랜드 대표 이미지`}
          label={brand.name}
          // ★ 원본 크기를 모르므로 0 을 넘겨 width·height 속성을 붙이지 않습니다.
          //   21:9 라고 찍어 두면 16:9 사진이 올라왔을 때 오히려 자리가 어긋납니다.
          width={0}
          height={0}
          fit="natural"
          priority
        />
      </div>

      {/* ★ 브랜드 스토리 — 검색 유입 경로입니다. 실제 텍스트로 출력합니다. */}
      {brand.story.length > 0 ? (
        <section aria-labelledby="brand-story" className="section border-b border-stone">
          <h2 id="brand-story" className="font-serif text-[24px] text-ink md:text-[28px]">
            {brand.name} 브랜드 소개
          </h2>
          <div className="mt-6 flex max-w-[760px] flex-col gap-6 md:max-w-[900px]">
            {brand.story.map((paragraph, index) => (
              <p
                key={index}
                className="text-[17px] leading-[2.1] text-ink md:text-[18px]"
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
          className="font-serif text-[24px] text-ink md:text-[28px]"
        >
          {brand.label} 상품
        </h2>
        <div className="mt-8">
          {items.length === 0 ? (
            <div className="border-t border-stone py-16">
              <p className="text-[17px] leading-relaxed text-ink">
                준비 중인 브랜드입니다. 입고 소식은 카카오톡으로 문의해 주세요.
              </p>
              <div className="btn-row mt-8">
                <Link href="/products" className="btn-primary">
                  전체 상품 보기
                </Link>
                <KakaoChatButton />
              </div>
            </div>
          ) : (
            <ProductFilterProvider>
              <ProductList products={items} showBrandFilter={false} />
            </ProductFilterProvider>
          )}
        </div>
      </section>

      {/* 푸터와 같은 SNS 줄. 채운 항목이 없으면 그리지 않습니다. */}
      <SnsLinks sns={sns} className="mt-14 border-t border-stone pt-8" />
    </div>
  );
}
