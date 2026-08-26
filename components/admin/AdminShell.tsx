'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from '@/components/admin/ThemeToggle';
import { adminSignOutAction } from '@/app/admin/login-actions';
import ScrollToTop from '@/components/ScrollToTop';

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
  /** 같은 화면을 상태로 나눠 쓰는 경우 (주문) — ?status= 값까지 맞아야 활성 */
  status?: string;
  /** 어떤 숫자를 뱃지로 붙일지 */
  badge?: 'pendingPayment' | 'needsCheck' | 'unshipped' | 'cancelRequested' | 'inquiries';
};

/**
 * ** 빨간 뱃지로 낼 것들. (2026-08-26)
 *   "돈이 오갔는지 모르는 주문" 과 "손님이 취소를 요청한 주문" 입니다.
 *   둘 다 모르고 지나가면 손해나 분쟁으로 이어집니다.
 *   나머지(입금대기 · 미출고 · 미답변 문의)는 노랑입니다. 밀린 일이지
 *   사고는 아닙니다.
 * * 한 곳에 모아 둡니다. 두 자리에서 따로 판단하면 접었을 때와 펼쳤을 때
 *   색이 다른 일이 생깁니다.
 */
const DANGER_BADGES: Leaf['badge'][] = ['needsCheck', 'cancelRequested'];

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
    /*
     * ★ '확인 필요' 와 '미출고' 는 주문 목록의 탭이지만 메뉴로도 꺼내 둡니다.
     *   숫자만 뱃지로 보여 주고 누를 곳이 없으면, 사장님이 목록에 들어가 탭을
     *   다시 찾아야 합니다. 매일 보는 두 목록이라 한 번에 들어가게 합니다.
     * ★ 주소의 status 값은 lib/order-status.ts 의 NEEDS_CHECK_TAB · UNSHIPPED_TAB
     *   과 같아야 합니다. 다르면 뱃지 숫자와 목록 건수가 어긋납니다.
     */
    items: [
      /*
        ** '주문 목록' 에는 숫자를 붙이지 않습니다. (2026-08-26)
          전에는 여기 노란 숫자가 붙어 있었는데, 그것이 입금대기 건수였습니다.
          이름은 '주문 목록' 인데 숫자는 입금대기라, 보는 사람이 그 숫자가
          무엇인지 알 수 없었습니다. 새 주문인지 취소 요청인지 짐작만 했습니다.
          숫자는 아래 '입금대기' 로 옮겼습니다. 이름이 곧 그 숫자의 뜻입니다.
      */
      { href: '/admin/orders', label: '주문 목록', exact: true },
      {
        href: '/admin/orders?status=needs_check',
        label: '확인 필요',
        status: 'needs_check',
        badge: 'needsCheck',
      },
      /*
        ** '취소요청' 을 '미출고' 바로 위에 둡니다. (2026-08-26)
          순서가 곧 처리 순서입니다. 취소 요청이 들어온 주문을 모르고
          보내 버리면 회수 배송비가 나가고 분쟁이 됩니다.
          보내기 전에 반드시 먼저 보는 자리라 위에 둡니다.
        ** 전에는 이 숫자를 볼 곳이 없었습니다. '주문 목록' 옆 노란 뱃지는
          입금대기 건수라 취소 요청과 무관합니다.
      */
      {
        href: '/admin/orders?status=cancel_requested',
        label: '취소요청',
        status: 'cancel_requested',
        badge: 'cancelRequested',
      },
      {
        href: '/admin/orders?status=pending_payment',
        label: '입금대기',
        status: 'pending_payment',
        badge: 'pendingPayment',
      },
      {
        href: '/admin/orders?status=unshipped',
        label: '미출고',
        status: 'unshipped',
        badge: 'unshipped',
      },
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

/*
 * ============================================================
 * ★★★ 관리자 화면의 링크는 전부 prefetch={false} 입니다 (2026-08-26)
 * ============================================================
 *
 * ★★ 되돌리지 마세요. 느려서 끈 것이 아니라 틀린 화면이 떠서 끈 것입니다.
 *
 * ★★ 무슨 일이 있었는가
 *   회원 관리 화면에 **DB 에 없는 사람이 11명** 떴습니다.
 *   서버는 정상이었습니다 — CSV 내보내기는 3줄이었고, 같은 주소를
 *   55번 요청해도 전부 3행이었습니다. Supabase 에서 직접 센 것도 3명입니다.
 *   그런데 화면에는 11행이 나왔고, 상단 숫자와 탭은 새것인데 목록만
 *   옛것이었습니다. 한 화면에 두 시점이 섞여 있었습니다.
 *
 * ★★ 원인 — 브라우저가 미리 당겨 둔 화면 조각을 다시 쓴 것입니다
 *   Next.js 의 <Link> 는 기본으로 화면을 미리 당겨 옵니다.
 *   그 조각이 브라우저 안에 얼마나 남는지는 next.config.mjs 의
 *   experimental.staleTimes 가 정합니다. 우리는 dynamic: 0 을 넣어
 *   껐다고 생각했는데, 그것은 반쪽이었습니다.
 *
 *   Next 내부(prefetch-cache-utils.js)를 열어 보면 이렇습니다.
 *       if (kind === "auto") {
 *         if (Date.now() < prefetchTime + STATIC_STALETIME_MS) return stale;
 *       }
 *   <Link> 가 만든 항목은 kind 가 'auto' 라, dynamic 을 0 으로 해도
 *   **static 창(기본 5분)** 동안 따로 살아남습니다.
 *   실제로 배포된 번들에서 값을 확인했습니다 —  dynamic 0초 / static 300초.
 *   그래서 사이드바를 한 번 훑기만 해도 관리자 화면들이 5분짜리로 쌓입니다.
 *
 * ★★ layout.tsx 의 fetchCache = 'force-no-store' 로는 못 막습니다.
 *   그것은 **서버**가 Supabase 응답을 저장하지 않게 하는 설정입니다.
 *   브라우저 안의 저장소와는 아무 상관이 없습니다.
 *
 * ★★ 왜 이 방법을 골랐는가
 *   staleTimes.static 을 0 으로 두면 확실하지만 **손님 화면까지** 느려집니다.
 *   이 사이트는 손님 화면의 체감 속도를 건드리지 않기로 되어 있습니다.
 *   그래서 관리자 링크만 껐습니다. 손님 화면은 그대로 빠릅니다.
 *
 * ★★ 관리자는 조금 느린 것보다 틀린 화면이 훨씬 나쁜 곳입니다.
 *   주문·회원·재고를 보고 물건을 내보내는 화면입니다. 옛 목록을 보고
 *   판단하면 물건이 잘못 나갑니다. 0.2초 빠른 것과 바꿀 수 없습니다.
 *
 * ★ 관리자 화면 안에서도 **손님 화면으로 가는 링크**(상품 미리보기,
 *   공지 보기 등)에는 넣지 않았습니다. 그쪽은 손님 화면이라 그대로 둡니다.
 */
export default function AdminShell({
  children,
  pendingCount = 0,
  needsCheckCount = 0,
  unshippedCount = 0,
  cancelRequestedCount = 0,
  pendingInquiryCount = 0,
}: {
  children: React.ReactNode;
  /** 입금대기 건수 — '입금대기' 메뉴 옆에 뱃지로 붙습니다. (전에는 '주문 목록' 옆) */
  pendingCount?: number;
  /** 승인확인실패 + 검토필요 — 돈이 오갔는지 모르는 주문입니다. */
  needsCheckCount?: number;
  /** 결제완료 + 상품준비중 — 아직 안 보낸 주문입니다. */
  unshippedCount?: number;
  /** 손님이 취소를 요청했고 아직 처리하지 않은 주문입니다. 보내면 안 됩니다. */
  cancelRequestedCount?: number;
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

  const badgeOf = (kind?: Leaf['badge']): number => {
    switch (kind) {
      case 'pendingPayment':
        return pendingCount;
      case 'needsCheck':
        return needsCheckCount;
      case 'unshipped':
        return unshippedCount;
      case 'cancelRequested':
        return cancelRequestedCount;
      case 'inquiries':
        return pendingInquiryCount;
      default:
        return 0;
    }
  };

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

  /*
   * ★★ 두 가지 길로 들어올 수 있으므로 나갈 때도 둘 다 정리합니다.
   *   옛 쿠키만 지우면 Supabase 세션이 살아 있어 그대로 다시 들어가지고,
   *   반대도 마찬가지입니다.
   *   "로그아웃했는데 그대로 들어가진다" 는 가장 놀라운 종류의 버그입니다.
   *
   * ★ 한쪽이 실패해도 다른 쪽은 정리합니다.
   *   나가는 길이 반쯤 막히면 손님용 화면에 관리자 계정이 남습니다.
   */
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);

    await Promise.allSettled([
      fetch('/api/admin/login', { method: 'DELETE' }),
      adminSignOutAction(),
    ]);

    router.replace('/admin/login');
    router.refresh();
  };

  /*
   * ★ '확인 필요' 만 빨강입니다. 돈이 오갔는지 모르는 주문이라 다른 숫자와
   *   같은 무게로 보이면 안 됩니다. 나머지는 지금까지처럼 앰버입니다.
   * ★ 켜진 줄은 배경이 파랑이라 뱃지를 흰 바탕으로 뒤집습니다.
   */
  const Badge = ({
    count,
    active,
    tone = 'warn',
  }: {
    count: number;
    active: boolean;
    tone?: 'warn' | 'danger';
  }) =>
    count > 0 ? (
      <span
        className={`admin-badge ${
          active
            ? 'bg-white text-blue-700'
            : tone === 'danger'
              ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-800'
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
              className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-[16px] font-medium transition-colors ${
                active ? 'bg-blue-700 text-white' : 'text-slate-800 hover:bg-slate-100'
              }`}
            prefetch={false}
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
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-[16px] font-medium transition-colors ${
                active && !isOpen
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              {group.icon}
              <span className="flex-1">{group.label}</span>
              {/* ★ 접혀 있을 때는 그룹 안 숫자를 모두 더해 보여 줍니다.
                  하나라도 빨강이면 그룹 뱃지도 빨강입니다. 접어 두었다고
                  급한 건이 눈에 안 띄면 접는 기능이 위험해집니다. */}
              {!isOpen ? (
                <Badge
                  count={groupBadge}
                  active={false}
                  tone={
                    (group.items ?? []).some(
                      (item) =>
                        DANGER_BADGES.includes(item.badge) && badgeOf(item.badge) > 0
                    )
                      ? 'danger'
                      : 'warn'
                  }
                />
              ) : null}
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
                  const currentStatus = searchParams.get('status') ?? '';

                  /*
                   * ★ 설정처럼 한 화면을 탭으로 나눠 쓰는 항목은 ?tab= 까지 맞아야 합니다.
                   *   그렇지 않으면 '포인트' 와 '설정' 이 동시에 켜집니다.
                   * ★ 주문의 '확인 필요'·'미출고' 도 같은 화면이라 ?status= 까지 봅니다.
                   *   그리고 그 둘이 켜져 있으면 '주문 목록' 은 꺼야 합니다.
                   *   안 그러면 두 줄이 동시에 파랗게 켜집니다.
                   */
                  const leafActive = item.status
                    ? pathname === base && currentStatus === item.status
                    : item.tab
                      ? pathname === base && currentTab === item.tab
                      : item.exact
                        ? pathname === base &&
                          !(group.items ?? []).some(
                            (other) =>
                              (other.tab && other.tab === currentTab) ||
                              (other.status && other.status === currentStatus)
                          )
                        : pathname === base || pathname.startsWith(`${base}/`);
                  const count = badgeOf(item.badge);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={leafActive ? 'page' : undefined}
                        className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[15px] transition-colors ${
                          leafActive
                            ? 'bg-blue-700 font-medium text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      prefetch={false}
                      >
                        {item.label}
                        <Badge
                          count={count}
                          active={leafActive}
                          tone={DANGER_BADGES.includes(item.badge) ? 'danger' : 'warn'}
                        />
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
        {/*
          ★ 누르면 대시보드로 갑니다. (2026-08-25)
            로고를 누르면 처음 화면으로 가는 것이 웹에서 굳어진 약속입니다.
            지금까지는 글자였을 뿐이라 눌러도 아무 일도 없었습니다.
        */}
        <Link href="/admin" className="text-[17px] font-semibold hover:underline" prefetch={false}>
          JZL CLOSET 관리자
        </Link>
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
            {/* ★ 사이드바 로고도 같습니다. 두 곳이 다르게 동작하면 더 헷갈립니다. */}
            <Link href="/admin" className="group" prefetch={false}>
              <p className="text-[17px] font-semibold text-slate-900 group-hover:underline">
                JZL CLOSET
              </p>
              <p className="text-[15px] text-slate-600">관리자</p>
            </Link>
            <ThemeToggle />
          </div>

          {nav}

          <div className="mt-6 flex flex-col gap-2 border-t border-slate-200 pt-4">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-3 py-2 text-[16px] text-slate-700 hover:bg-slate-100"
            >
              쇼핑몰 보기 ↗
            </a>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="hidden rounded-md px-3 py-2 text-left text-[16px] text-slate-700 hover:bg-slate-100 lg:block"
            >
              {loggingOut ? '로그아웃 중…' : '로그아웃'}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6 print:p-0">{children}</main>
      </div>

      {/*
        맨 위로 — 관리자도 상품·주문 목록이 길어 아래까지 내려가는 일이 잦습니다.
        ★ 인쇄할 때는 나오지 않습니다. (globals.css 의 @media print)
      */}
      <ScrollToTop variant="admin" />
    </div>
  );
}
