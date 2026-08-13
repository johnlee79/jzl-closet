'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** 이번 단계(1-A)에서 만든 메뉴만 활성화하고, 다음 단계 메뉴는 회색으로 표시만 합니다. */
const menu: { href: string; label: string; ready: boolean }[] = [
  { href: '/admin/products', label: '상품 관리', ready: true },
  { href: '/admin/categories', label: '분류 관리', ready: false },
  { href: '/admin/settings', label: '설정', ready: false },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
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
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        if (!item.ready) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="다음 단계에서 제공됩니다"
              className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2.5 text-[14px] text-slate-400"
            >
              {item.label}
              <span className="text-[11px] text-slate-400">준비 중</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-2.5 text-[14px] font-medium transition-colors ${
              active
                ? 'bg-blue-700 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="admin-root min-h-screen">
      {/* 모바일 상단 바 — 폰으로 급히 품절 처리할 때 쓰는 화면입니다. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
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
          } border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[220px] lg:shrink-0 lg:border-b-0 lg:border-r`}
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

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
