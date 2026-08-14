'use client';

import { useEffect, useState } from 'react';

/**
 * 상품 상세의 탭 4개.
 *
 * ★ 스크롤로 옮겨 다니지 않고 내용을 바꿔 끼웁니다.
 * ★ 네 판을 모두 HTML 로 심어 두고 보이지 않는 쪽만 감춥니다.
 *   검색엔진이 리뷰·판매정보까지 그대로 읽어 갈 수 있어야 하기 때문입니다.
 *   (SEO 가 이 프로젝트의 최우선 목표라 지연 로딩을 쓰지 않았습니다)
 * ★ 주소는 useSearchParams 대신 history.replaceState 로 바꿉니다.
 *   useSearchParams 를 쓰면 이 페이지가 정적 생성에서 빠집니다.
 */

const TAB_KEYS = ['info', 'review', 'qna', 'sales'] as const;

export type TabKey = (typeof TAB_KEYS)[number];

function isTab(value: string | null): value is TabKey {
  return Boolean(value && (TAB_KEYS as readonly string[]).includes(value));
}

export default function ProductTabs({
  reviewCount,
  qnaCount,
  info,
  review,
  qna,
  sales,
}: {
  reviewCount: number;
  qnaCount: number;
  info: React.ReactNode;
  review: React.ReactNode;
  qna: React.ReactNode;
  sales: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>('info');

  // 새로고침·뒤로가기에서도 보던 탭이 유지되도록 주소를 읽습니다.
  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.search).get('tab');
      setTab(isTab(value) ? value : 'info');
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const select = (next: TabKey) => {
    setTab(next);

    const url = new URL(window.location.href);
    if (next === 'info') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', next);
    }
    // 뒤로가기로 돌아올 수 있도록 기록을 남깁니다. 화면은 그대로 두고 주소만 바꿉니다.
    window.history.pushState({}, '', url);
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'info', label: '상품정보' },
    { key: 'review', label: '리뷰', count: reviewCount },
    { key: 'qna', label: 'Q&A', count: qnaCount },
    { key: 'sales', label: '판매정보' },
  ];

  return (
    <div className="mt-16 border-t border-stone md:mt-20">
      {/* ── 탭 바 — 스크롤해도 위에 붙어 있습니다 ───────── */}
      <div
        role="tablist"
        aria-label="상품 상세 정보"
        className="sticky top-0 z-30 grid grid-cols-4 border-b border-stone bg-paper"
      >
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`tab-${item.key}`}
              aria-selected={active}
              aria-controls={`panel-${item.key}`}
              onClick={() => select(item.key)}
              className={`-mb-px min-h-[52px] border-b-2 px-1 py-3 text-[13px] tracking-[0.06em] transition-colors md:text-[15px] md:tracking-[0.1em] ${
                active
                  ? 'border-ink font-medium text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {item.label}
              {item.count !== undefined ? (
                <span className={`ml-1 tabular-nums ${active ? 'text-ink' : 'text-muted'}`}>
                  ({item.count})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ── 내용 ─────────────────────────────────────────
       * hidden 으로 감추기만 하고 HTML 에서 빼지 않습니다.
       * 검색엔진은 감춰진 내용도 읽습니다. */}
      <div
        role="tabpanel"
        id="panel-info"
        aria-labelledby="tab-info"
        hidden={tab !== 'info'}
      >
        {info}
      </div>
      <div
        role="tabpanel"
        id="panel-review"
        aria-labelledby="tab-review"
        hidden={tab !== 'review'}
      >
        {review}
      </div>
      <div
        role="tabpanel"
        id="panel-qna"
        aria-labelledby="tab-qna"
        hidden={tab !== 'qna'}
      >
        {qna}
      </div>
      <div
        role="tabpanel"
        id="panel-sales"
        aria-labelledby="tab-sales"
        hidden={tab !== 'sales'}
      >
        {sales}
      </div>
    </div>
  );
}
