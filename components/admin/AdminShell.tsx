'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from '@/components/admin/ThemeToggle';

/**
 * 관리자 사이드바.
 *
 * ★ 메뉴가 늘면서 평면 나열로는 찾기 어려워져 그룹으로 묶었습니다.
 *   · 지금 보고 있는 화면이 속한 그룹은 자동으로 펼칩니다
 *   · 접고 편 상태는 브라우저에 저장해 다음 접속에도 유지합니다
 *   · 미답변 문의·입금대기 숫자는 접힌 상태에서도 그룹 옆에 그대로 보입니다
 * ★ 아이콘은 전부 SVG 입니다. 이모지를 쓰지 않습니다.
 */

const OPEN_KEY = 'jzl-admin-nav-open';

type Leaf = {
  href: string;
  label: string;
  /** 하위 경로가 있어도 이 주소일 때만 활성 표시 */
  exact?: boolean;
  /** 같은 화면을 탭으로 나눠 쓰는 경우 (설정) — ?tab= 값까지 맞아야 활성 */
  tab?: string;
  /** 어떤 숫자를 뱃지로 붙일지 */
  badge?: 'orders' | 'inquiries';
};

type Group = {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** 그룹 자체가 링크인 경우 (대시보드·통계) */
  href?: string;
  exact?: boolean;
  items?: Leaf[];
};

/* ── 아이콘 ─────────────────────────────────────────────── */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const MENU: Group[] = [
  {
    key: 'dashboard',
    label: '대시보드',
    href: '/admin',
    exact: true,
    icon: (
      <Icon>
        <rect x="1.5" y="1.5" width="5.5" height="5.5" />
        <rect x="9" y="1.5" width="5.5" height="5.5" />
        <rect x="1.5" y="9" width="5.5" height="5.5" />
        <rect x="9" y="9" width="5.5" height="5.5" />
      </Icon>
    ),
  },
  {
    key: 'products',
    label: '상품 관리',
    icon: (
      <Icon>
        <path d="M2 5l6-3 6 3-6 3-6-3z" />
        <path d="M2 5v6l6 3 6-3V5" />
        <path d="M8 8v6" />
      </Icon>
    ),
    items: [
      { href: '/admin/products', label: '상품 목록', exact: true },
      { href: '/admin/products/new', label: '상품 등록' },
      { href: '/admin/products/import', label: '상품 가져오기' },
      { href: '/admin/categories', label: '분류 관리' },
      { href: '/admin/brands', label: '브랜드 관리' },
    ],
  },
  {
    key: 'orders',
    label: '주문 관리',
    icon: (
      <Icon>
        <path d="M2 3h2l1.6 8.2a1 1 0 001 .8h6.2a1 1 0 001-.8L15 5.5H4.2" />
        <circle cx="6.5" cy="14" r="0.8" />
        <circle cx="12.5" cy="14" r="0.8" />
      </Icon>
    ),
    items: [
      { href: '/admin/orders', label: '주문 목록', exact: true, badge: 'orders' },
      { href: '/admin/orders/bulk-tracking', label: '송장 일괄등록' },
      { href: '/admin/orders/customers', label: '주문자 목록' },
    ],
  },
  {
    key: 'customers',
    label: '고객 관리',
    icon: (
      <Icon>
        <circle cx="8" cy="5.5" r="2.8" />
        <path d="M2.5 14c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" />
      </Icon>
    ),
    items: [
      { href: '/admin/members', label: '회원 목록' },
      { href: '/admin/inquiries', label: '문의 목록', badge: 'inquiries' },
      { href: '/admin/reviews', label: '리뷰 관리' },
      { href: '/admin/referrals', label: '추천 관리', exact: true },
      { href: '/admin/referrals/goals', label: '목표·사은품' },
      { href: '/admin/referrals/rewards', label: '보상 처리' },
      { href: '/admin/referrals/review', label: '의심 건 검토' },
    ],
  },
  {
    key: 'store',
    label: '스토어 관리',
    icon: (
      <Icon>
        <path d="M2 6l1.2-3.5h9.6L14 6" />
        <path d="M2.5 6v7.5h11V6" />
        <path d="M2 6a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0" />
      </Icon>
    ),
    items: [
      { href: '/admin/design', label: '디자인 관리' },
      { href: '/admin/notices', label: '공지 관리' },
      { href: '/admin/popups', label: '팝업 관리' },
      { href: '/admin/settings?tab=reward', label: '포인트', exact: true, tab: 'reward' },
      { href: '/admin/settings', label: '설정', exact: true },
    ],
  },
  {
    key: 'stats',
    label: '통계',
    href: '/admin/stats',
    icon: (
      <Icon>
        <path d="M2 14V8.5M6.5 14V3M11 14v-4M15 14V6" />
      </Icon>
    ),
  },
];

/** 주소에서 물음표 앞부분만 봅니다. (설정 탭 링크 때문에) */
function basePath(href: string): string {
  return href.split('?')[0];
}

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  /** 펼쳐 둔 그룹 키 */
  const [expanded, setExpanded] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);

  const badgeOf = (kind?: Leaf['badge']): number =>
    kind === 'orders' ? pendingCount : kind === 'inquiries' ? pendingInquiryCount : 0;

  /** 이 그룹 안에 지금 보고 있는 화면이 있는지 */
  const groupActive = (group: Group): boolean => {
    if (group.href) {
      return group.exact ? pathname === group.href : pathname.startsWith(group.href);
    }
    return (group.items ?? []).some((item) => {
      const base = basePath(item.href);
      return pathname === base || pathname.startsWith(`${base}/`);
    });
  };

  // 저장해 둔 펼침 상태를 복원합니다.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OPEN_KEY);
      if (saved) setExpanded(JSON.parse(saved) as string[]);
    } catch {
      /* 저장소를 못 읽으면 현재 그룹만 펼칩니다. */
    }
    setRestored(true);
  }, []);

  // ★ 지금 보고 있는 화면이 속한 그룹은 항상 펼쳐 둡니다.
  useEffect(() => {
    if (!restored) return;
    const current = MENU.find((group) => !group.href && groupActive(group));
    if (current && !expanded.includes(current.key)) {
      setExpanded((prev) => [...prev, current.key]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, restored]);

  // 펼침 상태를 저장합니다.
  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(OPEN_KEY, JSON.stringify(expanded));
    } catch {
      /* 저장하지 못해도 이번 화면에서는 그대로 동작합니다. */
    }
  }, [expanded, restored]);

  // 화면을 이동하면 모바일 메뉴를 닫습니다.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const toggleGroup = (key: string) =>
    setExpanded((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await fetch('/api/admin/login', { method: 'DELETE' });
    router.replace('/admin/login');
    router.refresh();
  };

  const Badge = ({ count, active }: { count: number; active: boolean }) =>
    count > 0 ? (
      <span
        className={`admin-badge ${
          active ? 'bg-white text-blue-700' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {count}
      </span>
    ) : null;

  const nav = (
    <nav aria-label="관리자 메뉴" className="flex flex-col gap-0.5">
      {MENU.map((group) => {
        const active = groupActive(group);

        /* 그룹 자체가 한 화면인 경우 (대시보드·통계) */
        if (group.href) {
          return (
            <Link
              key={group.key}
              href={group.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-[14px] font-medium transition-colors ${
                active ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {group.icon}
              {group.label}
            </Link>
          );
        }

        const isOpen = expanded.includes(group.key);
        // ★ 접혀 있어도 그룹 옆에 숫자가 보여야 합니다.
        const groupBadge = (group.items ?? []).reduce(
          (sum, item) => sum + badgeOf(item.badge),
          0
        );

        return (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              aria-expanded={isOpen}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-[14px] font-medium transition-colors ${
                active && !isOpen
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {group.icon}
              <span className="flex-1">{group.label}</span>
              {!isOpen ? <Badge count={groupBadge} active={false} /> : null}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
                className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
              >
                <path d="M3 1l4 4-4 4" />
              </svg>
            </button>

            {isOpen ? (
              <ul className="mb-1 ml-[26px] flex flex-col gap-0.5 border-l border-slate-200 pl-2">
                {(group.items ?? []).map((item) => {
                  const base = basePath(item.href);
                  const currentTab = searchParams.get('tab') ?? '';

                  // ★ 설정처럼 한 화면을 탭으로 나눠 쓰는 항목은 ?tab= 까지 맞아야 합니다.
                  //   그렇지 않으면 '포인트' 와 '설정' 이 동시에 켜집니다.
                  const leafActive = item.tab
                    ? pathname === base && currentTab === item.tab
                    : item.exact
                      ? pathname === base &&
                        !(group.items ?? []).some(
                          (other) => other.tab && other.tab === currentTab
                        )
                      : pathname === base || pathname.startsWith(`${base}/`);
                  const count = badgeOf(item.badge);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={leafActive ? 'page' : undefined}
                        className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[13.5px] transition-colors ${
                          leafActive
                            ? 'bg-blue-700 font-medium text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {item.label}
                        <Badge count={count} active={leafActive} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="admin-root min-h-screen">
      {/* 모바일 상단 바 — 폰으로 급히 품절 처리할 때 쓰는 화면입니다. */}
      {/* 인쇄할 때는 사이드바와 상단 바를 숨기고 본문만 남깁니다. (주문서 인쇄) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 lg:hidden print:hidden">
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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={handleLogout} className="admin-btn">
            로그아웃
          </button>
        </div>
      </header>

      <div className="lg:flex">
        <aside
          id="admin-sidebar"
          className={`${
            open ? 'block' : 'hidden'
          } border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[228px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r print:hidden`}
        >
          <div className="mb-6 hidden items-start justify-between gap-2 lg:flex">
            <div>
              <p className="text-[15px] font-semibold text-slate-900">JZL CLOSET</p>
              <p className="text-[12px] text-slate-500">관리자</p>
            </div>
            <ThemeToggle />
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
