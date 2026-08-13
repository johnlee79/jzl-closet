'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import CartBadge from '@/components/CartBadge';
import {
  getVisibleCategories,
  getVisibleSubCategories,
  hasChildren,
} from '@/lib/categories';
import { store } from '@/lib/store';

const mainLinks = [
  { href: '/about', label: '브랜드 소개' },
  { href: '/guide', label: '배송·교환 안내' },
  { href: '/order', label: '장바구니 · 주문' },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menu = getVisibleCategories();

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

  return (
    <header className="sticky top-0 z-40 border-b border-stone bg-paper">
      <div className="shell flex h-16 items-center justify-between gap-6 md:h-20">
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

        <Link
          href="/"
          className="shrink-0 font-display text-[20px] font-light tracking-[0.34em] text-ink md:text-[24px]"
          aria-label={`${store.name} 홈으로`}
        >
          JZL CLOSET
        </Link>

        <nav aria-label="주요 메뉴" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {menu.map((category) => (
              <li key={category.slug} className="group/item relative">
                <Link
                  href={`/category/${category.slug}`}
                  className="block py-6 text-[17px] tracking-[0.18em] text-ink transition-opacity duration-200 hover:opacity-60"
                >
                  {category.label}
                </Link>

                {hasChildren(category) ? (
                  <div className="pointer-events-none absolute left-1/2 top-full z-50 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                    <ul className="min-w-[132px] border border-stone bg-paper py-3">
                      {getVisibleSubCategories(category.slug).map((child) => (
                        <li key={child.slug}>
                          <Link
                            href={`/category/${category.slug}/${child.slug}`}
                            className="block whitespace-nowrap px-5 py-2 text-[16px] tracking-[0.12em] text-ink transition-opacity duration-200 hover:opacity-60"
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

        <div className="flex shrink-0 items-center gap-5">
          <Link
            href="/products"
            className="hidden text-[13px] tracking-[0.14em] text-muted transition-opacity duration-200 hover:opacity-60 lg:inline"
          >
            SHOP
          </Link>
          <CartBadge />
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-paper md:hidden">
          <div className="shell flex h-16 items-center justify-between">
            <span className="font-display text-[20px] font-light tracking-[0.34em] text-ink">
              JZL CLOSET
            </span>
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
            <ul className="border-t border-stone">
              {menu.map((category) => (
                <li key={category.slug} className="border-b border-stone py-4">
                  <Link
                    href={`/category/${category.slug}`}
                    className="block text-[17px] tracking-[0.16em] text-ink"
                  >
                    {category.label}
                  </Link>

                  {hasChildren(category) ? (
                    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                      {getVisibleSubCategories(category.slug).map((child) => (
                        <li key={child.slug}>
                          <Link
                            href={`/category/${category.slug}/${child.slug}`}
                            className="text-[13px] text-muted"
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
                <Link href="/products" className="block py-4 text-[16px] text-ink">
                  전체 상품
                </Link>
              </li>
              <li className="border-b border-stone">
                <Link href="/brand" className="block py-4 text-[16px] text-ink">
                  브랜드 목록
                </Link>
              </li>
              {mainLinks.map((link) => (
                <li key={link.href} className="border-b border-stone">
                  <Link href={link.href} className="block py-4 text-[16px] text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <p className="mt-10 text-[13px] leading-relaxed text-muted">
              고객센터 {store.phone}
              <br />
              평일 10:00 — 17:00 (점심 12:30 — 13:30, 주말·공휴일 휴무)
            </p>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
