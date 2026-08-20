'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * KSNET 결제창 열기.
 *
 * PC     kspay_web_ssl.js 를 불러온 뒤 _pay(form) 을 부릅니다. (레이어/팝업)
 * 모바일  폼을 그대로 KSPayPWeb.jsp 로 보냅니다. (페이지 전체 이동)
 *
 * ★ PC 인지 모바일인지는 서버가 User-Agent 로 판단해 넘겨 줍니다.
 *   화면 폭으로 판단하면 안 됩니다. PC 브라우저 창을 좁혔다고 모바일 방식이 되면
 *   페이지가 통째로 이동해 버려 주문서로 돌아올 수 없게 됩니다.
 *
 * ★ alert 을 쓰지 않습니다. 결제 흐름 중에 모달이 뜨면 아무것도 못 하게 됩니다.
 *   문제가 생기면 화면에 글로 보여 주고 되돌아갈 링크를 둡니다.
 */
export default function KsnetPayLauncher({
  fields,
  mobileAction,
  scriptUrl,
  isMobile,
  orderNo,
}: {
  /** 서버가 만든 결제창 파라미터. 클라이언트에서 만들지 않습니다. */
  fields: Record<string, string>;
  mobileAction: string;
  scriptUrl: string;
  isMobile: boolean;
  orderNo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  /** 두 번 열지 않게 막습니다. (React 개발 모드는 effect 를 두 번 실행합니다) */
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const form = formRef.current;
    if (!form) return;

    /* ── 모바일 — 폼을 그대로 보냅니다 ─────────────────── */
    if (isMobile) {
      form.submit();
      return;
    }

    /* ── PC — 결제 라이브러리를 받아 _pay(form) ────────── */
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;

    script.onload = () => {
      const pay = (window as unknown as { _pay?: (form: HTMLFormElement) => void })._pay;
      if (typeof pay !== 'function') {
        setError('결제창을 여는 함수를 찾지 못했습니다.');
        return;
      }
      try {
        pay(form);
      } catch (cause) {
        console.error('[ksnet] 결제창 열기 실패:', cause);
        setError('결제창을 여는 중 문제가 생겼습니다.');
      }
    };

    script.onerror = () => {
      setError('결제 모듈을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
    };

    document.body.appendChild(script);

    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, [isMobile, scriptUrl]);

  return (
    <div className="shell py-20">
      {/*
       * ★ 폼은 화면에 보이지 않습니다. 값을 담아 두는 그릇일 뿐입니다.
       *   display:none 대신 hidden input 만 두어, 결제 모듈이 폼을 읽지 못하는
       *   경우가 생기지 않게 합니다.
       */}
      <form
        ref={formRef}
        name="payForm"
        id="payForm"
        method="post"
        action={mobileAction}
        acceptCharset="euc-kr"
        target="_self"
      >
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} readOnly />
        ))}
      </form>

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
              창이 열리지 않으면 브라우저의 팝업 차단을 해제한 뒤 새로고침해 주세요.
              <br />
              결제가 끝나기 전에는 이 화면을 닫지 마세요.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
