/**
 * 마진 판정 — 상품 목록·수정·단가표 보기 어디서든 **같은 기준**으로 색을 입힙니다.
 *
 * ★ 명세 (사장님 지시 2026-10-06)
 *   · 마진 0 원 이하        → "역마진" (빨강)
 *   · 마진율 70% 넘음        → "짝 잘못" 의심 (빨강)
 *   · 마진율 10% 미만        → "너무 낮음" (빨강)
 *   · 그 밖은               → 정상 (회색)
 *   막지 않습니다. 안내만.
 *
 * ★ 마진 = 판매가 − 원가 (둘 다 부가세 포함). 카드 수수료는 빼지 않습니다.
 */

export type MarginJudgement =
  | { kind: 'none' } // 원가가 없어서 못 봄
  | { kind: 'ok'; margin: number; rate: number }
  | { kind: 'negative'; margin: number; rate: number; reason: string }
  | { kind: 'high'; margin: number; rate: number; reason: string }
  | { kind: 'low'; margin: number; rate: number; reason: string };

export function judgeMargin(
  salePrice: number | null | undefined,
  costPrice: number | null | undefined
): MarginJudgement {
  if (!salePrice || !costPrice || salePrice <= 0 || costPrice <= 0) {
    return { kind: 'none' };
  }
  const margin = salePrice - costPrice;
  const rate = Math.round((margin / salePrice) * 100);

  if (margin <= 0) {
    return {
      kind: 'negative',
      margin,
      rate,
      reason: '원가가 판매가보다 큽니다 — 짝을 잘못 지은 것 같습니다',
    };
  }
  if (rate > 70) {
    return {
      kind: 'high',
      margin,
      rate,
      reason: `마진율이 ${rate}% — 너무 높아 짝을 잘못 지은 것 같습니다`,
    };
  }
  if (rate < 10) {
    return {
      kind: 'low',
      margin,
      rate,
      reason: `마진율이 ${rate}% — 너무 낮습니다`,
    };
  }
  return { kind: 'ok', margin, rate };
}

/** 간단한 분류용 */
export function marginToneClass(j: MarginJudgement): string {
  if (j.kind === 'negative' || j.kind === 'high' || j.kind === 'low') {
    return 'text-red-700 font-semibold';
  }
  if (j.kind === 'ok') return 'text-slate-900';
  return 'text-slate-400';
}
