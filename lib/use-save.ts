'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

/**
 * ============================================================
 * 저장 버튼 공통 동작 — 눌렀는지, 되고 있는지, 됐는지
 * ============================================================
 *
 * ★ 왜 만들었나
 *   저장을 눌러도 아무 반응이 없어 손님이 됐는지 알 수 없다는 지적이 있었습니다.
 *   폼마다 각자 처리하다 보니 어떤 화면은 안내가 뜨고 어떤 화면은 안 떴습니다.
 *   같은 동작을 한 곳에서 정해 두고 모든 폼이 같은 방식으로 쓰게 합니다.
 *
 * ★ 세 가지를 한꺼번에 해결합니다
 *   1) 저장하는 동안 버튼에 "저장 중…" 을 보여 주고 다시 눌리지 않게 막습니다
 *   2) 끝나면 "저장되었습니다" 를 띄웁니다
 *   3) 성공 안내는 잠깐 뒤 저절로 사라집니다
 *
 * ★ 실패 안내는 저절로 사라지지 않습니다.
 *   무엇이 잘못됐는지 읽고 고쳐야 하는데 사라져 버리면 알 수 없습니다.
 *   다음에 저장을 다시 누를 때 지워집니다.
 */

export type FeedbackTone = 'ok' | 'error';
export type Feedback = { tone: FeedbackTone; text: string } | null;

/** 성공 안내가 화면에 머무는 시간 */
const OK_VISIBLE_MS = 3500;

/** 서버 액션이 돌려주는 공통 모양 */
type ActionLike = { ok: boolean; error?: string };

export function useSave(defaultOkText = '저장되었습니다.') {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedbackState] = useState<Feedback>(null);
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // 화면을 떠날 때 예약된 타이머를 정리합니다.
  useEffect(() => clearTimer, [clearTimer]);

  const setFeedback = useCallback(
    (next: Feedback) => {
      clearTimer();
      setFeedbackState(next);
      // ★ 성공만 저절로 사라집니다. 실패는 읽어야 하므로 남겨 둡니다.
      if (next?.tone === 'ok') {
        timer.current = window.setTimeout(() => {
          setFeedbackState(null);
          timer.current = null;
        }, OK_VISIBLE_MS);
      }
    },
    [clearTimer]
  );

  /**
   * 저장 실행.
   *
   * @param action 서버 액션을 부르는 함수
   * @param okText 성공했을 때 보여 줄 말 (기본 "저장되었습니다.")
   * @param onSuccess 성공한 뒤 더 할 일 (목록 새로고침 등)
   *
   * ★ 이미 저장 중이면 아무 일도 하지 않습니다. 두 번 눌러도 한 번만 나갑니다.
   *   결제·주문처럼 같은 요청이 두 번 나가면 안 되는 곳이 있어 여기서 막습니다.
   */
  const run = useCallback(
    (
      action: () => Promise<ActionLike>,
      okText: string = defaultOkText,
      onSuccess?: () => void
    ) => {
      if (pending) return;
      setFeedback(null);

      startTransition(async () => {
        try {
          const result = await action();
          if (!result.ok) {
            setFeedback({ tone: 'error', text: result.error || '처리하지 못했습니다.' });
            return;
          }
          setFeedback({ tone: 'ok', text: okText });
          onSuccess?.();
        } catch (error) {
          // 서버 액션이 통째로 실패한 경우입니다. (네트워크 끊김 등)
          const text =
            error instanceof Error ? error.message : '처리하지 못했습니다. 다시 시도해 주세요.';
          setFeedback({ tone: 'error', text });
        }
      });
    },
    [defaultOkText, pending, setFeedback]
  );

  return { pending, feedback, setFeedback, run };
}

/**
 * 버튼에 넣을 글자.
 *   저장 중이면 "저장 중…", 아니면 원래 글자
 */
export function busyLabel(pending: boolean, label: string, busy = '저장 중…'): string {
  return pending ? busy : label;
}
