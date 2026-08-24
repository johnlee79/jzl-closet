'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMember } from '@/lib/member';
import { NOTICE_POPUP_EVENT, readNoticePopupCount } from '@/lib/popup-order';

/**
 * 보유 포인트 알림 팝업.
 *
 * ★ 포인트를 주는 것이 아니라 "얼마 있는지" 를 알려 주기만 합니다.
 * ★ 로그인한 회원에게만, 잔액이 0보다 클 때만 뜹니다.
 * ★ 마지막으로 본 시각을 브라우저에 저장해 설정한 간격(기본 1시간) 안에는 다시 띄우지 않습니다.
 * ★ DB 조회를 추가하지 않습니다. 화면 전체가 함께 쓰는 로그인 상태(lib/member.ts)를
 *   그대로 읽습니다. 보유 포인트도 그 답에 함께 실려 옵니다.
 * ★ 공지·이벤트 팝업이 떠 있으면 이번에는 뜨지 않습니다. (공지 팝업 우선)
 */

const STORAGE_KEY = 'jzl-point-popup-at';

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
  /*
   * ★ 로그인 상태는 헤더·상품 화면과 같은 답을 씁니다. (lib/member.ts)
   *   예전에는 이 팝업이 /api/auth/me 를 따로 불렀습니다. 한 화면에서
   *   같은 질문이 다섯 번 나가던 것 중 하나였습니다.
   * ★ null 이면 아직 모릅니다. 모르는 동안에는 뜨지 않습니다.
   */
  const me = useMember();
  /** 공지 팝업이 몇 개 떠 있는지. null 이면 아직 모릅니다. */
  const [noticeCount, setNoticeCount] = useState<number | null>(readNoticePopupCount());
  const [closed, setClosed] = useState(false);

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
    me.loggedIn &&
    me.pointPopupEnabled &&
    balance > 0 &&
    noticeCount === 0 &&
    !shownRecently(me.pointPopupIntervalHours);

  // 실제로 보여 준 순간에만 시각을 기록합니다.
  useEffect(() => {
    if (ready) stamp();
  }, [ready]);

  if (!ready || !me) return null;

  const { pointExpiringSoon: expiring, pointMinUse: minUse, pointUseUnit: useUnit } = me;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center p-4 md:items-center">
      <div className="pointer-events-auto w-full max-w-[360px] border border-stone bg-paper">
        <div className="p-6 text-center">
          <p className="text-[14px] tracking-[0.14em] text-muted">회원님의 보유 포인트</p>
          <p className="mt-4 text-[40px] font-semibold leading-none tabular-nums text-ink">
            {won(balance)}
            <span className="ml-1 font-sans text-[19px]">P</span>
          </p>

          {expiring > 0 ? (
            <p className="mt-4 text-[15px] leading-relaxed text-wine">
              30일 내 소멸 예정 {won(expiring)} P
            </p>
          ) : null}

          {minUse > 0 ? (
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              {won(minUse)}P 이상부터 사용하실 수 있습니다.
            </p>
          ) : null}

          {/* ★ 주문서·마이페이지와 같은 말을 합니다. 세 곳이 어긋나면 안 됩니다. */}
          {useUnit > 1 ? (
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              {won(useUnit)}원 단위로 사용하실 수 있습니다.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 border-t border-stone">
          <Link
            href="/products"
            onClick={() => setClosed(true)}
            className="flex min-h-[48px] items-center justify-center border-r border-stone text-[15px] tracking-[0.1em] text-ink"
          >
            쇼핑하러 가기
          </Link>
          <button
            type="button"
            onClick={() => setClosed(true)}
            className="flex min-h-[48px] items-center justify-center text-[15px] tracking-[0.1em] text-muted"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
