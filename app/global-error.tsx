'use client';

import { useEffect } from 'react';
import LeavingScreen from '@/components/LeavingScreen';
import { isLeaving } from '@/lib/leaving';
import { reportUiError } from '@/lib/ui-error';
import './globals.css';

/**
 * ============================================================
 * ★★ 가장 바깥 오류 화면 (2026-08-25)
 * ============================================================
 *
 * ★★ 전에는 이 파일이 아예 없었습니다.
 *   그래서 손님이 Next.js 의 맨몸 기본 화면을 봤습니다.
 *       "Application error: a client-side exception has occurred"
 *   영어이고, 무슨 일인지 알 수 없고, 돌아갈 버튼조차 없습니다.
 *   게다가 **오류 내용이 어디에도 남지 않아** 원인을 찾을 수가 없었습니다.
 *
 * ★★ 이 파일은 껍데기까지 통째로 대신합니다.
 *   레이아웃 자체가 무너졌을 때 마지막으로 뜨는 화면이라 html·body 를
 *   직접 그려야 합니다. 헤더도 푸터도 없습니다.
 *   화면 안쪽 오류는 app/error.tsx 가 먼저 잡습니다. 그쪽이 훨씬 흔합니다.
 *
 * ★ globals.css 를 직접 들여옵니다. 루트 레이아웃을 안 거치므로
 *   여기서 안 가져오면 글꼴도 색도 없는 맨 화면이 됩니다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /*
   * ★★ 반드시 남깁니다. 이게 없어서 지금까지 원인을 못 찾았습니다.
   *
   * ★ userAgent 를 함께 남기는 것이 중요합니다.
   *   같은 버튼이 아이폰에서만 말썽입니다. (아이폰은 크롬을 써도 속은 사파리)
   *   이 한 줄이 있어야 "아이폰에서만" 이 로그로 갈립니다.
   * ★ digest 는 서버에서 난 오류에 붙는 번호입니다. 이 번호로 Vercel
   *   함수 로그에서 같은 오류를 찾을 수 있습니다.
   */
  /*
   * ★★ 반드시 남깁니다. 브라우저 콘솔에 찍고, 서버로도 한 줄 보냅니다.
   *   userAgent 와 stack 이 함께 갑니다. "아이폰에서만" 과 "어느 코드가
   *   터졌는지" 는 그 둘로만 갈립니다.
   * ★ 자세한 내용은 lib/ui-error.ts 에 한 곳으로 모아 두었습니다.
   */
  useEffect(() => {
    reportUiError(error, '최상위');
  }, [error]);

  /*
   * ★★ 우리가 일부러 다른 사이트로 떠나는 중이면 고장이 아닙니다.
   *   구글·카카오 동의 화면으로 넘어가는 그 짧은 사이입니다.
   *   여기서 오류 화면을 그리면 손님은 "고장 났다" 고 봅니다.
   *
   * ★★ 그렇다고 빈 화면을 두면 그것도 고장으로 보입니다.
   *   손님이 뒤로가기를 눌러 로그인이 중단됩니다. 옮기는 중이라고 말해 줍니다.
   *
   * ★ markLeaving() 을 우리가 직접 부른 경우에만 참입니다.
   *   진짜 고장은 아래 화면이 그대로 다 나옵니다. (lib/leaving.ts 설명 참고)
   * ★ 그리기 전에 판단합니다. 그려 놓고 지우면 그 한 번이 깜빡임으로 보입니다.
   */
  if (isLeaving()) {
    return (
      <html lang="ko">
        <body className="bg-paper text-ink antialiased">
          <LeavingScreen />
        </body>
      </html>
    );
  }

  return (
    <html lang="ko">
      <body className="bg-paper text-ink antialiased">
        <main className="shell flex min-h-[100svh] flex-col items-center justify-center py-20 text-center">
          <p className="label-xs text-muted">JZL CLOSET</p>

          <h1 className="mt-6 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
            화면을 여는 중에 문제가 생겼습니다
          </h1>

          <p className="mt-5 max-w-[520px] text-[17px] leading-[1.9] text-ink">
            잠시 문제가 있었습니다. 아래 [다시 시도] 를 눌러 주세요. 그래도 같은 화면이
            나오면 잠시 뒤에 다시 찾아와 주시면 감사하겠습니다.
          </p>

          <p className="mt-3 max-w-[520px] text-[16px] leading-[1.9] text-muted">
            주문하신 내용은 그대로 있습니다. 급하시면 고객센터로 연락 주세요.
          </p>

          <div className="btn-row mx-auto mt-10 max-w-[420px]">
            <button type="button" onClick={() => reset()} className="btn-primary">
              다시 시도
            </button>
            {/*
              ★ next/link 를 쓰지 않습니다. 여기는 라우터가 이미 무너진 자리라
                평범한 링크로 화면을 통째로 새로 여는 편이 확실합니다.
            */}
            <a href="/" className="btn-secondary">
              홈으로
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
