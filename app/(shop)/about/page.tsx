import type { Metadata } from 'next';
import Link from 'next/link';
import BrandStrip from '@/components/BrandStrip';
import KakaoChatButton from '@/components/KakaoChatButton';
import SafeImage from '@/components/SafeImage';
import { visibleBrands } from '@/lib/brands';
import { copyToPlainText, resolveCopy } from '@/lib/copy';
import { getCachedAboutPage, getCachedCopy, getCachedStore } from '@/lib/settings';
import { getCachedBrands } from '@/lib/taxonomy';

/**
 * ============================================================
 * /about — 편집숍 JZL CLOSET 소개 (3-I 에서 다시 짰습니다)
 * ============================================================
 *
 * ★ /brand/jzl-closet 과 합치지 마세요. 성격이 다른 페이지입니다.
 *     /about            편집숍 자체 소개 ← 여기
 *     /brand/jzl-closet 자체 기획 라인 (상품이 생기면)
 *
 * ★ 순서
 *     ① 대표 이미지 + 제목·부제
 *     ② 소개 본문
 *     ③ 고르는 기준
 *     ④ 취급 브랜드   ← 예전의 '취급 품목' 자리
 *     ⑤ 문의
 *
 * ★ 왜 '취급 품목' 을 '취급 브랜드' 로 바꿨나
 *   글로 "의류·가방·슈즈를 취급합니다" 라고 쓰는 것보다 실제로 다루는 브랜드를
 *   보여 주는 편이 훨씬 설득력 있습니다. 편집숍의 값어치는 무엇을 고르느냐에 있습니다.
 *   예전 섹션이 늘어놓던 분류 설명은 categories 테이블에 그대로 있고
 *   /category 페이지에서 계속 쓰입니다. 사라진 글은 없습니다.
 *
 * ★ 소개 본문만 사이트 문구(copy)가 아니라 설정 > 스토어 정보의 store.story 입니다.
 *   이 글은 원래 거기서 관리하고 있었습니다. 문구 항목으로 옮겨 두면
 *   같은 글을 고칠 수 있는 자리가 두 곳이 되어, 한쪽만 고치고 다른 쪽을
 *   그대로 두는 일이 반드시 생깁니다. 관리자에서 고칠 수 있다는 목적은
 *   이미 이루어져 있으므로 옮기지 않았습니다.
 */

export const revalidate = 60;

/** 문구 첫 블록 — 없으면 화면이 죽지 않게 빈 값을 돌려줍니다. */
function firstBlock(blocks: { heading: string; html: string }[]) {
  return blocks[0] ?? { heading: '', html: '' };
}

export async function generateMetadata(): Promise<Metadata> {
  const [store, copy, aboutPage] = await Promise.all([
    getCachedStore(),
    getCachedCopy(),
    getCachedAboutPage(),
  ]);

  // ★ 제목·설명을 관리자 문구에서 가져옵니다. 코드에 박아 두면 고칠 수가 없습니다.
  const hero = firstBlock(resolveCopy(copy.aboutHero, store));
  const title = hero.heading.trim() || store.name;
  const subtitle = hero.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const description =
    [subtitle, store.story[0] ?? copyToPlainText(copy.aboutBrands, store)]
      .filter(Boolean)
      .join(' ')
      .slice(0, 160) || store.intro;

  return {
    title: '편집숍 소개',
    description,
    alternates: { canonical: '/about' },
    openGraph: {
      title: `${title} | ${store.name}`,
      description,
      url: '/about',
      // 대표 이미지를 올려 두었으면 공유 카드에도 그대로 씁니다.
      images: aboutPage.imageUrl ? [{ url: aboutPage.imageUrl, alt: title }] : undefined,
    },
  };
}

export default async function AboutPage() {
  const [store, copy, aboutPage, brands] = await Promise.all([
    getCachedStore(),
    getCachedCopy(),
    getCachedAboutPage(),
    getCachedBrands(),
  ]);

  const hero = firstBlock(resolveCopy(copy.aboutHero, store));
  const choose = firstBlock(resolveCopy(copy.aboutChoose, store));
  const brandsHead = firstBlock(resolveCopy(copy.aboutBrands, store));
  const contact = firstBlock(resolveCopy(copy.aboutContact, store));
  const principles = resolveCopy(copy.about, store);

  /*
   * 취급 브랜드 — 노출을 켠 브랜드를 전부, 관리자가 정한 순서대로.
   * ★ 메인(BrandStrip)과 달리 상품이 0개인 브랜드도 넣습니다.
   *   여기는 "우리가 무엇을 다루는가" 를 밝히는 자리라, 지금 재고가 없다고
   *   목록에서 빼면 취급 범위를 좁게 알리는 셈이 됩니다.
   *   /brand/{slug} 는 소개 글이 있어 상품이 없어도 빈 페이지가 아닙니다.
   */
  const aboutBrands = visibleBrands(brands);

  return (
    <div className="shell py-14 md:py-20">
      {/*
        ① 대표 이미지
        ★ 올리지 않았으면 이 영역 자체가 없습니다. 회색 네모를 띄우지 않습니다.
        ★ 모바일 40vh · 데스크톱 배너 비율(21:9)로 낮게 깝니다. 예전에는 모바일에서
          4:5 라 첫 화면을 이미지가 거의 다 먹고 글이 아래로 밀렸습니다.
      */}
      {aboutPage.imageUrl ? (
        <div className="mb-12 h-[40vh] w-full overflow-hidden bg-stone md:h-auto md:aspect-[21/9]">
          <SafeImage
            src={aboutPage.imageUrl}
            alt={`${store.name} — ${hero.heading || '편집숍 소개'}`}
            label={`${store.name} — 편집숍 소개`}
            width={1600}
            height={700}
            priority
          />
        </div>
      ) : null}

      {/* ① 제목 · 부제 */}
      <header className="max-w-[760px]">
        <p className="label-xs">ABOUT</p>
        <h1 className="mt-3 font-display text-[34px] font-light leading-none tracking-[0.24em] text-ink md:text-[48px]">
          {hero.heading || store.name}
        </h1>
        {hero.html ? (
          <div
            className="detail-body mt-5 font-serif text-[18px] leading-relaxed text-ink md:text-[22px]"
            dangerouslySetInnerHTML={{ __html: hero.html }}
          />
        ) : null}
      </header>

      {/*
        ② 소개 본문 — 설정 > 스토어 정보의 브랜드 소개 3문장입니다.
        ★ 예전에는 '브랜드 스토리' 라는 제목을 달고 좌우 두 칸으로 벌려 두었습니다.
          제목이 없어도 무슨 글인지 알 수 있어 제목을 빼고 한 덩어리로 좁혔습니다.
          페이지를 짧게 만드는 것이 이번 작업의 목적입니다.
      */}
      {store.story.length > 0 ? (
        <section aria-label="편집숍 소개" className="mt-10 max-w-[760px]">
          <div className="flex flex-col gap-6">
            {store.story.map((paragraph, index) => (
              <p key={index} className="text-[16px] leading-[2.1] text-ink md:text-[17px]">
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {/* ③ 고르는 기준 */}
      {principles.length > 0 ? (
        <section
          aria-labelledby="principle-heading"
          className="section border-t border-stone"
        >
          <p className="label-xs">HOW WE CHOOSE</p>
          <h2
            id="principle-heading"
            className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
          >
            {choose.heading || '고르는 기준'}
          </h2>
          {choose.html ? (
            <div
              className="detail-body mt-4 max-w-[640px] text-[16px] leading-[1.9] text-ink"
              dangerouslySetInnerHTML={{ __html: choose.html }}
            />
          ) : null}
          <ol className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-x-16">
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
      ) : null}

      {/*
        ④ 취급 브랜드
        ★ 메인의 BrandStrip 을 그대로 씁니다. 로고를 올린 브랜드는 로고,
          없으면 브랜드명이 Cormorant Garamond 로 나오는 규칙(3-E)이 이미 들어 있습니다.
        ★ 브랜드가 하나도 없으면 BrandStrip 이 스스로 아무것도 그리지 않습니다.
      */}
      {aboutBrands.length > 0 ? (
        <section
          aria-labelledby="about-brands-heading"
          className="section border-t border-stone"
        >
          <p className="label-xs">BRANDS</p>
          <h2
            id="about-brands-heading"
            className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
          >
            {brandsHead.heading || '취급 브랜드'}
          </h2>
          {brandsHead.html ? (
            <div
              className="detail-body mt-4 max-w-[640px] text-[16px] leading-[1.9] text-ink"
              dangerouslySetInnerHTML={{ __html: brandsHead.html }}
            />
          ) : null}

          {/* 제목은 위에서 냈으므로 목록만 씁니다. (BrandStrip 의 머리말은 감춥니다) */}
          <BrandStrip brands={aboutBrands} className="mt-10" headless />

          <div className="mt-10">
            <Link href="/brands" className="btn-secondary">
              브랜드 전체 보기
            </Link>
          </div>
        </section>
      ) : null}

      {/* ⑤ 문의 — 전화 걸기 버튼 없이 카카오톡 실시간 문의로 받습니다. (3-G) */}
      <section aria-labelledby="contact-heading" className="section border-t border-stone">
        <p className="label-xs">CONTACT</p>
        <h2
          id="contact-heading"
          className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
        >
          {contact.heading || '문의'}
        </h2>
        {contact.html ? (
          <div
            className="detail-body mt-6 max-w-[560px] text-[16px] leading-[1.9] text-ink md:text-[17px]"
            dangerouslySetInnerHTML={{ __html: contact.html }}
          />
        ) : null}
        <div className="mt-6">
          <KakaoChatButton />
        </div>
        {/* ★ 번호는 정보로만 남깁니다. 전화 걸기 링크를 걸지 않습니다. */}
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
