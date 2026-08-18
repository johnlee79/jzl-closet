import { Fragment } from 'react';
import Link from 'next/link';
import KakaoChatButton from '@/components/KakaoChatButton';
import SnsLinks from '@/components/SnsLinks';
import { visibleCategories, type Category } from '@/lib/categories';
import type { SnsSettings, StoreSettings } from '@/lib/site-config';

/** 푸터 링크 한 줄. strong 은 개인정보처리방침처럼 굵게 낼 항목에만 붙입니다. */
type FooterLink = { href: string; label: string; strong?: boolean };

/**
 * INFORMATION — 손님이 '무엇을 사고 어디까지 왔는지' 보는 곳.
 *
 * ★ 첫 줄은 '편집숍 소개 → /about' 입니다. (3-H)
 *   3-G 에서는 '브랜드 소개 → /brand/jzl-closet' 이었는데 어긋나 있었습니다.
 *   손님은 "JZL 이 어떤 곳인가" 를 기대하고 누르는데 개별 브랜드 페이지가 나왔습니다.
 *   JZL CLOSET 은 자체 제작이 아니라 병행수입 편집숍이라 네 곳의 성격이 다 다릅니다.
 *     /about            편집숍 자체 소개        ← 이 링크가 가는 곳
 *     /brands           취급 브랜드 목록
 *     /brand/{slug}     개별 브랜드 소개 (GANNI 등)
 *     /brand/jzl-closet 자체 기획 라인 (상품이 생기면)
 *   /about 과 /brand/jzl-closet 을 하나로 합치지 마세요. 성격이 다른 페이지입니다.
 */
const INFORMATION_LINKS: FooterLink[] = [
  { href: '/about', label: '편집숍 소개' },
  { href: '/brands', label: '브랜드 목록' },
  { href: '/order', label: '장바구니' },
  { href: '/order-lookup', label: '주문 조회' },
  { href: '/inquiry/new', label: '1:1 문의' },
];

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
}: {
  categories: Category[];
  store: StoreSettings;
  sns: SnsSettings;
  escrow?: EscrowNotice;
}) {
  /*
    CATEGORY 열 — DB 분류를 그대로 씁니다.

    ★ 예전에는 뒤에 '전체 상품 → /products' 를 한 줄 덧붙였습니다. (3-H 에서 뺐습니다)
      DB 에 이미 '전체' 분류가 있고, 그 분류는 matchType 'all' 이라
      /category/all 도 전체 상품을 보여 줍니다. 같은 목록으로 가는 줄이 둘이었습니다.
      손님에게는 서로 다른 곳처럼 보이는데 열어 보면 같은 화면이 나옵니다.
    ★ 남긴 쪽은 DB 분류입니다. 관리자가 분류를 켜고 끄면 푸터가 따라가야 하는데,
      코드에 박아 둔 줄은 그 관리 밖에 있습니다.
      /products 는 상세 안내 문구와 canonical 을 가진 별도 페이지로 그대로 두고,
      소개·404·주문완료 등 여러 곳에서 계속 링크합니다.
  */
  const categoryLinks: FooterLink[] = visibleCategories(categories).map((category) => ({
    href: `/category/${category.slug}`,
    label: category.nameKo,
  }));

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
          links={INFORMATION_LINKS}
        />
        <FooterNav title="CUSTOMER" ariaLabel="고객 안내" links={CUSTOMER_LINKS} />
      </div>

      <div className="border-t border-stone">
        {/*
          왼쪽 사업자 정보 · 오른쪽 SNS 아이콘.

          ★ SNS 를 따로 한 줄로 두지 않습니다. 사업자 정보는 폭을 520px 로 묶어 놓아
            오른쪽이 늘 비어 있었습니다. 줄을 하나 더 그으면 그 여백이 그대로 남고
            푸터만 한 칸 길어집니다. 빈 자리에 넣는 편이 조용합니다.
          ★ items-center 는 사업자 정보 덩어리 전체(제목·표·에스크로·저작권) 기준입니다.
            표에만 맞추면 에스크로 문구가 있는 페이지에서 아이콘이 위로 떠 보입니다.
          ★ 모바일은 세로로 쌓고 아이콘만 가운데로 옵니다. 폭이 좁아 옆에 못 서는데,
            왼끝에 붙여 두면 사업자 정보 마지막 줄에 딸린 것처럼 보입니다.
        */}
        <div className="shell py-10">
          {/*
            ★ 이 줄만 880px 로 묶습니다. 아이콘을 화면 오른쪽 끝까지 밀지 않으려는 것입니다.
              푸터 전체 폭(1400px)에 justify-between 을 걸면 사업자 정보는 왼쪽 끝,
              아이콘은 오른쪽 끝에 서서 가운데가 텅 빕니다. 한 화면에 있는 두 덩어리로
              안 보이고 서로 남남처럼 떨어져 보입니다.
              880 = 사업자 정보 표(520) + 사이(약 96) + 아이콘 넉 줄(264) 입니다.
              더 당기거나 밀고 싶으면 이 숫자 하나만 만지면 됩니다.
            ★ 폭 제한을 .shell 에 직접 걸면 안 됩니다. .shell 은 mx-auto 라
              880 으로 줄이는 순간 가운데로 모여 위쪽 사업자 정보·저작권과 왼끝이 어긋납니다.
              그래서 shell 안에 한 겹 더 두고 거기에만 겁니다.
            ★ 좁은 화면(880 미만)에서는 이 값이 아무 일도 하지 않습니다.
              그때는 화면 폭이 이미 제한이라 아이콘이 알아서 붙어 옵니다.
          */}
          <div className="flex flex-col gap-10 md:max-w-[880px] md:flex-row md:items-center md:justify-between md:gap-12">
            <div className="w-full md:min-w-0 md:flex-1">
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
                  이 여백이 지금 오른쪽 SNS 아이콘이 서 있는 자리이기도 합니다.
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

            {/*
              채운 항목이 하나도 없으면 SnsLinks 가 스스로 아무것도 그리지 않습니다.
              그때는 사업자 정보만 남고 이 자리가 사라집니다.
            */}
            <SnsLinks sns={sns} size="lg" className="justify-center md:shrink-0" />
          </div>
        </div>
      </div>
    </footer>
  );
}
