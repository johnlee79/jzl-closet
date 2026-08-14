'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 다음(카카오) 우편번호 서비스 스크립트 관리.
 *
 * ★ 왜 next/script 를 안 쓰는가
 *   next/script 는 한 번 실패하면 다시 시도하지 않습니다.
 *   회선이 느리거나 스크립트 서버가 잠깐 응답하지 않으면 버튼이
 *   "불러오는 중…" 에서 영영 멈춰 버립니다. 실제로 그 일이 있었습니다.
 *   그래서 직접 넣고 타임아웃·재시도·수동 재시도까지 다룹니다.
 *
 * ★ 원칙
 *   · 화면에 들어오는 순간 미리 불러 둡니다. 버튼을 누를 때 기다리지 않습니다.
 *   · 5초 안에 응답이 없으면 실패로 보고 다시 시도합니다. (최초 1회 + 재시도 2회)
 *   · 끝내 실패하면 손으로 다시 시도할 수 있게 하고,
 *     우편번호·주소를 직접 입력할 수 있도록 화면에 알려 줍니다.
 *   · 이미 불러온 뒤에는 다시 불러오지 않습니다.
 */

const SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

/** 한 번 시도할 때 기다리는 시간 */
const TIMEOUT = 5000;
/** 최초 1회 + 자동 재시도 2회 */
const MAX_ATTEMPTS = 3;

/** 스크립트 태그를 알아보기 위한 표시 */
const MARK = 'data-jzl-postcode';

export type PostcodeResult = { postcode: string; address: string };

type DaumPostcodeData = {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName?: string;
  apartment?: string;
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: DaumPostcodeData) => void;
        onclose?: () => void;
      }) => { open: () => void };
    };
  }
}

/** 여러 화면이 동시에 불러도 실제 로딩은 한 번만 돌게 합니다. */
let pending: Promise<boolean> | null = null;

function loaded(): boolean {
  return typeof window !== 'undefined' && Boolean(window.daum?.Postcode);
}

/** 한 번 시도합니다. 성공하면 true. */
function attempt(): Promise<boolean> {
  return new Promise((resolve) => {
    // 앞선 시도가 남겨 둔 태그는 지우고 새로 답니다.
    document.querySelectorAll(`script[${MARK}]`).forEach((node) => node.remove());

    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.setAttribute(MARK, '1');

    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (!ok) script.remove();
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), TIMEOUT);

    script.onload = () => finish(loaded());
    script.onerror = () => finish(false);

    document.head.appendChild(script);
  });
}

async function run(): Promise<boolean> {
  for (let index = 0; index < MAX_ATTEMPTS; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await attempt()) return true;
  }
  return false;
}

/**
 * 스크립트를 불러옵니다.
 * @param force 실패한 뒤 손으로 다시 시도할 때 true
 */
export function loadPostcodeScript(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (loaded()) return Promise.resolve(true);

  if (!pending || force) {
    pending = run().then((ok) => {
      // 실패했으면 다음 요청이 다시 시도할 수 있게 비워 둡니다.
      if (!ok) pending = null;
      return ok;
    });
  }
  return pending;
}

/** 검색창을 엽니다. 스크립트가 없으면 false 를 돌려줍니다. */
export function openPostcodeSearch(onSelect: (result: PostcodeResult) => void): boolean {
  if (!window.daum?.Postcode) return false;

  new window.daum.Postcode({
    oncomplete: (data) => {
      const base = data.roadAddress || data.jibunAddress;
      const building = data.buildingName ? ` (${data.buildingName})` : '';
      onSelect({ postcode: data.zonecode, address: `${base}${building}` });
    },
  }).open();
  return true;
}

export type PostcodeState = 'loading' | 'ready' | 'failed';

/** 주소가 필요한 화면에서 쓰는 훅. 들어오는 즉시 스크립트를 미리 받아 둡니다. */
export function usePostcodeScript(): {
  state: PostcodeState;
  /** 검색창 열기. 스크립트가 아직 없으면 한 번 더 불러 본 뒤 엽니다. */
  open: (onSelect: (result: PostcodeResult) => void) => Promise<boolean>;
  /** 손으로 다시 시도 */
  retry: () => void;
} {
  const [state, setState] = useState<PostcodeState>(() =>
    loaded() ? 'ready' : 'loading'
  );

  useEffect(() => {
    let alive = true;
    if (loaded()) {
      setState('ready');
      return () => {
        alive = false;
      };
    }

    loadPostcodeScript().then((ok) => {
      if (alive) setState(ok ? 'ready' : 'failed');
    });

    return () => {
      alive = false;
    };
  }, []);

  const retry = useCallback(() => {
    setState('loading');
    loadPostcodeScript(true).then((ok) => setState(ok ? 'ready' : 'failed'));
  }, []);

  const open = useCallback(async (onSelect: (result: PostcodeResult) => void) => {
    if (openPostcodeSearch(onSelect)) return true;

    // 버튼을 누른 시점에 아직 준비가 안 됐으면 한 번 더 시도합니다.
    setState('loading');
    const ok = await loadPostcodeScript(true);
    setState(ok ? 'ready' : 'failed');
    return ok ? openPostcodeSearch(onSelect) : false;
  }, []);

  return { state, open, retry };
}

/**
 * 스크립트를 못 불러왔을 때 화면에 그대로 쓰는 안내 문구.
 * 고객센터 번호는 관리자 설정 값을 넣습니다. (하드코딩하지 않습니다)
 */
export function postcodeFallbackNotice(phone: string): string {
  return `주소 검색을 불러오지 못했습니다.\n우편번호와 주소를 직접 입력하시거나, ${phone}로 연락 주세요.`;
}
