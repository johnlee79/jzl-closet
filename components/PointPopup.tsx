'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NOTICE_POPUP_EVENT, readNoticePopupCount } from '@/lib/popup-order';

/**
 * 보유 포인트 알림 팝업.
 *
 * ★ 포인트를 주는 것이 아니라 "얼마 있는지" 를 알려 주기만 합니다.
 * ★ 로그인한 회원에게만, 잔액이 0보다 클 때만 뜹니다.
 * ★ 마지막으로 본 시각을 브라우저에 저장해 설정한 간격(기본 1시간) 안에는 다시 띄우지 않습니다.
 * ★ DB 조회를 추가하지 않습니다. 헤더가 이미 부르는 /api/auth/me 응답을 그대로 씁니다.
 * ★ 공지·이벤트 팝업이 떠 있으면 이번에는 뜨지 않습니다. (공지 팝업 우선)
 */

const STORAGE_KEY = 'jzl-point-popup-at';

type Me = {
  loggedIn?: boolean;
  pointBalance?: number;
  pointExpiringSoon?: number;
  pointMinUse?: number;
  pointPopupEnabled?: boolean;
  pointPopupIntervalHours?: number;
};

function shownRecently(hours: number): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const last = Number(raw);
    if (!Number.isFinite(last)) return false;
    return Date.now() - last < hours * 60 * 60 * 1000;
  } catch {
    // 사생활 보호 모드 등에서 localStorage 가 막히면 그냥 띄웁니다.
    return false;
  }
}

function stamp(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* 저장하지 못해도 화면은 그대로 동작합니다. */
  }
}

function won(value: number): string {
  return value.toLocaleString('ko-KR');
}

export default function PointPopup() {
  const [me, setMe] = useState<Me | null>(null);
  /** 공지 팝업이 몇 개 떠 있는지. null 이면 아직 모릅니다. */
  const [noticeCount, setNoticeCount] = useState<number | null>(readNoticePopupCount());
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Me | null) => {
        if (alive && data) setMe(data);
      })
      .catch(() => {
        /* 실패하면 팝업을 띄우지 않습니다. */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ count: number }>).detail;
      setNoticeCount(detail?.count ?? 0);
    };
    window.addEventListener(NOTICE_POPUP_EVENT, handle);

    // 이 페이지에 공지 팝업 자체가 없으면 아무도 알려 주지 않습니다.
    // 잠깐 기다렸다가 소식이 없으면 0으로 봅니다.
    const timer = window.setTimeout(() => {
      setNoticeCount((prev) => (prev === null ? 0 : prev));
    }, 700);

    return () => {
      window.removeEventListener(NOTICE_POPUP_EVENT, handle);
      window.clearTimeout(timer);
    };
  }, []);

  const balance = me?.pointBalance ?? 0;
  const ready =
    !closed &&
    me !== null &&
    me.loggedIn === true &&
    me.pointPopupEnabled !== false &&
    balance > 0 &&
    noticeCount === 0 &&
    !shownRecently(me.pointPopupIntervalHours ?? 1);

  // 실제로 보여 준 순간에만 시각을 기록합니다.
  useEffect(() => {
    if (ready) stamp();
  }, [ready]);

  if (!ready || !me) return null;

  const expiring = me.pointExpiringSoon ?? 0;
  const minUse = me.pointMinUse ?? 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center p-4 md:items-center">
      <div className="pointer-events-auto w-full max-w-[360px] border border-stone bg-paper">
        <div className="p-6 text-center">
          <p className="text-[13px] tracking-[0.14em] text-muted">회원님의 보유 포인트</p>
          <p className="mt-4 font-display text-[40px] leading-none text-ink">
            {won(balance)}
            <span className="ml-1 font-sans text-[18px]">P</span>
          </p>

          {expiring > 0 ? (
            <p className="mt-4 text-[14px] leading-relaxed text-wine">
              30일 내 소멸 예정 {won(expiring)} P
            </p>
          ) : null}

          {minUse > 0 ? (
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {won(minUse)}P 이상부터 사용하실 수 있습니다.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 border-t border-stone">
          <Link
            href="/products"
            onClick={() => setClosed(true)}
            className="flex min-h-[48px] items-center justify-center border-r border-stone text-[14px] tracking-[0.1em] text-ink"
          >
            쇼핑하러 가기
          </Link>
          <button
            type="button"
            onClick={() => setClosed(true)}
            className="flex min-h-[48px] items-center justify-center text-[14px] tracking-[0.1em] text-muted"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
