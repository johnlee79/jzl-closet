'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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
 * ★ 결제 결과는 이 컴포넌트가 받지 않습니다.
 *   결제창이 우리 서버(sndReply = /api/payment/ksnet/return)로 직접 POST 하고,
 *   그 응답 페이지가 최상위 창을 결과 화면으로 옮깁니다.
 *   손님이 결제창의 [닫기] 를 눌러도 같은 주소로 갑니다. (reCnclType=1)
 *   그래서 여기서 결과를 기다리거나 폴링할 필요가 없습니다.
 *
 * ★ 이모지·그림자를 쓰지 않습니다. 아이콘은 SVG 로 직접 그립니다.
 */
export default function KsnetPayLauncher({
  fields,
  action,
  frameName,
  frameWidth,
  frameHeight,
  isMobile,
  orderNo,
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
}) {
  const formRef = useRef<HTMLFormElement>(null);
  /** 두 번 보내지 않게 막습니다. (React 개발 모드는 effect 를 두 번 실행합니다) */
  const sent = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const form = formRef.current;
    if (!form) {
      setError('결제 정보를 준비하지 못했습니다.');
      return;
    }

    /*
     * ★ 아이프레임은 이 시점에 이미 DOM 에 있습니다.
     *   폼과 같은 렌더에서 그려지고, effect 는 그 뒤에 돕니다.
     *   순서가 어긋나면 target 이름을 못 찾아 새 창이 열립니다.
     */
    try {
      form.submit();
    } catch (cause) {
      console.error('[ksnet] 결제창 열기 실패:', cause);
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
            className="mt-4 bg-ink px-5 py-3 text-[14px] text-paper underline underline-offset-4"
          >
            결제를 그만두고 주문서로 돌아가기
          </Link>
        </div>
      ) : null}

      {/* ── 안내 · 오류 ────────────────────────────────── */}
      <div className="max-w-[520px]">
        <p className="label-xs">PAYMENT</p>
        <h1 className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]">
          {error ? '결제창을 열지 못했습니다' : '결제창을 여는 중입니다'}
        </h1>

        {error ? (
          <>
            <p className="mt-5 text-[16px] leading-[1.9] text-ink">{error}</p>
            <p className="mt-3 text-[15px] leading-[1.9] text-muted">
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
            <p className="mt-5 text-[16px] leading-[1.9] text-ink">
              잠시만 기다려 주세요. 결제창이 자동으로 열립니다.
            </p>
            <p className="mt-3 text-[15px] leading-[1.9] text-muted">
              결제가 끝나기 전에는 이 화면을 닫지 마세요.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
