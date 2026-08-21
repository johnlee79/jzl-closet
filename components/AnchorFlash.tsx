'use client';

import { useEffect } from 'react';

/**
 * #앵커로 들어왔을 때 그 자리를 잠깐 밝혀 줍니다.
 *
 * ★ 왜 필요한가
 *   관리자 문구 화면의 [페이지 보기] 는 /order#payment-notice 처럼 자리를 찍어 보냅니다.
 *   그런데 브라우저는 그 자리로 조용히 스크롤만 합니다. 한 페이지에 문구가 여섯 개씩
 *   붙어 있어, 도착해도 "지금 고치는 게 이 문단이 맞나" 를 알 수 없습니다.
 *   잠깐 밝혀 주면 그 한 가지가 해결됩니다.
 *
 * ★★ 첫 로드에서는 우리가 직접 세웁니다.
 *   브라우저는 HTML 을 받자마자 앵커로 스크롤하는데, 그 시점에는 사진과
 *   장바구니 상자가 아직 자리를 잡기 전입니다. 그 뒤에 내용이 채워지면서
 *   목표가 아래로 밀려, 도착해 보면 엉뚱한 자리에 서 있습니다.
 *   실제로 /order#order-steps 로 들어가 보니 목표가 화면 1408px 아래에 있었습니다.
 *   그래서 내용이 자리 잡을 시간을 준 뒤 한 번 더 맞춰 세웁니다.
 * ★ 해시만 바뀔 때(hashchange)는 브라우저가 이미 제대로 세웁니다. 건드리지 않습니다.
 * ★ scrollIntoView 는 scroll-margin-top 을 지켜 주므로 고정 헤더에 가리지 않습니다.
 *
 * ★ 표시는 잠깐만 두고 지웁니다.
 *   계속 남겨 두면 손님이 그 자리를 눌러야 하는 것으로 오해합니다.
 *   실제 손님은 #앵커로 들어올 일이 거의 없지만, 링크를 공유하면 그럴 수 있습니다.
 */

const CLASS = 'anchor-flash';
const DURATION = 2400;

export default function AnchorFlash() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let marked: Element | null = null;

    const clear = () => {
      if (marked) marked.classList.remove(CLASS);
      marked = null;
      if (timer) clearTimeout(timer);
    };

    const flash = (scroll: boolean) => {
      clear();
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      /*
       * ★ decodeURIComponent 로 풉니다. 한글 id 는 쓰지 않지만, 주소창에서
       *   복사해 온 값이 %-인코딩되어 들어올 수 있습니다.
       * ★ getElementById 를 씁니다. querySelector 는 id 가 숫자로 시작하면 던집니다.
       */
      let id = hash;
      try {
        id = decodeURIComponent(hash);
      } catch {
        /* 잘못 인코딩된 값이면 원래 글자를 그대로 씁니다. */
      }

      const target = document.getElementById(id);
      if (!target) return;

      if (scroll) {
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      }

      target.classList.add(CLASS);
      marked = target;
      timer = setTimeout(clear, DURATION);
    };

    /*
     * 처음 들어올 때는 브라우저가 앵커로 스크롤을 끝낸 뒤에 표시합니다.
     * 바로 칠하면 화면 밖에서 켜졌다 꺼져 아무도 못 봅니다.
     */
    const first = setTimeout(() => flash(true), 400);
    const onHashChange = () => flash(false);
    window.addEventListener('hashchange', onHashChange);

    return () => {
      clearTimeout(first);
      window.removeEventListener('hashchange', onHashChange);
      clear();
    };
  }, []);

  return null;
}
