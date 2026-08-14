'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type MenuItem = {
  href: string;
  label: string;
  ready: boolean;
  /** 정확히 이 주소일 때만 활성 표시 (대시보드처럼 하위 경로가 많은 경우) */
  exact?: boolean;
};

/** 지금 쓸 수 있는 메뉴 */
const menu: MenuItem[] = [
  { href: '/admin', label: '대시보드', ready: true, exact: true },
  { href: '/admin/orders', label: '주문 관리', ready: true },
  { href: '/admin/members', label: '회원 관리', ready: true },
  { href: '/admin/inquiries', label: '문의 관리', ready: true },
  { href: '/admin/reviews', label: '리뷰 관리', ready: true },
  { href: '/admin/products', label: '상품 관리', ready: true },
  { href: '/admin/categories', label: '분류 관리', ready: true },
  { href: '/admin/brands', label: '브랜드 관리', ready: true },
  { href: '/admin/design', label: '디자인 관리', ready: true },
  { href: '/admin/notices', label: '공지 관리', ready: true },
  { href: '/admin/popups', label: '팝업 관리', ready: true },
  { href: '/admin/stats', label: '통계', ready: true },
  { href: '/admin/settings', label: '설정', ready: true },
];

/** 다음 단계에서 만들 메뉴. 회색으로 표시만 합니다. */
const upcoming: MenuItem[] = [];

export default function AdminShell({
  children,
  pendingCount = 0,
  pendingInquiryCount = 0,
}: {
  children: React.ReactNode;
  /** 입금대기 건수 — 주문 관리 옆에 뱃지로 붙습니다. */
  pendingCount?: number;
  /** 미답변 문의 건수 — 문의 관리 옆에 뱃지로 붙습니다. */
  pendingInquiryCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // 화면을 이동하면 모바일 메뉴를 닫습니다.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await fetch('/api/admin/login', { method: 'DELETE' });
    router.replace('/admin/login');
    router.refresh();
  };

  const nav = (
    <nav aria-label="관리자 메뉴" className="flex flex-col gap-1">
      {menu.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        // 처리할 일이 있으면 메뉴 옆에 숫자를 붙여 눈에 띄게 합니다.
        const badge =
          item.href === '/admin/orders'
            ? pendingCount
            : item.href === '/admin/inquiries'
              ? pendingInquiryCount
              : 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-[14px] font-medium transition-colors ${
              active ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {item.label}
            {badge > 0 ? (
              <span
                title={
                  item.href === '/admin/orders'
                    ? `입금대기 ${badge}건`
                    : `미답변 ${badge}건`
                }
                className={`admin-badge ${
                  active ? 'bg-white text-blue-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}

      {upcoming.length > 0 ? (
        <span className="my-2 border-t border-slate-200" aria-hidden="true" />
      ) : null}

      {upcoming.map((item) => (
        <span
          key={item.href}
          aria-disabled="true"
          title="다음 단계에서 제공됩니다"
          className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2.5 text-[14px] text-slate-400"
        >
          {item.label}
          <span className="text-[11px]">준비 중</span>
        </span>
      ))}
    </nav>
  );

  return (
    <div className="admin-root min-h-screen">
      {/* 모바일 상단 바 — 폰으로 급히 품절 처리할 때 쓰는 화면입니다. */}
      {/* 인쇄할 때는 사이드바와 상단 바를 숨기고 본문만 남깁니다. (주문서 인쇄) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="admin-sidebar"
          className="admin-btn"
        >
          <svg width="16" height="12" viewBox="0 0 16 12" stroke="currentColor" aria-hidden="true">
            <path d="M0 1h16M0 6h16M0 11h16" />
          </svg>
          메뉴
        </button>
        <span className="text-[15px] font-semibold">JZL CLOSET 관리자</span>
        <button type="button" onClick={handleLogout} className="admin-btn">
          로그아웃
        </button>
      </header>

      <div className="lg:flex">
        <aside
          id="admin-sidebar"
          className={`${
            open ? 'block' : 'hidden'
          } border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[220px] lg:shrink-0 lg:border-b-0 lg:border-r print:hidden`}
        >
          <div className="mb-6 hidden lg:block">
            <p className="text-[15px] font-semibold text-slate-900">JZL CLOSET</p>
            <p className="text-[12px] text-slate-500">관리자</p>
          </div>

          {nav}

          <div className="mt-6 flex flex-col gap-2 border-t border-slate-200 pt-4">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-100"
            >
              쇼핑몰 보기 ↗
            </a>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="hidden rounded-md px-3 py-2 text-left text-[13px] text-slate-600 hover:bg-slate-100 lg:block"
            >
              {loggingOut ? '로그아웃 중…' : '로그아웃'}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
