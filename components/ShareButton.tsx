'use client';

import { useEffect, useState } from 'react';
import { useSite } from '@/components/SiteProvider';
import { buildShareText, buildShareUrl, isReferralCode } from '@/lib/referral-code';

/**
 * 공유 버튼.
 *
 * ★ 로그인한 회원이면 주소 끝에 자기 추천 코드를 붙입니다.
 *   코드는 서버에서 받아 옵니다. 브라우저가 만들면 남의 코드를 넣을 수 있습니다.
 * ★ 비회원은 코드 없이 그냥 주소만 공유합니다. 가입을 강요하지 않습니다.
 * ★ 그림자·이모지를 쓰지 않습니다. 아이콘은 SVG 로 직접 그립니다.
 */

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <circle cx="12" cy="3.5" r="2" />
        <circle cx="4" cy="8" r="2" />
        <circle cx="12" cy="12.5" r="2" />
        <path d="M5.8 7L10.2 4.5M5.8 9L10.2 11.5" />
      </g>
    </svg>
  );
}

type ShareButtonProps = {
  /** 공유할 경로. `/products/item-abc` 처럼 앞에 / 를 붙입니다. */
  path: string;
  /** 공유 문구 첫 줄 (상품명 등) */
  title: string;
  className?: string;
  label?: string;
};

export default function ShareButton({
  path,
  title,
  className = '',
  label = '공유하기',
}: ShareButtonProps) {
  const { store } = useSite();
  const [code, setCode] = useState('');
  const [shareLine, setShareLine] = useState('');
  const [done, setDone] = useState('');
  /**
   * 버튼 아래 안내 문구. 서버가 상황을 보고 정해서 내려 줍니다.
   * ★ 여기서 판단하지 않습니다. 이벤트 진행 여부는 브라우저가 알 수 없고,
   *   문구도 관리자가 고치는 값입니다. 화면은 받은 대로 그리기만 합니다.
   * ★ 회원인데 진행 중인 이벤트가 없으면 빈 문자열이 옵니다. 그때는 아무것도 안 그립니다.
   */
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    // 로그인하지 않았으면 빈 코드가 옵니다. 그대로 코드 없이 공유합니다.
    fetch('/api/referral/me')
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (data: { code?: string; shareLine?: string; notice?: string } | null) => {
          if (!alive || !data) return;
          if (data.code && isReferralCode(data.code)) setCode(data.code);
          if (data.shareLine) setShareLine(data.shareLine);
          if (data.notice) setNotice(data.notice);
        }
      )
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const share = async () => {
    // window 는 브라우저에서만 있습니다. 버튼을 눌렀을 때 읽으므로 안전합니다.
    const url = buildShareUrl(window.location.origin, path, code);
    const text = buildShareText(title, url, store.name, shareLine);

    /*
     * ★ 휴대폰에서는 기기의 공유 창을 띄웁니다. (카카오톡·문자·메모가 한 번에 나옵니다)
     *   PC 에는 공유 창이 없는 브라우저가 많아 주소를 복사해 주는 것으로 대신합니다.
     */
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // 손님이 공유 창을 닫은 경우입니다. 복사로 넘어가지 않고 그냥 끝냅니다.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setDone('링크를 복사했습니다');
    } catch {
      setDone('복사하지 못했습니다. 주소창의 주소를 보내 주세요');
    }
    window.setTimeout(() => setDone(''), 2500);
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={share}
        className={`tap-target inline-flex items-center gap-2 text-[14px] tracking-[0.1em] text-muted transition-colors duration-200 hover:text-ink ${className}`}
      >
        <ShareIcon />
        {label}
      </button>

      {/* 왜 공유하는지 — 상황에 맞는 한 줄. 없으면 버튼만 나갑니다. */}
      {notice ? (
        <span className="pl-6 text-[13px] leading-relaxed text-muted">{notice}</span>
      ) : null}

      {/* aria-live 를 두어야 화면을 못 보는 손님에게도 결과가 읽힙니다. */}
      <span aria-live="polite" className="text-[12px] text-muted">
        {done}
      </span>
    </span>
  );
}
