'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * ============================================================
 * 필수 항목 검사 — 어디가 비었는지 눈에 보이게
 * ============================================================
 *
 * ★ 왜 만들었나
 *   필수 항목이 비었는데 저장을 누르면 아무 말도 없이 멈추는 화면이 있었습니다.
 *   손님은 왜 안 되는지 알 수 없습니다.
 *
 * ★ 세 가지를 함께 합니다
 *   1) 빈 칸에 빨간 테두리
 *   2) 그 칸 아래에 "연락처를 입력해 주세요" 같은 안내
 *   3) 첫 번째 빈 칸으로 화면을 스크롤하고 커서를 옮깁니다
 *
 * ★ 첫 번째 것만 보여 줍니다.
 *   빈 칸이 다섯 개라고 빨간 줄을 다섯 개 띄우면 어디부터 손대야 할지 모릅니다.
 *   하나 채우면 다음 것을 알려 주는 편이 따라가기 쉽습니다.
 *
 * 쓰는 법
 *   const problems = useFieldProblems();
 *   ...
 *   if (problems.check([
 *     { field: 'name',  ok: name.trim().length > 0,  message: '이름을 입력해 주세요.' },
 *     { field: 'phone', ok: phone.trim().length > 0, message: '연락처를 입력해 주세요.' },
 *   ])) return;                        // 문제가 있으면 여기서 멈춥니다
 *   ...
 *   <input ref={problems.ref('phone')} className={problems.inputClass('phone', 기본클래스)} />
 *   <FieldError message={problems.messageFor('phone')} />
 */

export type FieldCheck = {
  /** 칸 이름 — ref·className·안내를 잇는 열쇠 */
  field: string;
  /** true 면 통과 */
  ok: boolean;
  /** 통과하지 못했을 때 보여 줄 안내 */
  message: string;
};

export function useFieldProblems() {
  const [problem, setProblem] = useState<{ field: string; message: string } | null>(null);
  const nodes = useRef<Record<string, HTMLElement | null>>({});

  /** 칸을 등록합니다. <input ref={problems.ref('phone')} /> */
  const ref = useCallback(
    (field: string) => (node: HTMLElement | null) => {
      nodes.current[field] = node;
    },
    []
  );

  /**
   * 검사합니다. 문제가 있으면 true 를 돌려주고 호출부는 거기서 멈춥니다.
   * 화면을 그 칸으로 옮기고 커서까지 넣어 줍니다.
   */
  const check = useCallback((checks: FieldCheck[]): boolean => {
    const found = checks.find((item) => !item.ok);
    if (!found) {
      setProblem(null);
      return false;
    }

    setProblem({ field: found.field, message: found.message });

    const node = nodes.current[found.field];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      /*
       * ★ 스크롤이 끝난 뒤에 커서를 넣습니다.
       *   바로 focus() 하면 브라우저가 제 방식대로 한 번 더 스크롤해
       *   부드럽게 움직이던 화면이 툭 끊깁니다.
       */
      window.setTimeout(() => {
        if (typeof (node as HTMLInputElement).focus === 'function') {
          (node as HTMLInputElement).focus({ preventScroll: true });
        }
      }, 350);
    }
    return true;
  }, []);

  /** 이 칸에 문제가 있는지 */
  const has = useCallback((field: string) => problem?.field === field, [problem]);

  /** 이 칸에 보여 줄 안내 (없으면 빈 문자열) */
  const messageFor = useCallback(
    (field: string) => (problem?.field === field ? problem.message : ''),
    [problem]
  );

  /** 기본 클래스에 빨간 테두리를 더해 돌려줍니다. */
  const inputClass = useCallback(
    (field: string, base: string, invalid = 'border-wine') =>
      problem?.field === field ? `${base} ${invalid}` : base,
    [problem]
  );

  /** 관리자 화면용 — 빨간색 값이 다릅니다. */
  const adminInputClass = useCallback(
    (field: string, base = 'admin-input') =>
      problem?.field === field ? `${base} border-red-500` : base,
    [problem]
  );

  const clear = useCallback(() => setProblem(null), []);

  return { problem, ref, check, has, messageFor, inputClass, adminInputClass, clear };
}
