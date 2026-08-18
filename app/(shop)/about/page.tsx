import type { Metadata } from 'next';
import Link from 'next/link';
import KakaoChatButton from '@/components/KakaoChatButton';
import SafeImage from '@/components/SafeImage';
import { hasVisibleChildren, visibleCategories } from '@/lib/categories';
import { resolveCopy } from '@/lib/copy';
import { getCachedCopy, getCachedStore } from '@/lib/settings';
import { getCachedCategories } from '@/lib/taxonomy';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: '브랜드 소개',
    description: `${store.nameKo}은 ${store.slogan}는 마음으로 매일 쓰는 물건을 고릅니다. ${store.intro}`,
    alternates: { canonical: '/about' },
    openGraph: {
      title: `브랜드 소개 | ${store.name}`,
      description: store.intro,
      url: '/about',
    },
  };
}

export default async function AboutPage() {
  const [categories, store, copy] = await Promise.all([
    getCachedCategories(),
    getCachedStore(),
    getCachedCopy(),
  ]);

  const rangeCategories = visibleCategories(categories).filter(hasVisibleChildren);
  const principles = resolveCopy(copy.about, store);

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[760px]">
        <p className="label-xs">ABOUT</p>
        <h1 className="mt-3 font-display text-[34px] font-light leading-none tracking-[0.24em] text-ink md:text-[48px]">
          {store.name}
        </h1>
        <p className="mt-5 font-serif text-[18px] leading-relaxed text-ink md:text-[22px]">
          {store.slogan}
        </p>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          {store.nameKo} · {store.category}
        </p>
      </header>

      <div className="mt-12 aspect-[4/5] w-full overflow-hidden bg-stone md:aspect-[21/9]">
        <SafeImage
          src="/images/main/about.jpg"
          alt={`${store.name} 브랜드 이미지 — 가방과 스카프를 정리해 둔 작업실 컷`}
          label={`${store.name} — 브랜드 이미지`}
          width={1400}
          height={600}
          priority
        />
      </div>

      {/* 브랜드 스토리는 설정 > 스토어 정보의 3문장을 그대로 씁니다. */}
      <section
        aria-labelledby="story-heading"
        className="section grid grid-cols-1 gap-10 border-t border-stone lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-24"
      >
        <h2
          id="story-heading"
          className="font-serif text-[24px] leading-snug text-ink md:text-[30px]"
        >
          브랜드 스토리
        </h2>
        <div className="flex flex-col gap-7">
          {store.story.map((paragraph, index) => (
            <p key={index} className="text-[16px] leading-[2.1] text-ink md:text-[17px]">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="principle-heading"
        className="section border-t border-stone"
      >
        <p className="label-xs">HOW WE CHOOSE</p>
        <h2
          id="principle-heading"
          className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
        >
          고르는 기준
        </h2>
        <ol className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-x-16">
          {principles.map((item, index) => (
            <li key={index} className="border-t border-stone pt-6">
              <p className="font-display text-[30px] font-light tracking-[0.1em] text-ink">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-3 font-serif text-[18px] text-ink">{item.heading}</h3>
              <div
                className="detail-body mt-3 text-[15px] leading-[1.9] text-ink"
                dangerouslySetInnerHTML={{ __html: item.html }}
              />
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="range-heading" className="section border-t border-stone">
        <p className="label-xs">WHAT WE MAKE</p>
        <h2
          id="range-heading"
          className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
        >
          취급 품목
        </h2>
        <ul className="mt-10 border-t border-stone">
          {rangeCategories.map((category) => (
            <li key={category.slug} className="border-b border-stone">
              <Link
                href={`/category/${category.slug}`}
                className="flex flex-col gap-2 py-7 transition-opacity duration-200 hover:opacity-60 md:flex-row md:items-baseline md:gap-10"
              >
                <span className="w-32 shrink-0 font-serif text-[18px] text-ink">
                  {category.nameKo}
                </span>
                <span className="text-[15px] leading-[1.9] text-ink">
                  {category.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <Link href="/brands" className="btn-secondary">
            브랜드 목록 보기
          </Link>
        </div>
      </section>

      <section aria-labelledby="contact-heading" className="section border-t border-stone">
        <p className="label-xs">CONTACT</p>
        <h2
          id="contact-heading"
          className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
        >
          문의
        </h2>
        <p className="mt-6 max-w-[560px] text-[16px] leading-[1.9] text-ink md:text-[17px]">
          상품 문의와 재입고 요청, 주문 접수는 카카오톡으로 받고 있습니다. 남겨 주시면
          순서대로 답변드립니다.
        </p>
        {/* ★ 전화 걸기 버튼은 뺐습니다. 번호는 정보로만 남깁니다. */}
        <div className="mt-6">
          <KakaoChatButton />
        </div>
        <p className="mt-6 font-display text-[32px] tracking-[0.1em] text-ink">
          {store.phone}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{store.hours}</p>
        <div className="btn-row mt-8">
          <Link href="/products" className="btn-primary">
            전체 상품 보기
          </Link>
          <Link href="/guide" className="btn-secondary">
            배송·교환 안내
          </Link>
        </div>
      </section>
    </div>
  );
}
