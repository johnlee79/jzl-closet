'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import AccountMenu from '@/components/AccountMenu';
import CartBadge from '@/components/CartBadge';
import {
  hasVisibleChildren,
  visibleCategories,
  visibleSubCategories,
  type Category,
} from '@/lib/categories';

/*
 * ★ 첫 줄은 '편집숍 소개' 입니다. (3-H A-1 과 같은 이유)
 *   가는 곳(/about)은 예전부터 편집숍 자체 소개였는데 이름만 '브랜드 소개' 였습니다.
 *   푸터를 '편집숍 소개' 로 고치면서 상단만 다른 이름으로 두면
 *   같은 페이지가 사이트 안에서 두 이름으로 불리게 됩니다.
 *   개별 브랜드 소개는 /brand/{slug} 이고 그쪽 문구는 그대로 '브랜드 소개' 입니다.
 */
const mainLinks = [
  { href: '/about', label: '편집숍 소개' },
  { href: '/guide', label: '배송·교환 안내' },
  { href: '/order', label: '장바구니 · 주문' },
];

type HeaderProps = {
  /** DB 에서 읽은 분류 전체. 노출 여부는 여기서 거릅니다. */
  categories: Category[];
  storeName: string;
  storePhone: string;
  storeHours: string;
  /** 관리자 > 설정 > 브랜딩 에서 올린 로고. 없으면 텍스트 로고를 씁니다. */
  logoUrl: string;
};

/**
 * ★ 로그인 상태는 AccountMenu 가 브라우저에서 따로 확인합니다.
 *   여기서 쿠키를 읽으면 프론트 전 페이지가 동적 렌더링으로 바뀌어
 *   상품·카테고리 페이지의 정적 생성(SEO)이 깨집니다.
 */
export default function Header({
  categories,
  storeName,
  storePhone,
  storeHours,
  logoUrl,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menu = visibleCategories(categories);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  /**
   * 로고.
   * ★ 좁은 화면에서 버튼과 겹치거나 줄바꿈되지 않도록 글자 크기와 자간을
   *   단계별로 줄입니다. (모바일 15px → sm 18px → md 24px)
   */
  const logo = logoUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={logoUrl} alt={storeName} className="h-7 w-auto object-contain sm:h-8 md:h-9" />
  ) : (
    <span className="whitespace-nowrap font-display text-[16px] font-light tracking-[0.18em] text-ink sm:text-[19px] sm:tracking-[0.26em] md:text-[26px] md:tracking-[0.34em]">
      {storeName}
    </span>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-stone bg-paper">
      {/* 좁은 화면에서는 간격을 줄여 로고와 버튼이 겹치지 않게 합니다. */}
      <div className="shell relative flex h-16 items-center justify-between gap-2 sm:gap-4 md:h-20 md:gap-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center md:hidden"
        >
          <svg width="20" height="12" viewBox="0 0 20 12" stroke="#14141A" aria-hidden="true">
            <path d="M0 0.5h20M0 11.5h20M0 6h20" />
          </svg>
        </button>

        {/*
          로고.
          ★ 모바일에서는 절대 위치로 정중앙에 둡니다.
            왼쪽은 햄버거 하나(40px)뿐인데 오른쪽은 마이페이지+장바구니라 폭이 다릅니다.
            흐름 안에 두고 가운데 정렬하면 오른쪽이 무거운 만큼 로고가 왼쪽으로 밀립니다.
            (로그인 여부에 따라 오른쪽 폭이 바뀌므로 고정 여백으로도 맞출 수 없습니다)
          ★ md 이상에서는 static 으로 돌려 기존 PC 배치를 그대로 둡니다.
        */}
        <Link
          href="/"
          className="absolute left-1/2 -translate-x-1/2 md:static md:left-auto md:translate-x-0 md:shrink-0"
          aria-label={`${storeName} 홈으로`}
        >
          {logo}
        </Link>

        <nav aria-label="주요 메뉴" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {menu.map((category) => (
              <li key={category.slug} className="group/item relative">
                <Link
                  href={`/category/${category.slug}`}
                  className="block py-6 text-[18px] tracking-[0.18em] text-ink transition-opacity duration-200 hover:opacity-60"
                >
                  {category.label}
                </Link>

                {hasVisibleChildren(category) ? (
                  <div className="pointer-events-none absolute left-1/2 top-full z-50 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                    <ul className="min-w-[132px] border border-stone bg-paper py-3">
                      {visibleSubCategories(categories, category.slug).map((child) => (
                        <li key={child.slug}>
                          <Link
                            href={`/category/${category.slug}/${child.slug}`}
                            className="block whitespace-nowrap px-5 py-2 text-[17px] tracking-[0.12em] text-ink transition-opacity duration-200 hover:opacity-60"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        {/* 오른쪽 — 계정 영역과 장바구니.
            장바구니는 세로 구분선으로 버튼과 나눠 둡니다.
            ★ 모바일 비로그인 상태에서는 계정 영역이 통째로 비고 장바구니만 남습니다.
              (로그인·회원가입은 햄버거 메뉴 맨 위에 그대로 있습니다) */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 md:ml-0">
          {/* 데스크탑: 버튼 두 개 */}
          <AccountMenu />
          {/* 모바일·태블릿: 버튼 하나 (또는 사람 아이콘) */}
          <span className="lg:hidden">
            <AccountMenu variant="mobile" />
          </span>

          {/* 구분선은 왼쪽에 버튼이 있을 때만 의미가 있습니다. 모바일에서는 뺍니다. */}
          <span
            aria-hidden="true"
            className="hidden h-4 w-px bg-stone md:block"
          />
          <CartBadge />
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-paper md:hidden">
          <div className="shell flex h-16 items-center justify-between">
            {logo}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="메뉴 닫기"
              className="flex h-10 w-10 items-center justify-center"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" stroke="#14141A" aria-hidden="true">
                <path d="M1 1l14 14M15 1L1 15" />
              </svg>
            </button>
          </div>

          <nav aria-label="모바일 메뉴" className="shell pb-20 pt-4">
            {/* ★ 로그인·회원가입을 메뉴 맨 위에 크게 둡니다. */}
            <div className="pb-6">
              <AccountMenu variant="drawer" />
            </div>

            <p className="label-xs">CATEGORY</p>
            <ul className="mt-4 border-t border-stone">
              {menu.map((category) => (
                <li key={category.slug} className="border-b border-stone py-4">
                  <Link
                    href={`/category/${category.slug}`}
                    className="block text-[18px] tracking-[0.16em] text-ink"
                  >
                    {category.label}
                  </Link>

                  {hasVisibleChildren(category) ? (
                    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                      {visibleSubCategories(categories, category.slug).map((child) => (
                        <li key={child.slug}>
                          <Link
                            href={`/category/${category.slug}/${child.slug}`}
                            className="text-[14px] text-muted"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>

            <p className="label-xs mt-10">INFORMATION</p>
            <ul className="mt-4 border-t border-stone">
              <li className="border-b border-stone">
                <Link href="/products" className="block py-4 text-[17px] text-ink">
                  전체 상품
                </Link>
              </li>
              <li className="border-b border-stone">
                <Link href="/brands" className="block py-4 text-[17px] text-ink">
                  브랜드 목록
                </Link>
              </li>
              {mainLinks.map((link) => (
                <li key={link.href} className="border-b border-stone">
                  <Link href={link.href} className="block py-4 text-[17px] text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li className="border-b border-stone">
                <Link href="/order-lookup" className="block py-4 text-[17px] text-ink">
                  주문 조회
                </Link>
              </li>
              <li className="border-b border-stone">
                <Link href="/inquiry/new" className="block py-4 text-[17px] text-ink">
                  1:1 문의
                </Link>
              </li>
            </ul>

            <p className="mt-10 text-[14px] leading-relaxed text-muted">
              고객센터 {storePhone}
              <br />
              {storeHours}
            </p>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
