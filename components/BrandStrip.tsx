import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import type { Brand } from '@/lib/brands';

/**
 * ============================================================
 * 메인의 취급 브랜드 나열 (3-H C-3)
 * ============================================================
 *
 * ★ JZL CLOSET 은 자체 제작이 아니라 병행수입 편집숍입니다.
 *   편집숍에서 첫 방문자가 가장 먼저 궁금해하는 것은 "어떤 브랜드를 다루는가" 입니다.
 *   그래서 메인에서 HOW TO ORDER 보다 위에 둡니다. 주문 방법은 거의 읽지 않습니다.
 *
 * ★ 로고가 아니라 브랜드명 글자가 기본입니다.
 *   브랜드 로고는 각 브랜드사의 등록상표라 아무거나 쓸 수 없습니다.
 *   관리자가 쓸 수 있는 로고만 골라 올린 브랜드는 BrandMark 가 로고로 바꿔 줍니다.
 *   (3-E 에서 정한 방식과 같습니다. 여기서 따로 판단하지 않습니다)
 *
 * ★ 어느 브랜드를 넣을지는 부르는 쪽(메인)이 정해서 넘겨 줍니다.
 *   이 파일은 받은 것을 늘어놓기만 합니다.
 */
export default function BrandStrip({
  brands,
  className = '',
  headless = false,
}: {
  brands: Brand[];
  className?: string;
  /**
   * 제목과 '전체 보기' 를 빼고 목록만 그립니다.
   * ★ /about 은 섹션 제목을 관리자 문구에서 가져와 직접 냅니다. 그대로 두면
   *   같은 제목이 두 번 나옵니다. 목록을 그리는 규칙만 나눠 쓰려고 둔 문입니다.
   */
  headless?: boolean;
}) {
  // 보여 줄 브랜드가 없으면 제목만 남는 빈 칸이 되므로 자리 자체를 만들지 않습니다.
  if (brands.length === 0) return null;

  // 머리말이 없으면 바깥에 이미 섹션이 있다는 뜻이라 shell 도 씌우지 않습니다.
  const Wrapper = headless ? 'div' : 'section';

  return (
    <Wrapper
      aria-labelledby={headless ? undefined : 'brands-title'}
      className={className}
    >
      <div className={headless ? '' : 'shell'}>
        {headless ? null : (
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div>
              <p className="label-xs">BRANDS</p>
              <h2
                id="brands-title"
                className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]"
              >
                취급 브랜드
              </h2>
            </div>
            <Link
              href="/brands"
              className="tap-target text-[15px] tracking-[0.1em] text-ink transition-opacity duration-200 hover:opacity-60"
            >
              전체 보기 →
            </Link>
          </div>
        )}

        {/*
          ★ 격자로 늘어놓되 칸을 넉넉히 벌립니다. 하이엔드 편집숍의 나열은
            빽빽함이 아니라 여백이 만듭니다. 네모 버튼으로 채우지 않습니다.
          ★ 모바일 2열 · 태블릿 3열 · 데스크톱 4열입니다.
            브랜드명이 긴 편이라(COMME des GARÇONS) 모바일에서 3열은 너무 좁습니다.
          ★ 줄 높이를 items-center 로 맞춥니다. 로고를 올린 브랜드와 글자만 있는
            브랜드가 한 줄에 섞여도 눈높이가 어긋나지 않습니다.
        */}
        <ul className={`grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 md:gap-x-10 md:gap-y-12 lg:grid-cols-4 ${headless ? '' : 'mt-12 md:mt-16'}`}>
          {brands.map((brand) => (
            <li key={brand.slug} className="flex items-center">
              <Link
                href={`/brand/${brand.slug}`}
                className="group inline-flex min-h-[44px] items-center break-keep text-ink transition-colors duration-200 hover:text-wine"
              >
                <BrandMark
                  brand={brand}
                  className="underline-offset-[6px] group-hover:underline"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Wrapper>
  );
}
