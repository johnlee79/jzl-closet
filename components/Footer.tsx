import { Fragment } from 'react';
import Link from 'next/link';
import KakaoChatButton from '@/components/KakaoChatButton';
import SnsLinks from '@/components/SnsLinks';
import { visibleCategories, type Category } from '@/lib/categories';
import { hasAnySns, type SnsSettings, type StoreSettings } from '@/lib/site-config';

/** 푸터 링크 한 줄. strong 은 개인정보처리방침처럼 굵게 낼 항목에만 붙입니다. */
type FooterLink = { href: string; label: string; strong?: boolean };

/**
 * INFORMATION — 손님이 '무엇을 사고 어디까지 왔는지' 보는 곳.
 *
 * ★ '브랜드 소개' 와 '브랜드 목록' 은 서로 다른 곳입니다. (3-G 에서 정리했습니다)
 *     브랜드 소개 — 우리 자체 브랜드 페이지 (/brand/jzl-closet)
 *     브랜드 목록 — 취급하는 브랜드 전체 목록 (/brands)
 *   예전에는 소개가 /about, 목록이 /brand 로 가 있었습니다.
 *   브랜드 소개 주소는 DB 에 그 브랜드가 있어야 열리므로 레이아웃이 계산해 넘겨 줍니다.
 */
function informationLinks(brandIntroHref: string): FooterLink[] {
  return [
    { href: brandIntroHref, label: '브랜드 소개' },
    { href: '/brands', label: '브랜드 목록' },
    { href: '/order', label: '장바구니' },
    { href: '/order-lookup', label: '주문 조회' },
    { href: '/inquiry/new', label: '1:1 문의' },
  ];
}

/**
 * CUSTOMER — 공지와 약관처럼 '읽어 두어야 하는' 것들.
 *
 * ★ 개인정보처리방침만 굵게 냅니다. 취향이 아니라 의무입니다.
 *   개인정보 보호법은 처리방침을 다른 고지사항과 구분해
 *   알아보기 쉽게 표시하도록 정하고 있습니다. 굵기를 빼지 마세요.
 */
const CUSTOMER_LINKS: FooterLink[] = [
  { href: '/notice', label: '공지사항' },
  { href: '/guide', label: '배송·교환·반품 안내' },
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침', strong: true },
];

/** 제목 한 줄 + 링크 목록. 세 열이 모양을 공유하도록 한 곳에 모았습니다. */
function FooterNav({
  title,
  ariaLabel,
  links,
}: {
  title: string;
  ariaLabel: string;
  links: FooterLink[];
}) {
  return (
    <nav aria-label={ariaLabel}>
      <p className="label-xs">{title}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={`tap-target break-keep text-[15px] text-ink transition-opacity duration-200 hover:opacity-60 ${
                link.strong ? 'font-semibold' : ''
              }`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 구매안전(에스크로) 서비스 표시. 설정에 값이 있을 때만 넘어옵니다. */
export type EscrowNotice = {
  notice: string;
  imageUrl: string;
  linkUrl: string;
};

/** 분류와 스토어 정보는 DB 에서 읽어 레이아웃이 넘겨 줍니다. */
export default function Footer({
  categories,
  store,
  sns,
  escrow,
  brandIntroHref,
}: {
  categories: Category[];
  store: StoreSettings;
  sns: SnsSettings;
  escrow?: EscrowNotice;
  /** '브랜드 소개' 가 갈 곳. 자체 브랜드 페이지가 없으면 /about 로 옵니다. */
  brandIntroHref: string;
}) {
  /** CATEGORY 열 — DB 분류 뒤에 '전체 상품' 을 한 줄 덧붙입니다. */
  const categoryLinks: FooterLink[] = [
    ...visibleCategories(categories).map((category) => ({
      href: `/category/${category.slug}`,
      label: category.nameKo,
    })),
    { href: '/products', label: '전체 상품' },
  ];

  /** 사업자 정보 — 표시 순서를 여기 한 줄로 정합니다. */
  const businessRows = [
    { label: '상호', value: store.business.company },
    { label: '대표자', value: store.business.ceo },
    { label: '사업자등록번호', value: store.business.regNumber },
    { label: '통신판매업신고번호', value: store.business.mailOrder },
    { label: '주소', value: store.business.address },
    { label: '고객센터', value: store.phone },
  ];

  return (
    <footer className="mt-20 border-t border-stone md:mt-32">
      {/*
        브랜드 블록 + 링크 열 세 개입니다. 화면 폭에 따라 세 단계로 접힙니다.

        ★ 모바일(2칸) — 브랜드가 한 줄을 다 쓰고, 그 아래 링크 열이 2단으로 흐릅니다.
            CATEGORY · INFORMATION 이 한 줄, CUSTOMER 가 그 아래로 내려갑니다.
          아코디언은 쓰지 않았습니다. 열어 봐야 나오는 메뉴는 눌러 본 사람만 보고,
          약관·처리방침은 '항상 보이는 것' 이라야 표시한 의미가 있습니다.
        ★ 태블릿(3칸) — 브랜드가 한 줄, 링크 열 셋이 그 아래 나란히 섭니다.
        ★ 데스크톱(5칸) — 브랜드가 두 칸, 링크 열이 한 칸씩 오른쪽을 채웁니다.
          열을 하나 더 늘릴 일이 생기면 lg:grid-cols-6 으로 올리면 됩니다.
      */}
      <div className="shell grid grid-cols-2 gap-x-6 gap-y-12 py-16 md:grid-cols-3 md:gap-8 md:py-20 lg:grid-cols-5">
        <div className="col-span-2 md:col-span-3 lg:col-span-2">
          <p className="font-display text-[22px] font-light tracking-[0.34em] text-ink">
            {store.name}
          </p>
          <p className="mt-4 font-serif text-[17px] text-ink">{store.slogan}</p>
          <p className="mt-3 max-w-[420px] text-[15px] leading-relaxed text-ink">
            {store.intro}
          </p>

          <div className="mt-8">
            <p className="label-xs">고객센터</p>
            {/*
              ★ 번호는 텍스트로만 둡니다. 전화 걸기 링크를 걸지 않습니다. (3-G)
                사업자 정보 표시 의무가 있어 번호 자체는 반드시 남기지만,
                문의는 카카오톡으로 받기로 했습니다. 링크로 두면 전화가 계속 옵니다.
            */}
            <p className="mt-2 font-display text-[26px] tracking-[0.1em] text-ink">
              {store.phone}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{store.hours}</p>
            {store.email ? (
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                <a href={`mailto:${store.email}`} className="underline underline-offset-4">
                  {store.email}
                </a>
              </p>
            ) : null}
            {/* 설정에 채팅방 주소가 없으면 이 버튼은 나오지 않습니다. */}
            <KakaoChatButton className="mt-5" />
          </div>
        </div>

        <FooterNav title="CATEGORY" ariaLabel="카테고리" links={categoryLinks} />
        <FooterNav
          title="INFORMATION"
          ariaLabel="이용 안내"
          links={informationLinks(brandIntroHref)}
        />
        <FooterNav title="CUSTOMER" ariaLabel="고객 안내" links={CUSTOMER_LINKS} />
      </div>

      {/* SNS — 사업자 정보 바로 위. 채운 항목이 하나도 없으면 이 줄 자체가 없습니다. */}
      {hasAnySns(sns) ? (
        <div className="border-t border-stone">
          <div className="shell py-5">
            <SnsLinks sns={sns} />
          </div>
        </div>
      ) : null}

      <div className="border-t border-stone">
        <div className="shell py-10">
          <h2 className="label-xs">사업자 정보</h2>
          {/*
            한 줄에 한 항목씩, 라벨과 값을 두 칸으로 맞춥니다.

            ★ 라벨 칸을 auto 로 두어 가장 긴 라벨(통신판매업신고번호)에 폭을 맞춥니다.
              고정폭을 주면 라벨을 하나 더 넣을 때마다 그 숫자를 다시 재야 합니다.
            ★ 라벨은 줄바꿈하지 않고(whitespace-nowrap), 값만 접힙니다.
              라벨이 두 줄로 접히면 값과 첫 줄이 어긋나 표로 안 보입니다.
            ★ 값에는 break-keep 을 씁니다. 한국어 낱말 중간에서 끊기지 않아
              좁은 화면에서 "인천광역 / 시 부평구" 처럼 갈라지지 않습니다.
            ★ 폭을 제한합니다. 넓은 화면에서 값이 화면 끝까지 늘어나면
              라벨과 값 사이가 벌어져 읽는 눈이 짝을 잃습니다.
          */}
          <dl className="mt-4 grid max-w-[520px] grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13px] leading-relaxed">
            {businessRows.map((row) => (
              <Fragment key={row.label}>
                <dt className="whitespace-nowrap text-muted">{row.label}</dt>
                <dd className="break-keep text-ink">{row.value}</dd>
              </Fragment>
            ))}
          </dl>
          {/* 구매안전서비스 — 무통장입금 선결제는 표시가 필요합니다. */}
          {escrow && (escrow.notice || escrow.imageUrl) ? (
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-stone pt-6">
              {escrow.imageUrl ? (
                <a
                  href={escrow.linkUrl || undefined}
                  target={escrow.linkUrl ? '_blank' : undefined}
                  rel="noreferrer"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={escrow.imageUrl}
                    alt="구매안전서비스 가입 확인"
                    className="h-auto max-w-[120px]"
                  />
                </a>
              ) : null}
              {escrow.notice ? (
                <p className="max-w-[640px] text-[13px] leading-relaxed text-muted">
                  {escrow.notice}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-6 text-[13px] tracking-[0.1em] text-muted">
            © {store.name} ALL RIGHTS RESERVED.
          </p>
        </div>
      </div>
    </footer>
  );
}
