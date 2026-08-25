'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ============================================================
 * 결제 결과를 스스로 물어보고, 바뀌면 화면을 다시 그립니다
 * ============================================================
 *
 * 완료 화면(/checkout/complete)이 아직 '결제대기' 인 채로 열렸을 때만 돕니다.
 *
 * ★★ 왜 필요한가 (실제로 겪은 일)
 *   손님이 결제창에서 승인을 마치면 그 창이 닫히고 우리 완료 화면으로 넘어옵니다.
 *   그런데 넘어온 시점에 우리 서버는 아직 KSNET 승인 확인을 끝내지 못했을 수
 *   있습니다. 그러면 화면이 "결제 결과를 불러오는 중입니다" 로 그려지고,
 *   진행 단계 네 칸도 전부 흐린 채로 굳습니다.
 *   손님이 손으로 새로고침해야 "결제가 완료되었습니다" 가 나옵니다.
 *
 *   승인은 이미 났는데 손님은 안 된 줄 압니다. 그대로 다시 결제하면 이중결제입니다.
 *
 * ★★ 예전 방식이 왜 못 잡았나 — 세 가지가 겹쳐 있었습니다.
 *
 *   1) 첫 확인이 2초 뒤였습니다. 열자마자 한 번 보지 않았습니다.
 *      그 2초 사이에 이미 결제완료가 되어 있는 경우가 대부분입니다.
 *
 *   2) 세 번(2초·4초·8초) 하고 멈췄습니다. 14초가 지나면 영영 그대로입니다.
 *
 *   3) 가장 큰 문제 — useEffect 에 의존성 배열이 없어서, 다음 확인을 걸어 두는
 *      일이 "이 컴포넌트가 다시 그려질 때" 에만 일어났습니다.
 *      router.refresh() 를 불러도 서버가 돌려주는 내용이 그대로면 React 가
 *      이 컴포넌트를 다시 그리지 않고 넘어갑니다. 그러면 다음 확인이 걸리지
 *      않아서 첫 한 번으로 끝납니다. 겉보기에는 아무 일도 안 하는 것처럼 보입니다.
 *
 *   그리고 셋 다와 별개로, 예전 방식은 주문 상태를 직접 물어보지 않고
 *   화면을 통째로 다시 그리기만 했습니다. 그래서 "아직 결제대기" 인지
 *   "물어보지도 못했는지" 를 구분할 수 없었습니다.
 *
 * ★ 이제는 상태 창구(/api/payment/ksnet/status)에 직접 묻습니다.
 *   열자마자 한 번, 그다음 2초마다. 결론이 나면 그 화면으로 넘어갑니다.
 *
 * ★★ 새로고침은 딱 한 번만 합니다.
 *   창구가 "끝났다" 는데 화면이 계속 결제대기로 그려지면 무한히 새로고침하게
 *   됩니다. 결제 화면에서 그런 일이 나면 손님이 아무것도 할 수 없습니다.
 *   그래서 이 주문으로 한 번 새로고침했다는 표시를 남기고, 두 번은 안 합니다.
 *
 * ★ 2분이 지나면 그만 묻고 주문 조회로 안내합니다.
 *   그쯤이면 사람이 봐야 하는 상황입니다.
 */

/**
 * 얼마나 자주 물어보는지.
 *
 * ★★ 처음 몇 번을 빠르게 합니다. (2026-08-25)
 *   전에는 처음부터 끝까지 2초 간격이라, 승인이 이미 끝나 있어도
 *   손님은 최소 2초를 기다렸습니다. 실제로 2~3초가 보였습니다.
 *
 *   승인 확인은 대개 1~2초면 끝납니다. 그 언저리를 촘촘히 훑고,
 *   그때도 안 끝났으면 사람이 봐야 하는 쪽에 가까우므로 간격을 늘립니다.
 *   빠르게 묻는 것은 앞의 세 번뿐이라 서버에 부담이 없습니다.
 *
 * ★ 상태 확인 창구의 제한은 1분에 120회입니다. (status/route.ts)
 *   이 차례대로면 2분 동안 60번쯤이라 넉넉히 들어갑니다.
 */
const FIRST_INTERVALS_MS = [400, 800, 1500];
const INTERVAL_MS = 2000;

/** 몇 번째 확인인지에 따른 다음 간격 */
function nextDelay(attempt: number): number {
  return FIRST_INTERVALS_MS[attempt] ?? INTERVAL_MS;
}
/** 이 시간이 지나면 그만 묻습니다. */
const GIVE_UP_MS = 2 * 60 * 1000;

/** 이 주문으로 이미 한 번 새로고침했는지 — 무한 새로고침을 막습니다. */
function reloadKey(orderNo: string): string {
  return `jzl-pay-reloaded:${orderNo}`;
}

function alreadyReloaded(orderNo: string): boolean {
  try {
    return window.sessionStorage.getItem(reloadKey(orderNo)) === '1';
  } catch {
    // 저장소를 못 쓰면 안전한 쪽(이미 했다)으로 봅니다. 무한 새로고침보다 낫습니다.
    return true;
  }
}

function markReloaded(orderNo: string): void {
  try {
    window.sessionStorage.setItem(reloadKey(orderNo), '1');
  } catch {
    /* 저장하지 못해도 이번 화면은 그대로 동작합니다. */
  }
}

function log(message: string, detail?: unknown) {
  if (detail === undefined) console.log('[ksnet] 완료화면:', message);
  else console.log('[ksnet] 완료화면:', message, detail);
}

export default function PaymentStatusRefresh({
  orderNo,
  token,
}: {
  orderNo: string;
  /** 주문 직후 발급한 서명. 지금 이 화면의 주소에 들어 있는 그 값입니다. */
  token: string;
}) {
  const [phase, setPhase] = useState<'checking' | 'gaveUp'>('checking');
  /** 두 번 넘어가지 않게 막습니다. */
  const moved = useRef(false);

  useEffect(() => {
    if (!orderNo || !token) {
      log('스스로 확인하기를 켜지 못했습니다 — 주문번호나 서명이 없습니다');
      setPhase('gaveUp');
      return;
    }

    let alive = true;
    let timer: number | undefined;
    /** 몇 번 물어봤는지 — 앞의 몇 번을 더 빠르게 하려고 셉니다. */
    let attempt = 0;
    const startedAt = Date.now();

    /**
     * 결론이 났을 때.
     *
     * ★ 창구가 알려 준 주소로 넘어갑니다. 결제완료면 완료 화면,
     *   확인이 필요한 상태면 확인 화면, 실패면 실패 화면입니다.
     *   화면 안에서 글자만 바꾸지 않고 주소째 넘어가는 이유는,
     *   진행 단계·영수증까지 서버가 새 상태로 다시 그려야 하기 때문입니다.
     */
    const goTo = (url: string | null) => {
      if (moved.current) return;
      moved.current = true;

      if (alreadyReloaded(orderNo)) {
        /*
         * ★ 이미 한 번 새로고침했는데 또 여기까지 왔습니다.
         *   창구는 끝났다는데 화면은 결제대기로 그려지는 상태입니다.
         *   더 새로고침해 봐야 같은 일이 반복되므로 멈추고 안내합니다.
         */
        log('이미 한 번 새로 열었는데 그대로입니다 — 더 반복하지 않습니다');
        setPhase('gaveUp');
        return;
      }

      markReloaded(orderNo);
      log('결론이 났습니다 — 화면을 새로 엽니다', url ?? '(현재 주소)');

      /*
       * ★ replace 를 씁니다. push 가 아닙니다.
       *   뒤로가기를 눌렀을 때 결제대기 화면으로 돌아가면 안 됩니다.
       */
      if (url) window.location.replace(url);
      else window.location.reload();
    };

    const ask = async () => {
      if (!alive || moved.current) return;

      if (Date.now() - startedAt > GIVE_UP_MS) {
        log('2분이 지났습니다 — 그만 묻습니다');
        setPhase('gaveUp');
        return;
      }

      try {
        const query = new URLSearchParams({ no: orderNo, k: token });
        const response = await fetch(`/api/payment/ksnet/status?${query.toString()}`, {
          cache: 'no-store',
        });

        if (response.ok) {
          const data = (await response.json()) as {
            status?: string;
            done?: boolean;
            url?: string | null;
          };
          if (data.done) {
            goTo(data.url ?? null);
            return;
          }
          log('아직 결제대기입니다', data.status);
        } else {
          log('창구가 답하지 않았습니다', response.status);
        }
      } catch (error) {
        /* 네트워크가 잠깐 끊겼을 수 있습니다. 다음 차례에 다시 묻습니다. */
        log('물어보지 못했습니다', String(error));
      }

      timer = window.setTimeout(ask, nextDelay(attempt));
      attempt += 1;
    };

    /*
     * ★★ 기다리지 않고 곧바로 한 번 묻습니다.
     *   승인 확인은 대개 1~2초면 끝나므로, 이 화면이 열린 시점에 이미
     *   결제완료가 되어 있는 경우가 가장 흔합니다.
     */
    log('결제 결과를 확인합니다 — 지금 한 번, 그다음 2초마다', orderNo);
    void ask();

    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderNo, token]);

  return (
    <p className="mt-3 text-[15px] leading-relaxed text-muted">
      {phase === 'checking'
        ? '결제 결과를 확인하는 중입니다. 잠시만 기다려 주세요. 이 화면은 자동으로 바뀝니다.'
        : '확인이 조금 더 걸리고 있습니다. 결제하신 것이 맞다면 주문 조회에서 확인해 주세요. 다시 결제하지 마세요.'}
    </p>
  );
}
