'use client';

import { useEffect } from 'react';
import { isLeaving } from '@/lib/leaving';

/**
 * ============================================================
 * ★★ 화면 안쪽 오류 (2026-08-25)
 * ============================================================
 *
 * ★★ app/global-error.tsx 와 무엇이 다른가
 *   global-error 는 html·body 껍데기까지 무너진 드문 경우입니다.
 *   여기는 그보다 훨씬 흔한, 화면 안쪽에서 난 오류를 잡습니다.
 *
 * ★★ 이 파일은 app/(shop)/error.tsx 가 그대로 다시 씁니다.
 *   그래야 손님 화면에서는 헤더·푸터가 남습니다. (아래 설명)
 *
 *   app 바로 아래에 두면 루트 레이아웃 바로 밑이라 (shop) 레이아웃까지
 *   통째로 대신하게 됩니다. 헤더도 푸터도 사라집니다. 실제로 그랬습니다.
 *   그래서 손님 구역에는 같은 화면을 (shop) 안쪽에도 한 번 더 답니다.
 *   이 파일은 그 바깥(관리자 등)을 받는 마지막 그물로 남습니다.
 *
 * ★ 글에서 "위 메뉴" 를 언급하지 않습니다. 이 파일은 메뉴가 없는 자리에서도
 *   쓰이기 때문입니다. 두 곳에서 다 말이 되는 문장만 씁니다.
 *
 * ★ 전에는 이 파일도, global-error 도 없었습니다. 그래서 작은 오류 하나에
 *   화면 전체가 영어 기본 화면으로 바뀌었습니다.
 */
export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /*
   * ★★ 반드시 남깁니다. (global-error.tsx 와 같은 형식으로 맞춥니다)
   * ★ userAgent — 아이폰에서만 나는 문제를 로그로 가르는 유일한 단서입니다.
   * ★ digest — 서버 오류 번호. Vercel 함수 로그에서 같은 건을 찾을 수 있습니다.
   */
  useEffect(() => {
    const where = typeof window !== 'undefined' ? window.location.href : '';
    const agent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

    if (isLeaving()) {
      console.warn(
        '[ui] 화면을 떠나는 중에 끊겼습니다 (고장 아님) —',
        `message: ${error?.message ?? ''} |`,
        `digest: ${error?.digest ?? '없음'} |`,
        `주소: ${where} |`,
        `userAgent: ${agent}`
      );
      return;
    }

    console.error(
      '[ui] 화면 오류 —',
      `message: ${error?.message ?? ''} |`,
      `digest: ${error?.digest ?? '없음'} |`,
      `주소: ${where} |`,
      `userAgent: ${agent}`
    );
  }, [error]);

  /*
   * ★★ 우리가 일부러 다른 사이트로 떠나는 중이면 아무것도 그리지 않습니다.
   *   구글·카카오 동의 화면으로 넘어가는 그 짧은 사이입니다.
   *   markLeaving() 을 부른 경우에만 참이므로, 진짜 고장은 그대로 다 보입니다.
   */
  if (isLeaving()) return null;

  return (
    <div className="shell py-24 text-center md:py-32">
      <p className="label-xs text-muted">JZL CLOSET</p>

      <h1 className="mt-6 font-serif text-[26px] leading-snug text-ink md:text-[32px]">
        이 화면을 여는 중에 문제가 생겼습니다
      </h1>

      <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-[1.9] text-ink">
        잠시 문제가 있었습니다. 아래 [다시 시도] 를 눌러 주세요.
      </p>

      <p className="mx-auto mt-3 max-w-[520px] text-[16px] leading-[1.9] text-muted">
        장바구니와 주문하신 내용은 그대로 있습니다.
      </p>

      <div className="btn-row mx-auto mt-10 max-w-[420px]">
        <button type="button" onClick={() => reset()} className="btn-primary">
          다시 시도
        </button>
        <a href="/" className="btn-secondary">
          홈으로
        </a>
      </div>
    </div>
  );
}
