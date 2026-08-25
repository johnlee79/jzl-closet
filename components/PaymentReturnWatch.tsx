'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AUTO_MOVE_WITHIN_MS,
  clearPendingPayment,
  readPendingPayment,
} from '@/lib/pending-payment';

/**
 * ============================================================
 * 결제하고 돌아왔는데 결과 화면을 못 본 손님을 찾아냅니다
 * ============================================================
 *
 * 모바일 결제의 마지막 안전망입니다. (2026-08-25)
 *
 * ★★ 무엇을 잡는가
 *   모바일 결제는 이 순서로 돌아옵니다.
 *     ① 결제창 → 우리 서버(return) → 303 리다이렉트 → 결과 화면
 *     ② ①이 안 되면 손님이 뒤로가기 → /checkout/pay 가 결과 화면으로 보냄
 *     ③ 그것도 안 되면 → 여기
 *
 *   ③이 잡는 것은 앞의 둘이 구조적으로 못 잡는 경우입니다 —
 *   결제창에서 우리 서버로 돌아오는 요청이 **아예 일어나지 않은** 경우.
 *   카드 앱을 다녀오다 브라우저가 페이지를 버리거나, 통신이 끊기거나,
 *   손님이 앱에서 홈으로 나가 버린 경우입니다. 그때는 303 도 스크립트도
 *   실행될 기회가 없습니다. 돈은 빠져나갔는데 손님은 아무것도 못 봅니다.
 *
 * ★★ 그런 손님이 다시 우리 사이트를 열 때, 그 한 번을 붙잡습니다.
 *
 * ★ 폴링이 아닙니다. 표시가 있을 때 딱 한 번 물어봅니다.
 *   표시가 없으면 요청이 0 입니다. (대부분의 방문이 여기입니다)
 *
 * ★ 결제 결과 화면들에서는 아무것도 하지 않습니다.
 *   그 화면들은 이미 자기 상태를 알고 있고, 완료 화면에는 스스로 확인하는
 *   장치가 따로 있습니다. (PaymentStatusRefresh)
 *   표시만 지우고 물러납니다.
 *
 * ★★ 화면을 갑자기 옮기는 것은 3분 안에만 합니다.
 *   그 뒤에는 작은 띠로 알리기만 하고 손님이 누를지 정하게 둡니다.
 *   30분 전에 결제하고 구경하러 들어온 손님의 화면을 낚아채면 안 됩니다.
 *
 * ★ 서버 쪽 그물은 이것과 별개로 이미 돕니다.
 *   card-sweep 크론이 10분마다 결제 Key 로 KSNET 에 다시 물어 주문 상태를
 *   끝냅니다. 이 컴포넌트는 "손님이 그걸 제때 보게 하는" 일만 합니다.
 */

/** 결제 결과를 이미 보여 주는 화면들 — 여기서는 끼어들지 않습니다. */
const RESULT_PATHS = ['/checkout/complete', '/checkout/pending', '/checkout/failed'];

/** 결제창으로 넘어가는 중간 화면 — 아직 결제 중이라 건드리면 안 됩니다. */
const PAY_PATH = '/checkout/pay';

export default function PaymentReturnWatch() {
  const pathname = usePathname();
  const [done, setDone] = useState<{ url: string } | null>(null);

  useEffect(() => {
    /*
     * ★ 결제 결과 화면에 도착했다면 이 안전망은 할 일을 다한 것입니다.
     *   표시를 지웁니다. 안 지우면 다음 방문 때 또 물어봅니다.
     */
    if (RESULT_PATHS.some((path) => pathname?.startsWith(path))) {
      clearPendingPayment();
      setDone(null);
      return;
    }

    // ★ 결제창으로 넘어가는 중입니다. 표시를 지우지도, 묻지도 않습니다.
    if (pathname?.startsWith(PAY_PATH)) return;

    const pending = readPendingPayment();
    if (!pending) return;

    let alive = true;

    const ask = async () => {
      try {
        const query = new URLSearchParams({ no: pending.no, k: pending.k });
        const response = await fetch(`/api/payment/ksnet/status?${query.toString()}`, {
          cache: 'no-store',
        });
        if (!alive) return;

        /*
         * ★ 답을 못 받으면 표시를 남겨 둡니다.
         *   통신이 잠깐 안 될 수도 있고, 그러면 다음 방문에 다시 물어봅니다.
         *   여기서 지워 버리면 그 손님은 영영 이 길을 못 씁니다.
         */
        if (!response.ok) return;

        const data = (await response.json()) as {
          status?: string;
          done?: boolean;
          url?: string | null;
        };
        if (!alive) return;

        // 아직 결제대기면 그대로 둡니다. 다음 방문에 다시 물어봅니다.
        if (!data.done || !data.url) return;

        clearPendingPayment();

        /*
         * ★ 방금 돌아온 경우에만 화면을 옮깁니다.
         *   replace 를 씁니다. 뒤로가기로 이 판단을 다시 밟으면 안 됩니다.
         */
        if (Date.now() - pending.at <= AUTO_MOVE_WITHIN_MS) {
          window.location.replace(data.url);
          return;
        }

        // 시간이 좀 지났으면 띠로만 알립니다.
        setDone({ url: data.url });
      } catch {
        /* 통신이 안 되면 표시를 남겨 두고 다음 방문에 다시 물어봅니다. */
      }
    };

    void ask();

    return () => {
      alive = false;
    };
  }, [pathname]);

  if (!done) return null;

  /*
   * ★ 화면 아래 작은 띠. 지금 보고 있는 것을 가리지 않습니다.
   * ★ 닫기를 둡니다. 표시는 이미 지웠으므로 닫으면 다시 뜨지 않습니다.
   *   손님이 주문 조회로 언제든 다시 볼 수 있습니다.
   */
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone bg-paper px-5 py-4 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="shell flex flex-wrap items-center justify-between gap-3">
        <p className="text-[16px] leading-[1.7] text-ink">
          조금 전 결제가 끝났습니다. 주문 내역을 확인해 주세요.
        </p>
        <div className="flex items-center gap-3">
          <a href={done.url} className="btn-primary">
            주문 확인하기
          </a>
          <button
            type="button"
            onClick={() => setDone(null)}
            className="text-[15px] text-muted underline underline-offset-4"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
