'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

/**
 * ============================================================
 * ★★ 관리자 로그인이 쓰는 동안 안 끊기게 합니다 (2026-08-26)
 * ============================================================
 *
 * ★★ 무엇이 문제였나
 *   상품 등록 화면에 한 시간 넘게 머물다 [저장]을 누르면 로그아웃됐습니다.
 *   그 사이 아무 요청도 안 나가서 액세스 토큰이 만료된 채 방치되고,
 *   [저장]을 누르는 순간 만료된 토큰으로 처음 말을 걸기 때문입니다.
 *
 *   손님 화면에는 MemberSync 가 같은 일을 하고 있었습니다.
 *   관리자 화면에만 없었습니다.
 *
 * ★★ 만료를 없애는 것이 아닙니다.
 *   관리자 화면에는 손님 이름·전화번호·주소가 있습니다. 공용 PC 에
 *   로그인한 것이 영원히 살아 있으면 안 됩니다.
 *   **쓰고 있는 동안에는 안 끊기고, 오래 안 쓰면 끊기는** 쪽입니다.
 *   창을 닫거나 다른 일을 하면 이 장치도 같이 멈춥니다.
 *
 * ★★ 얼마나 자주 부르는가 — 30분입니다. 그 이유입니다.
 *   Supabase 액세스 토큰의 기본 수명은 1시간입니다. 만료되기 한참 전에
 *   한 번 갱신하면 충분합니다. 30분이면 늦어도 만료 30분 전에 갱신됩니다.
 *   창 하나당 **한 시간에 두 번**입니다. 서버에 부담이 없습니다.
 *
 *   더 자주 부를 이유가 없습니다. Supabase 리프레시 토큰은 쓸 때마다
 *   새 것으로 바뀌므로, 자주 부를수록 그 교체가 어긋날 기회만 늘어납니다.
 *
 * ★ 화면을 옮길 때와 탭으로 돌아올 때도 부릅니다.
 *   그때는 어차피 사람이 뭔가 하고 있는 순간이라 자연스럽습니다.
 *   ★ 다만 1분 안에 두 번은 부르지 않습니다. 메뉴를 빠르게 여러 번 누르면
 *     그때마다 나가는 것을 막습니다.
 *
 * ★ 답을 보지 않습니다. 실패해도 화면은 아무 영향이 없습니다.
 *   실패 이유는 서버 쪽(app/api/admin/session/route.ts)이 로그로 남깁니다.
 *
 * ★ 아무것도 그리지 않습니다.
 */

/** 이 간격으로 조용히 갱신합니다. (액세스 토큰 기본 수명 1시간의 절반) */
const EVERY_MS = 30 * 60 * 1000;

/** 이 시간 안에는 두 번 부르지 않습니다. */
const MIN_GAP_MS = 60 * 1000;

export default function AdminSessionKeeper() {
  const pathname = usePathname();
  const lastAt = useRef(0);

  const touch = useCallback(() => {
    const now = Date.now();
    if (now - lastAt.current < MIN_GAP_MS) return;
    lastAt.current = now;
    void fetch('/api/admin/session', { cache: 'no-store' }).catch(() => undefined);
  }, []);

  // 화면을 옮길 때
  useEffect(() => {
    touch();
  }, [pathname, touch]);

  // 30분마다
  useEffect(() => {
    const timer = window.setInterval(touch, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [touch]);

  // 다른 일을 하다 이 탭으로 돌아왔을 때
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') touch();
    };
    window.addEventListener('visibilitychange', onVisible);
    return () => window.removeEventListener('visibilitychange', onVisible);
  }, [touch]);

  return null;
}
