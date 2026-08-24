'use client';

import { useEffect, useState } from 'react';

/**
 * ============================================================
 * 로그인 상태 — 한 번만 묻고 화면 전체가 같이 씁니다
 * ============================================================
 *
 * ★★ 왜 만들었는가 · 하나 — 틀린 상태를 잠깐 보여 주고 있었습니다.
 *   화면마다 "일단 비회원" 이라고 정해 놓고 그린 다음, 답이 오면 회원으로
 *   고쳤습니다. 그 사이가 눈에 보입니다. 로그인한 분이 장바구니에서
 *   "가입하고 3,000P 받기" 배지를 봤다가 사라지고, 상품 상세에서는
 *   버튼이 "비회원 구매" 였다가 "바로 구매" 로 바뀝니다.
 *
 *   그래서 상태를 셋으로 둡니다 — 아직 모름(null) · 회원 · 비회원.
 *   예전에는 회원·비회원 둘뿐이라 "모름" 을 나타낼 방법이 없었습니다.
 *   모르는 동안에는 화면이 그 자리에 아무것도 그리지 않습니다.
 *
 * ★★ 왜 만들었는가 · 둘 — 같은 질문을 다섯 번 하고 있었습니다.
 *   상품 상세 한 장을 열면 헤더 · 연락처 안내 띠 · 상품 담기 버튼 ·
 *   상품 문의 · 포인트 팝업이 각자 /api/auth/me 를 따로 불렀습니다.
 *   같은 답인데 다섯 번입니다. 게다가 다섯이 서로 다른 순간에 답을 받아
 *   화면이 여러 번 움찔거렸습니다.
 *
 *   이제 여기서 한 번만 묻고 결과를 나눠 씁니다. 동시에 여러 곳이 물어도
 *   요청은 하나로 합쳐집니다.
 *
 * ★★ 왜 서버에서 내려보내지 않는가
 *   레이아웃에서 쿠키를 읽으면 프론트 전 페이지가 동적 렌더링으로 바뀌어
 *   상품·분류 페이지의 정적 생성이 깨집니다. 이 사이트는 SEO 가 최우선이라
 *   그 구조는 건드리지 않습니다.
 */

export type MemberInfo = {
  loggedIn: boolean;
  /** 로그인한 분의 표시 이름. 비회원이면 빈 문자열입니다. */
  name: string;
  /** 구글 로그인은 연락처를 주지 않습니다. 주문에 필요해서 따로 받습니다. */
  needsPhone: boolean;
  pointBalance: number;
  pointExpiringSoon: number;
  pointMinUse: number;
  pointUseUnit: number;
  pointPopupEnabled: boolean;
  pointPopupIntervalHours: number;
};

/**
 * 확인하지 못했을 때의 값.
 *
 * ★ 서버가 답을 못 주면 비회원으로 봅니다. 이쪽이 안전합니다.
 *   회원으로 잘못 보면 "회원 정보로 미리 채웠습니다" 같은 말이 나가고,
 *   비회원으로 잘못 보면 가입을 한 번 더 권할 뿐입니다.
 */
const GUEST: MemberInfo = {
  loggedIn: false,
  name: '',
  needsPhone: false,
  pointBalance: 0,
  pointExpiringSoon: 0,
  pointMinUse: 0,
  pointUseUnit: 1,
  pointPopupEnabled: false,
  pointPopupIntervalHours: 1,
};

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(raw: unknown): MemberInfo {
  const data = (raw ?? {}) as Record<string, unknown>;
  const loggedIn = data.loggedIn === true;

  return {
    loggedIn,
    name: typeof data.name === 'string' ? data.name : '',
    needsPhone: data.needsPhone === true,
    pointBalance: num(data.pointBalance, 0),
    pointExpiringSoon: num(data.pointExpiringSoon, 0),
    pointMinUse: num(data.pointMinUse, 0),
    // ★ 0 은 단위로 쓸 수 없습니다. 0 으로 나누면 계산이 무너집니다.
    pointUseUnit: Math.max(1, num(data.pointUseUnit, 1)),
    pointPopupEnabled: data.pointPopupEnabled === true,
    pointPopupIntervalHours: Math.max(1, num(data.pointPopupIntervalHours, 1)),
  };
}

/*
 * ★★ 아래 값들은 브라우저에서만 씁니다.
 *   서버에서도 이 파일이 읽히지만(클라이언트 컴포넌트도 서버에서 한 번 그려집니다),
 *   서버에서는 절대 채우지 않습니다. 서버 프로세스는 손님 여럿이 함께 쓰므로
 *   한 사람의 로그인 상태가 남으면 다음 손님에게 그대로 새어 나갑니다.
 */

/** 마지막으로 확인한 답. null 이면 아직 모릅니다. */
let cache: MemberInfo | null = null;
/** 지금 물어보는 중인 요청. 동시에 여러 곳이 불러도 하나로 합칩니다. */
let inFlight: Promise<MemberInfo> | null = null;
/** 답이 바뀌면 알려 줄 화면들 */
const listeners = new Set<() => void>();

function publish(next: MemberInfo): void {
  cache = next;
  listeners.forEach((notify) => notify());
}

/**
 * 서버에 물어봅니다.
 *
 * ★ 이미 물어보는 중이면 그 요청을 같이 기다립니다. 두 번 묻지 않습니다.
 * ★ 다시 물어보는 동안에도 이전 답을 그대로 들고 있습니다.
 *   중간에 "모름" 으로 되돌리면 화면이 한 번 비었다가 다시 그려집니다.
 *   그건 지금 고치려는 깜빡임과 똑같은 현상입니다.
 */
function load(): Promise<MemberInfo> {
  if (typeof window === 'undefined') return Promise.resolve(GUEST);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let next = GUEST;
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (response.ok) next = normalize(await response.json());
    } catch {
      /* 통신이 끊겼습니다. 비회원으로 봅니다. */
    }
    inFlight = null;
    publish(next);
    return next;
  })();

  return inFlight;
}

/**
 * 다시 물어봅니다. 화면을 옮겼을 때·회원 정보를 고쳤을 때 부릅니다.
 *
 * ★ 이전 답은 그대로 두고 조용히 갱신합니다.
 */
export function refreshMember(): void {
  void load();
}

/**
 * 로그아웃한 순간 바로 비회원으로 바꿉니다.
 *
 * ★★ 서버에 다시 물어볼 때까지 기다리면 안 됩니다.
 *   그 사이에 마이페이지 버튼과 이름이 그대로 남아 있어,
 *   로그아웃을 눌렀는데 아무 일도 안 일어난 것처럼 보입니다.
 */
export function clearMember(): void {
  publish(GUEST);
}

/**
 * 로그인 상태를 읽습니다.
 *
 * @returns null 이면 아직 모릅니다. 그동안에는 아무것도 그리지 마세요.
 *          비회원용 화면을 먼저 그렸다가 지우면 그게 깜빡임입니다.
 */
export function useMember(): MemberInfo | null {
  /*
   * ★ 서버에서 그릴 때는 언제나 null 입니다.
   *   서버에 남은 값을 쓰면 다른 손님의 상태가 새어 나갑니다.
   */
  const [value, setValue] = useState<MemberInfo | null>(null);

  useEffect(() => {
    const notify = () => setValue(cache);
    listeners.add(notify);

    // 이미 답을 받아 둔 게 있으면 그것부터 씁니다. 화면을 옮겨도 깜빡이지 않습니다.
    if (cache) setValue(cache);
    void load();

    return () => {
      listeners.delete(notify);
    };
  }, []);

  return value;
}
