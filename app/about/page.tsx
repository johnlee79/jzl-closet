import type { Metadata } from 'next';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import { getVisibleCategories, hasChildren } from '@/lib/categories';
import { store } from '@/lib/store';

export const metadata: Metadata = {
  title: '브랜드 소개',
  description: `${store.nameKo}은 ${store.slogan}는 마음으로 매일 쓰는 잡화를 고릅니다. 손에 익는 무게와 오래 봐도 질리지 않는 형태를 기준으로 합니다.`,
  alternates: { canonical: '/about' },
  openGraph: {
    title: `브랜드 소개 | ${store.name}`,
    description: store.intro,
    url: '/about',
  },
};

const principles = [
  {
    title: '무게를 먼저 잽니다',
    body: '가방은 비어 있을 때 이미 무거우면 매일 들 수 없습니다. 같은 크기라면 더 가벼운 쪽, 같은 무게라면 더 오래 버티는 쪽을 고릅니다.',
  },
  {
    title: '형태가 남는지 봅니다',
    body: '반년을 쓰고도 처음의 선이 남아 있는지 확인합니다. 사용하면서 자연스럽게 부드러워지는 것과, 형태가 무너지는 것은 다릅니다.',
  },
  {
    title: '색을 늘리지 않습니다',
    body: '한 상품에 담는 색은 세 가지를 넘기지 않습니다. 옷장에 이미 있는 옷과 섞이는 색만 남깁니다.',
  },
  {
    title: '설명을 감추지 않습니다',
    body: '소재와 사이즈, 관리법을 상세 페이지에 글로 적습니다. 사진만으로 판단하게 만들지 않는 것이 저희의 방식입니다.',
  },
];

export default function AboutPage() {
  const rangeCategories = getVisibleCategories().filter(hasChildren);

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[760px]">
        <p className="label-xs">ABOUT</p>
        <h1 className="mt-3 font-display text-[34px] font-light leading-none tracking-[0.24em] text-ink md:text-[48px]">
          JZL CLOSET
        </h1>
        <p className="mt-5 font-serif text-[18px] leading-relaxed text-ink md:text-[22px]">
          {store.slogan}
        </p>
        <p className="mt-4 text-[13px] leading-[1.9] text-muted md:text-[14px]">
          {store.nameKo} · {store.category}
        </p>
      </header>

      <div className="mt-12 aspect-[4/5] w-full overflow-hidden bg-stone md:aspect-[21/9]">
        <SafeImage
          src="/images/main/about.jpg"
          alt="JZL CLOSET 브랜드 이미지 — 가방과 스카프를 정리해 둔 작업실 컷"
          label="JZL CLOSET — 브랜드 이미지"
          width={1400}
          height={600}
          priority
        />
      </div>

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
          {store.story.map((paragraph) => (
            <p
              key={paragraph.slice(0, 12)}
              className="text-[14px] leading-[2.1] text-muted md:text-[15px]"
            >
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
            <li key={item.title} className="border-t border-stone pt-6">
              <p className="font-display text-[30px] font-light tracking-[0.1em] text-ink">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-3 font-serif text-[18px] text-ink">{item.title}</h3>
              <p className="mt-3 text-[13px] leading-[1.9] text-muted">{item.body}</p>
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
                <span className="text-[13px] leading-[1.9] text-muted">
                  {category.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <Link href="/brand" className="btn-secondary">
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
        <p className="mt-6 max-w-[560px] text-[13px] leading-[1.9] text-muted md:text-[14px]">
          상품 문의와 재입고 요청, 주문 접수는 모두 고객센터에서 받고 있습니다. 통화가
          어려우실 때는 문자로 남겨 주시면 순서대로 답변드립니다.
        </p>
        <a
          href={`tel:${store.phone}`}
          className="mt-6 block font-display text-[32px] tracking-[0.1em] text-ink"
        >
          {store.phone}
        </a>
        <div className="mt-8 flex flex-wrap gap-4">
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
