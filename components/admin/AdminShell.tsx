'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  badge?:
    | 'pendingPayment'
    | 'needsCheck'
    | 'unshipped'
    | 'cancelRequested'
    | 'inquiries'
    | 'reviews';
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
      /*
        ** 무통장입금만입니다. (2026-08-26)
          카드 주문도 pending_payment 로 시작하지만, 카드는 입금할 것이
          없습니다. 뱃지가 무통장만 세므로 목록에도 같은 조건을 겁니다.
          숫자와 목록이 다르면 그게 다음 버그가 됩니다.
      */
      {
        href: '/admin/orders?status=pending_payment&method=bank_transfer',
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
      /*
        ** 링크에 뱃지와 같은 조건을 겁니다. (2026-08-26)
          '미답변' 을 눌렀는데 전체 목록이 나오면 숫자와 목록이 어긋납니다.
          숫자를 누르면 그 숫자만큼 나와야 합니다. '입금대기' 와 같은 원칙입니다.
      */
      { href: '/admin/inquiries?status=pending', label: '문의 목록', badge: 'inquiries' },
      { href: '/admin/reviews?replied=no', label: '리뷰 관리', badge: 'reviews' },
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
  unrepliedReviewCount = 0,
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
  /** 아직 답글을 안 단 리뷰 건수 — 리뷰 관리 옆에 뱃지로 붙습니다. */
  unrepliedReviewCount?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  /** 펼쳐 둔 그룹 키 */
  const [expanded, setExpanded] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);

  /*
   * ============================================================
   * ** 사이드바 숫자는 스스로 새로 가져옵니다 (2026-08-26)
   * ============================================================
   *
   * ** 무엇이 문제였나
   *   이 사이드바는 레이아웃에서 그려집니다. Next.js 는 화면을 옮길 때
   *   **레이아웃을 다시 그리지 않습니다.** 바뀌는 것은 가운데 본문뿐입니다.
   *   그래서 관리자 창을 한 번 연 뒤로는 F5 를 누르기 전까지 이 숫자가
   *   처음 값에 얼어붙어 있었습니다.
   *
   *   손님이 취소 요청을 눌러도 관리자는 몰랐습니다. revalidatePath 는
   *   "다음에 물어보면 새 걸 주겠다" 는 약속일 뿐이고, 서버가 이미 열려
   *   있는 창에게 먼저 말을 걸 방법은 없습니다.
   *
   * ** 서버가 준 값을 처음 값으로 삼고, 그 뒤로는 30초마다 물어봅니다.
   *   실시간이 아니어도 됩니다. 1분 안에만 뜨면 되는 숫자입니다.
   *
   * * 화면 뒤에 있으면 부르지 않습니다. 열어만 두고 다른 일을 할 때
   *   요청이 나가면 낭비입니다. 다시 앞으로 오면 즉시 한 번 부릅니다.
   *
   * * 실패하면 이전 숫자를 그대로 둡니다. 0 으로 뭉개지 않습니다.
   *   잠깐 인터넷이 끊겼다고 "할 일 없음" 으로 보이면 안 됩니다.
   */
  const [counts, setCounts] = useState<Record<string, number>>({
    pendingPayment: pendingCount,
    needsCheck: needsCheckCount,
    unshipped: unshippedCount,
    cancelRequested: cancelRequestedCount,
    inquiries: pendingInquiryCount,
    reviews: unrepliedReviewCount,
  });

  /** 방금 늘어난 뱃지 — 잠깐 깜빡입니다. */
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});
  /** 늘어났는데 아직 그 메뉴를 안 눌러 본 것 — 점(●)이 남습니다. */
  const [unseen, setUnseen] = useState<Record<string, boolean>>({});

  /*
   * * 서버가 새 값을 주면(F5·로고 누름 등) 그것을 따릅니다.
   *   서버 쪽은 방금 구운 값이라 우리 것보다 확실합니다.
   */
  useEffect(() => {
    setCounts({
      pendingPayment: pendingCount,
      needsCheck: needsCheckCount,
      unshipped: unshippedCount,
      cancelRequested: cancelRequestedCount,
      inquiries: pendingInquiryCount,
      reviews: unrepliedReviewCount,
    });
  }, [
    pendingCount,
    needsCheckCount,
    unshippedCount,
    cancelRequestedCount,
    pendingInquiryCount,
    unrepliedReviewCount,
  ]);

  /** 이 간격으로 물어봅니다. 이유는 위 설명에 있습니다. */
  const EVERY_MS = 30 * 1000;

  const pullCounts = useCallback(async () => {
    // ** 화면 뒤에 있으면 아예 부르지 않습니다.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    try {
      const response = await fetch('/api/admin/badges', { cache: 'no-store' });
      if (!response.ok) {
        /*
         * * 조용히 넘어가지 않습니다. 401 이면 세션이 끊긴 것이고,
         *   그 상태로 숫자만 멈춰 있으면 원인을 찾을 수 없습니다.
         */
        console.warn(`[admin] 사이드바 숫자를 가져오지 못했습니다: HTTP ${response.status}`);
        return;
      }
      const next = (await response.json()) as Record<string, number>;

      setCounts((prev) => {
        const grown: string[] = [];
        for (const key of Object.keys(next)) {
          if (typeof next[key] !== 'number') continue;
          if (next[key] > (prev[key] ?? 0)) grown.push(key);
        }
        if (grown.length > 0) {
          /*
           * * 늘어났을 때만 표시합니다. 줄어든 것은 우리가 처리해서
           *   줄어든 것이라 놀랄 일이 아닙니다.
           */
          setFlashing((old) => {
            const on = { ...old };
            grown.forEach((key) => (on[key] = true));
            return on;
          });
          setUnseen((old) => {
            const on = { ...old };
            grown.forEach((key) => (on[key] = true));
            return on;
          });
          window.setTimeout(() => {
            setFlashing((old) => {
              const off = { ...old };
              grown.forEach((key) => delete off[key]);
              return off;
            });
          }, 1500);
        }
        return { ...prev, ...next };
      });
    } catch (error) {
      // 네트워크가 잠깐 끊긴 경우입니다. 이전 숫자를 그대로 둡니다.
      console.warn(
        '[admin] 사이드바 숫자를 가져오는 중 오류:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }, []);

  useEffect(() => {
    // 처음 한 번. 이 요청이 관리자 세션도 함께 이어 줍니다.
    void pullCounts();

    const timer = window.setInterval(() => void pullCounts(), EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pullCounts();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pullCounts, EVERY_MS]);

  /*
   * * 뱃지 종류 이름이 곧 counts 의 열쇠입니다.
   *   /api/admin/badges 가 돌려주는 이름과 같아야 합니다.
   *   다르면 숫자가 조용히 0 으로 보입니다.
   */
  const badgeOf = (kind?: Leaf['badge']): number => (kind ? (counts[kind] ?? 0) : 0);

  /*
   * ** 그 메뉴를 한 번 보면 점(●)을 지웁니다. (2026-08-26)
   *   "새로 들어왔다" 는 표시는 확인하면 없어져야 합니다.
   *   안 지우면 표시가 늘 켜져 있어 아무 뜻도 없어집니다.
   *
   * * 활성 판정은 아래 메뉴를 그릴 때와 같은 기준입니다.
   *   기준이 갈라지면 "눌렀는데 점이 안 없어지는" 일이 생깁니다.
   * * 그리는 도중에 상태를 바꾸지 않습니다. 화면을 옮긴 뒤에 정리합니다.
   */
  useEffect(() => {
    const status = searchParams.get('status') ?? '';
    const tab = searchParams.get('tab') ?? '';

    const seen: string[] = [];
    for (const group of MENU) {
      for (const item of group.items ?? []) {
        if (!item.badge) continue;
        const base = basePath(item.href);
        const active = item.status
          ? pathname === base && status === item.status
          : item.tab
            ? pathname === base && tab === item.tab
            : item.exact
              ? pathname === base
              : pathname === base || pathname.startsWith(`${base}/`);
        if (active) seen.push(item.badge);
      }
    }
    if (seen.length === 0) return;

    setUnseen((prev) => {
      if (!seen.some((key) => prev[key])) return prev;
      const next = { ...prev };
      seen.forEach((key) => delete next[key]);
      return next;
    });
  }, [pathname, searchParams]);

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
    flash = false,
    isNew = false,
  }: {
    count: number;
    active: boolean;
    tone?: 'warn' | 'danger';
    /** 방금 늘어났는지 — 1.5초 동안 깜빡입니다. */
    flash?: boolean;
    /** 늘어난 뒤 아직 그 메뉴를 안 눌렀는지 — 점(●)이 남습니다. */
    isNew?: boolean;
  }) =>
    count > 0 ? (
      <span className="flex shrink-0 items-center gap-1">
        <span
          className={`admin-badge ${
            active
              ? 'bg-white text-blue-700'
              : tone === 'danger'
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-800'
          } ${
            /*
             * ** 방금 늘어난 것만 잠깐 깜빡입니다. (2026-08-26)
             *   숫자만 조용히 바뀌면 보고 있어도 모릅니다.
             *   줄어들 때는 안 합니다. 처리해서 줄어든 것은 놀랄 일이 아닙니다.
             * * 소리는 내지 않습니다.
             */
            flash ? 'animate-pulse ring-2 ring-offset-1 ring-red-400' : ''
          }`}
        >
          {count}
        </span>
        {/*
          ** 깜빡임은 그 순간에 보고 있어야 압니다. 자리를 비웠다 오면 못 봅니다.
            그래서 아직 안 본 것에는 점을 남깁니다. 그 메뉴를 한 번 누르면 사라집니다.
          * 색만으로 알리지 않습니다. 읽어 주는 글자를 함께 둡니다.
        */}
        {isNew ? (
          <>
            <span
              aria-hidden="true"
              className={`inline-block h-[6px] w-[6px] rounded-full ${
                active ? 'bg-white' : 'bg-red-500'
              }`}
            />
            <span className="sr-only">새로 들어온 건이 있습니다</span>
          </>
        ) : null}
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
                          flash={Boolean(item.badge && flashing[item.badge])}
                          isNew={Boolean(item.badge && unseen[item.badge])}
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

          ** router.refresh() 와 숫자 다시 가져오기를 함께 부릅니다. (2026-08-26)
            router.refresh() 는 본문과 레이아웃을 서버에서 다시 굽고,
            pullCounts() 는 사이드바 숫자를 곧바로 다시 가져옵니다.
            둘 다 해야 "눌렀더니 전부 새로 그려졌다" 가 됩니다.
            <Link> 만으로는 가운데 본문만 새로 그려지고 이 사이드바는
            그대로입니다. Next.js 가 화면을 옮길 때 레이아웃을 다시 그리지
            않기 때문입니다. 그리고 이미 대시보드에 있으면 같은 주소라
            아무 일도 일어나지 않았습니다.

            아래에 '대시보드' 메뉴가 따로 있으므로, 로고는
            "처음으로 + 전부 새로 그리기" 라는 조금 다른 역할을 갖습니다.
            F5 와 달리 화면이 하얗게 깜빡이지 않습니다.
        */}
        <Link
          href="/admin"
          className="text-[17px] font-semibold hover:underline"
          prefetch={false}
          onClick={() => {
            router.refresh();
            void pullCounts();
          }}
        >
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
            <Link
              href="/admin"
              className="group"
              prefetch={false}
              onClick={() => {
                router.refresh();
                void pullCounts();
              }}
            >
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
