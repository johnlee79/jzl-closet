'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { markPendingPayment } from '@/lib/pending-payment';

/**
 * ============================================================
 * KSNET 결제창 열기
 * ============================================================
 *
 * PC     오버레이 + 아이프레임을 만들고 그 안으로 폼을 POST 합니다.
 * 모바일  같은 폼을 target=_self 로 보내 페이지째 넘어갑니다.
 *
 * ★★ KSNET 의 kspay_web_ssl.js 를 쓰지 않습니다. 이유는
 *   lib/payments/ksnet/config.ts 의 긴 주석에 적어 두었습니다. 요약하면
 *     · 그 스크립트가 document.write 로 jQuery 를 불러오는데,
 *       요즘 브라우저는 비동기 스크립트의 document.write 를 무시합니다.
 *       그래서 $ 가 없어 스크립트가 ReferenceError 로 멈춥니다.
 *     · _pay() 는 문제가 생기면 alert() 을 띄웁니다. 결제 중 모달이 뜨면
 *       그 뒤로 아무것도 진행되지 않습니다.
 *   그 스크립트가 실제로 하는 일(submitI)은 아래 몇 줄이 전부라 직접 합니다.
 *
 * ★ 아이프레임 이름은 반드시 'payment-frame' 이어야 합니다.
 *   KSNET 결제창이 그 이름을 찾습니다. 바꾸지 마세요.
 *
 * ★ 결제 결과는 이 컴포넌트가 만들지 않습니다.
 *   결제창이 우리 서버(sndReply = /api/payment/ksnet/return)로 직접 POST 하고,
 *   그 응답 페이지가 결과 화면 주소를 알려 줍니다.
 *   손님이 결제창의 [닫기] 를 눌러도 같은 주소로 갑니다. (reCnclType=1)
 *
 * ★★ 다만 그 응답은 아이프레임 안에서 그려집니다.
 *   넘어가야 하는 것은 프레임이 아니라 이 바깥 창입니다.
 *   응답 페이지가 top 을 직접 만지려 하지만 그 길이 막히는 경우가 있고,
 *   그러면 손님이 프레임 안 안내 화면에 갇혀 새로고침해야 했습니다.
 *   그래서 응답 페이지가 postMessage 로도 알려 주고, 여기서 받아 우리가 옮깁니다.
 *   길이 둘이면 하나가 막혀도 손님은 결과를 봅니다.
 *
 * ★ 이모지·그림자를 쓰지 않습니다. 아이콘은 SVG 로 직접 그립니다.
 */

/**
 * 결제 흐름을 브라우저 콘솔에 남깁니다.
 *
 * ★★ 결제는 실패해도 다시 눌러 보기 어려운 일입니다.
 *   손님이 중간 화면에 갇혔을 때, 어느 길에서 끊겼는지 나중에 물어볼 수가 없습니다.
 *   그래서 흐름을 그때그때 콘솔에 적어 둡니다. 결제창 안쪽 로그는
 *   '[ksnet] 결제창:' 으로, 바깥 창 로그는 '[ksnet] 바깥창:' 으로 시작합니다.
 *
 * ★ 금액·카드번호·이름은 절대 적지 않습니다. 주소와 상태만 적습니다.
 */
function log(message: string, detail?: unknown) {
  if (detail === undefined) console.log('[ksnet] 바깥창:', message);
  else console.log('[ksnet] 바깥창:', message, detail);
}

export default function KsnetPayLauncher({
  fields,
  action,
  frameName,
  frameWidth,
  frameHeight,
  isMobile,
  orderNo,
  token,
}: {
  /** 서버가 만든 결제창 파라미터. 클라이언트에서 만들지 않습니다. */
  fields: Record<string, string>;
  /** PC·모바일에 맞는 KSNET 주소 (서버가 정합니다) */
  action: string;
  frameName: string;
  frameWidth: number;
  frameHeight: number;
  isMobile: boolean;
  orderNo: string;
  /** 주문 직후 발급한 서명. 상태 확인 창구를 열 때 함께 보냅니다. */
  token: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  /** 두 번 보내지 않게 막습니다. (React 개발 모드는 effect 를 두 번 실행합니다) */
  const sent = useRef(false);
  const [error, setError] = useState('');

  /*
   * ★ 두 길(신호·스스로 확인)이 동시에 결론에 이를 수 있습니다.
   *   먼저 도착한 쪽만 옮기고 나머지는 조용히 물러납니다.
   *   둘 다 replace 를 부르면 뒤로가기 기록이 지저분해집니다.
   */
  const moved = useRef(false);
  const goOnce = (url: string) => {
    if (moved.current) {
      log('이미 옮기는 중이라 무시합니다', url);
      return;
    }
    moved.current = true;
    window.location.replace(url);
  };

  /*
   * 결제창 응답 페이지가 보내는 결과 주소를 받아 이 창을 옮깁니다.
   *
   * ★★ 아무 메시지나 따르면 안 됩니다. 결제창은 다른 도메인이고,
   *   그 안에서 열린 페이지가 우리에게 아무 주소나 보낼 수 있습니다.
   *   그래서 우리 사이트 안쪽 주소만 따릅니다. 열린 리다이렉트를 막습니다.
   */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      // ★ 다른 스크립트가 보내는 메시지도 많이 옵니다. 우리 것만 봅니다.
      if (!data || data.type !== 'ksnet-payment-result') return;

      log('신호를 받았습니다', { 보낸곳: event.origin, 주소: data.url });

      const raw = typeof data.url === 'string' ? data.url : '';
      if (!raw) {
        log('무시합니다 — 주소가 비어 있습니다');
        return;
      }

      let target: URL;
      try {
        target = new URL(raw, window.location.origin);
      } catch {
        log('무시합니다 — 주소 모양이 아닙니다', raw);
        return;
      }
      // ★ 우리 사이트가 아니면 무시합니다.
      if (target.origin !== window.location.origin) {
        log('무시합니다 — 우리 사이트 주소가 아닙니다', {
          받은origin: target.origin,
          우리origin: window.location.origin,
        });
        return;
      }

      log('신호대로 옮겨 갑니다', target.toString());
      goOnce(target.toString());
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /*
   * ============================================================
   * 두 번째 길 — 바깥 창이 스스로 주문 상태를 확인합니다
   * ============================================================
   *
   * ★★ 왜 필요한가
   *   위 신호(postMessage)와 결제창 안에서의 top 이동, 두 길이 다 막히면
   *   손님은 프레임 안 중간 화면에 갇혀 새로고침해야 합니다. 실제로 그랬습니다.
   *   신호 하나에 기대면 브라우저가 그 길을 막을 때마다 같은 일이 반복됩니다.
   *
   * ★ 그래서 몇 초에 한 번 서버에 "이 주문 끝났나요" 를 묻습니다.
   *   신호가 오면 그것으로 먼저 끝나고, 안 오면 이쪽이 곧 같은 결론에 이릅니다.
   *
   * ★ 서명(k)이 있어야 답하는 창구입니다. 주문번호만으로는 열리지 않습니다.
   * ★ 결제창을 여는 순간부터 묻지 않고 조금 기다립니다.
   *   손님이 카드번호를 넣는 동안에는 물어봐야 결과가 없습니다.
   */
  useEffect(() => {
    if (!orderNo || !token) {
      log('스스로 확인하기를 켜지 못했습니다 — 주문번호나 서명이 없습니다');
      return;
    }

    let alive = true;
    let timer: number | undefined;
    const startedAt = Date.now();

    const ask = async () => {
      if (!alive) return;

      /* ★ 15분이 지나면 그만 묻습니다. 결제창도 그쯤이면 닫힙니다. */
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        log('스스로 확인하기를 멈춥니다 — 15분이 지났습니다');
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
          if (data.done && data.url) {
            log('스스로 확인해서 끝난 것을 알았습니다', {
              상태: data.status,
              갈곳: data.url,
            });
            goOnce(data.url);
            return;
          }
        } else {
          log('상태를 물었는데 답을 못 받았습니다', response.status);
        }
      } catch (error) {
        /* 네트워크가 잠깐 끊긴 것일 수 있습니다. 다음 차례에 다시 묻습니다. */
        log('상태를 묻지 못했습니다', String(error));
      }

      timer = window.setTimeout(ask, 3000);
    };

    log('스스로 확인하기를 켭니다 — 5초 뒤부터 3초마다 물어봅니다');
    timer = window.setTimeout(ask, 5000);

    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderNo, token]);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const form = formRef.current;
    if (!form) {
      setError('결제 정보를 준비하지 못했습니다.');
      return;
    }

    /*
     * ── ★★ 안전망 — 모바일은 넘어가기 전에 표시를 남깁니다 (2026-08-25) ──
     *
     * 모바일은 target=_self 라 이 페이지가 통째로 KSNET 으로 넘어갑니다.
     * 그 순간 이 컴포넌트가 사라지고, 위의 "스스로 확인하기" 도 함께 죽습니다.
     * PC 는 아이프레임 뒤에 이 페이지가 살아 있어 계속 물어볼 수 있지만
     * 모바일에는 물어볼 주체 자체가 없어집니다.
     *
     * ★★ 그래서 실시간 대신 "다음에 우리 사이트를 열 때" 확인하게 합니다.
     *   여기에 표시를 남겨 두면, PaymentReturnWatch 가 손님이 다음에 어느
     *   페이지를 열든 그 표시를 보고 딱 한 번 물어봅니다.
     *
     * ★★ 이것이 잡는 것은 다른 길이 못 잡는 경우입니다 —
     *   결제창에서 우리 서버로 돌아오는 요청이 아예 일어나지 않은 경우.
     *   (카드 앱을 다녀오다 브라우저가 페이지를 버리거나, 통신이 끊기거나)
     *   303 도 스크립트도 그때는 실행될 기회조차 없습니다.
     *
     * ★ sessionStorage 가 아니라 localStorage 입니다.
     *   카드 앱을 다녀오면 새 탭이 될 수 있는데 sessionStorage 는 탭마다
     *   따로라 그때 사라집니다.
     * ★ 저장에 실패해도 결제는 그대로 진행합니다. 안전망일 뿐입니다.
     */
    if (isMobile) {
      markPendingPayment(orderNo, token);
    }

    /*
     * ★ 아이프레임은 이 시점에 이미 DOM 에 있습니다.
     *   폼과 같은 렌더에서 그려지고, effect 는 그 뒤에 돕니다.
     *   순서가 어긋나면 target 이름을 못 찾아 새 창이 열립니다.
     */
    try {
      log('결제창을 엽니다', { 주문번호: orderNo, 모바일인가: isMobile });
      form.submit();
    } catch (cause) {
      console.error('[ksnet] 바깥창: 결제창 열기 실패:', cause);
      setError('결제창을 여는 중 문제가 생겼습니다.');
    }
  }, []);

  return (
    <div className="shell py-16 md:py-20">
      {/*
        결제창에 넘기는 값. 화면에는 보이지 않습니다.
        ★ accept-charset="euc-kr" 이 반드시 있어야 합니다.
          KSNET 은 EUC-KR 을 기대합니다. 없으면 상품명·주문자명 한글이 깨집니다.
      */}
      <form
        ref={formRef}
        name="payForm"
        method="post"
        action={action}
        acceptCharset="euc-kr"
        target={isMobile ? '_self' : frameName}
      >
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} readOnly />
        ))}
      </form>

      {/* ── PC — 오버레이 + 결제창 ─────────────────────── */}
      {!isMobile && !error ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="카드 결제창"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-auto bg-ink/70 p-4"
        >
          <iframe
            id={frameName}
            name={frameName}
            title="카드 결제창"
            src="about:blank"
            width={frameWidth}
            height={frameHeight}
            /*
              ★ 화면이 작은 노트북에서 잘리지 않게 상한을 둡니다.
                결제창은 우리와 다른 도메인이라 스스로 높이를 못 바꿉니다.
                (main.js 의 update_iframe_height 가 교차 출처에 막힙니다)
                그래서 안에서 스크롤할 수 있게 scrolling 을 막지 않습니다.
            */
            className="w-full max-w-[822px] bg-paper"
            style={{ height: `min(${frameHeight}px, calc(100vh - 7rem))` }}
          />

          {/*
            ★ 빠져나갈 길을 반드시 둡니다.
              결제창이 안 뜨거나 멈추면 손님이 검은 화면에 갇힙니다.
              주문은 결제대기로 저장되어 있어 돌아가도 잃는 것이 없습니다.
          */}
          {/*
            ★ 뒤에 깔린 페이지 글자와 겹쳐 읽기 어려워지지 않도록
              이 링크에는 제 배경을 줍니다. 빠져나갈 길은 항상 또렷해야 합니다.
          */}
          <Link
            href="/checkout"
            className="mt-4 bg-ink px-5 py-3 text-[15px] text-paper underline underline-offset-4"
          >
            결제를 그만두고 주문서로 돌아가기
          </Link>
        </div>
      ) : null}

      {/* ── 안내 · 오류 ────────────────────────────────── */}
      <div className="max-w-[520px]">
        <p className="label-xs">PAYMENT</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[32px]">
          {error ? '결제창을 열지 못했습니다' : '결제창을 여는 중입니다'}
        </h1>

        {error ? (
          <>
            <p className="mt-5 text-[17px] leading-[1.9] text-ink">{error}</p>
            <p className="mt-3 text-[16px] leading-[1.9] text-muted">
              주문번호 {orderNo} 는 결제대기 상태로 저장되어 있습니다. 아직 결제되지
              않았으니 안심하셔도 됩니다. 다시 시도하시거나 고객센터로 연락해 주세요.
            </p>
            <div className="btn-row mt-8">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-primary"
              >
                다시 시도
              </button>
              <Link href="/order" className="btn-secondary">
                장바구니로
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-5 text-[17px] leading-[1.9] text-ink">
              잠시만 기다려 주세요. 결제창이 자동으로 열립니다.
            </p>
            <p className="mt-3 text-[16px] leading-[1.9] text-muted">
              결제가 끝나기 전에는 이 화면을 닫지 마세요.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
