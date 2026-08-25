'use client';

import { useEffect, useState } from 'react';

/**
 * ============================================================
 * 홈 화면에 추가하기 안내
 * ============================================================
 *
 * ★★ 무엇을 하는가
 *   1) 서비스 워커를 등록합니다. (설치할 수 있는 사이트가 되는 조건)
 *   2) 방문 횟수를 셉니다.
 *   3) 두 번 넘게 온 손님에게만 아래에 작은 띠로 안내합니다.
 *
 * ★★ 왜 두 번째부터인가
 *   처음 온 손님에게 "홈 화면에 추가하세요" 는 이릅니다. 아직 이 가게가
 *   뭔지도 모르는데 자리를 차지하는 안내가 먼저 뜨면 성가십니다.
 *   다시 찾아온 손님은 이미 관심이 있는 분이라 그때 권합니다.
 *
 * ★★ 안드로이드와 iOS 가 완전히 다릅니다
 *   안드로이드(크롬) — 브라우저가 beforeinstallprompt 를 줍니다.
 *                    그 신호를 잡아 두었다가 버튼을 누를 때 띄웁니다.
 *                    누르면 진짜 설치 창이 뜹니다.
 *   iOS(사파리)      — 그런 신호가 없습니다. 애플이 안 만들었습니다.
 *                    방법은 공유 버튼 → "홈 화면에 추가" 뿐이라,
 *                    그 자리를 글로 알려 주는 수밖에 없습니다.
 *
 * ★ 이미 홈 화면에서 열었다면 아무것도 안 합니다.
 *   설치한 사람에게 설치하라고 하면 안 됩니다.
 *
 * ★ 닫으면 30일 동안 다시 뜨지 않습니다.
 *   "됐다" 는 뜻으로 닫은 사람에게 다음 방문마다 또 물으면 안 됩니다.
 */

const VISIT_KEY = 'jzl-visits';
const DISMISS_KEY = 'jzl-install-dismissed';

/** 이 횟수 이상 방문한 손님에게만 안내합니다. */
const SHOW_FROM_VISIT = 2;
/** 닫은 뒤 다시 묻지 않는 기간 */
const DISMISS_DAYS = 30;

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** 이미 홈 화면(앱)으로 열었는지 */
function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    // iOS 사파리는 표준이 아닌 자리에 넣어 둡니다.
    return (window.navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function isIos(): boolean {
  try {
    const ua = window.navigator.userAgent;
    // ★ 아이패드는 최근 기종이 자기를 맥이라고 말합니다. 터치 여부로 함께 봅니다.
    const iPadOS = /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/.test(ua) || iPadOS;
  } catch {
    return false;
  }
}

/** 안드로이드 크롬이 아닌 iOS 브라우저는 전부 사파리 규칙을 따릅니다. */
function readNumber(key: string): number {
  try {
    return Number(window.localStorage.getItem(key) ?? '0') || 0;
  } catch {
    return 0;
  }
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  /* ── 서비스 워커 등록 ────────────────────────────────── */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    /*
     * ★ 화면이 다 그려진 뒤에 등록합니다.
     *   첫 화면이 뜨는 속도를 이 일 때문에 늦추지 않습니다.
     */
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 등록에 실패해도 사이트는 그대로 동작합니다. 안내만 안 뜹니다. */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  /* ── 방문 횟수 세기 · 보여 줄지 정하기 ───────────────── */
  useEffect(() => {
    if (isStandalone()) return;

    let visits = 0;
    try {
      visits = readNumber(VISIT_KEY) + 1;
      window.localStorage.setItem(VISIT_KEY, String(visits));
    } catch {
      // 저장소를 못 쓰면 셀 수 없습니다. 안내하지 않고 조용히 물러납니다.
      return;
    }

    // 닫은 지 얼마 안 됐으면 건너뜁니다.
    const dismissedAt = readNumber(DISMISS_KEY);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;

    if (visits < SHOW_FROM_VISIT) return;

    setIos(isIos());
    /*
     * ★ 안드로이드는 브라우저가 신호를 줄 때까지 기다립니다.
     *   신호가 오기 전에 버튼을 보여 주면 눌러도 아무 일이 안 납니다.
     *   iOS 는 신호가 없으므로 바로 보여 줍니다.
     */
    if (isIos()) setShow(true);
  }, []);

  /* ── 안드로이드 — 설치 신호 받기 ─────────────────────── */
  useEffect(() => {
    const onPrompt = (event: Event) => {
      // ★ 브라우저 기본 안내를 막고 우리 띠로 대신합니다.
      event.preventDefault();
      setDeferred(event as InstallEvent);

      if (isStandalone()) return;
      const dismissedAt = readNumber(DISMISS_KEY);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
      if (readNumber(VISIT_KEY) < SHOW_FROM_VISIT) return;
      setShow(true);
    };

    // 설치가 끝나면 띠를 내립니다.
    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* 못 저장해도 이번 화면에서는 사라집니다. */
    }
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* 손님이 창을 그냥 닫은 경우입니다. */
    }
    setDeferred(null);
    dismiss();
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="홈 화면에 추가"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone bg-paper px-5 py-4 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="shell flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* ★ 홈 화면에 생길 바로 그 아이콘을 보여 줍니다. 말보다 빠릅니다. */}
          <img
            src="/icon-192.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-lg"
          />
          <div>
            <p className="text-[16px] font-medium leading-snug text-ink">
              홈 화면에 추가하시면 다음에 바로 오실 수 있어요
            </p>
            {ios ? (
              <p className="mt-0.5 text-[14px] leading-relaxed text-muted">
                아래 <strong>공유</strong> 버튼을 누르고{' '}
                <strong>&ldquo;홈 화면에 추가&rdquo;</strong> 를 선택해 주세요.
              </p>
            ) : (
              <p className="mt-0.5 text-[14px] leading-relaxed text-muted">
                주소창 없이 앱처럼 열립니다.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* ★ iOS 는 누를 버튼이 없습니다. 브라우저가 설치 창을 안 열어 줍니다. */}
          {!ios && deferred ? (
            <button type="button" onClick={() => void install()} className="btn-primary">
              추가하기
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="text-[15px] text-muted underline underline-offset-4"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
