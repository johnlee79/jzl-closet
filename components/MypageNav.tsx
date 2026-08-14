'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MENU = [
  { href: '/mypage', label: '요약', exact: true },
  { href: '/mypage/orders', label: '주문 내역' },
  { href: '/mypage/inquiries', label: '문의 내역' },
  { href: '/mypage/profile', label: '회원정보 수정' },
  { href: '/mypage/withdraw', label: '회원 탈퇴' },
];

export default function MypageNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="마이페이지 메뉴">
      <ul className="flex flex-wrap gap-x-2 gap-y-1 border-b border-stone pb-4 lg:flex-col lg:border-b-0 lg:border-l lg:pb-0 lg:pl-0">
        {MENU.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-[44px] items-center px-4 py-2 text-[15px] transition-colors lg:w-full lg:border-l-2 lg:pl-5 ${
                  active
                    ? 'font-medium text-ink lg:border-ink'
                    : 'text-muted hover:text-ink lg:border-transparent'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
