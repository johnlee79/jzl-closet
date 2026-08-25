'use client';

import { leavingMessage } from '@/lib/leaving';

/**
 * ============================================================
 * ★★ "다른 화면으로 옮기는 중" 화면 (2026-08-25)
 * ============================================================
 *
 * ★★ 왜 만들었는가
 *   구글·카카오 로그인처럼 다른 사이트로 넘어갈 때, 사파리(아이폰)는
 *   진행 중이던 요청이 끊긴 것을 오류로 던집니다. 크롬은 조용히 넘깁니다.
 *   그래서 아이폰에서만 오류 화면이 잠깐 보였습니다.
 *
 *   그 오류는 고장이 아니므로 처음에는 아무것도 안 그렸습니다.
 *   그런데 **빈 화면도 고장으로 보입니다.** 손님은 자기가 뭘 잘못 눌렀나
 *   싶어 뒤로 가기를 누릅니다. 그러면 진짜로 로그인이 중단됩니다.
 *
 *   그래서 빈 화면 대신 "지금 옮기는 중" 이라고 말해 줍니다.
 *
 * ★★ 살아 움직여야 합니다.
 *   멈춰 있는 글자만 있으면 멈춘 화면으로 보입니다. 점 세 개가 순서대로
 *   커졌다 작아집니다. CSS 만 씁니다. 이것 때문에 라이브러리를 들이지 않습니다.
 *   (움직임 줄이기를 켠 손님에게는 멈춘 채로 또렷하게 보입니다 — globals.css)
 *
 * ★★ 이 자리 말고도 쓸 수 있게 만들었습니다.
 *   문구는 markLeaving() 을 부른 쪽이 정합니다. 결제창으로 넘어갈 때처럼
 *   기다림이 긴 다른 자리에서도 그대로 쓸 수 있습니다.
 *
 * @param inShell 헤더·푸터가 이미 있는 자리인지.
 *   true  — 본문 자리만 채웁니다 (app/(shop)/error.tsx)
 *   false — 화면 전체를 채웁니다 (app/global-error.tsx · 껍데기가 없는 자리)
 */
export default function LeavingScreen({ inShell = false }: { inShell?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        inShell
          ? 'shell flex min-h-[60vh] flex-col items-center justify-center py-24 text-center'
          : 'shell flex min-h-[100svh] flex-col items-center justify-center py-20 text-center'
      }
    >
      {/* ★ 로고는 사이트와 같은 세리프·자간 그대로입니다. 여기만 달라 보이면 안 됩니다. */}
      <p className="font-serif text-[20px] tracking-[0.24em] text-ink md:text-[24px]">
        JZL CLOSET
      </p>

      <p className="mt-6 text-[17px] leading-[1.9] text-ink">{leavingMessage()}</p>

      {/* 점 세 개가 순서대로 커집니다. 모양·시간은 globals.css 의 jzl-dot 이 정합니다. */}
      <span className="jzl-dots mt-7" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>

      <p className="mt-7 text-[15px] leading-[1.9] text-muted">
        잠시만 기다려 주세요.
      </p>
    </div>
  );
}
