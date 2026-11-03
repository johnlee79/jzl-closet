/**
 * 후기 중복 판정 — 서버(저장 라우트 · 미리보기)와 화면이 같은 기준을 쓰도록 한곳에 둡니다.
 *
 * ★ 왜 필요한가 (2026-11-03)
 *   뉴욕트렌딕 후기 번호(source_review_id) 로만 거르면, 뉴욕트렌딕에 같은 글이 번호만 다르게
 *   두 번 올라와 있을 때 둘 다 들어갑니다. (예: 김**** · 2026.10.14 ·
 *   "만족해요. 꽤 좋은 선택이었던 것 같아요. 감사합니다!" 이모지만 다른 글 두 개)
 *
 * ★ 기준: 같은 상품 + 같은 작성자 + 같은 날짜(한국 시간) + 같은 글.
 *   글은 이모지·공백·문장부호를 빼고 비교합니다 (글자·숫자만 남김).
 *   상품은 호출하는 쪽에서 맞춥니다 — 이 키에는 들어가지 않습니다.
 *
 * ★ 글자·숫자가 하나도 안 남는 글(이모지·점만 있는 글) 은 중복으로 보지 않습니다.
 *   같은 날 같은 가린 이름(김****) 의 다른 손님이 "👍" 만 남긴 것까지 하나로 묶이면 안 됩니다.
 */

/**
 * 글자(모든 언어)·숫자가 아닌 것.
 * ★ /\p{L}/u 리터럴은 TypeScript target(ES2017) 이 막아 RegExp 생성자로 만듭니다.
 *   실행 환경(Node · 요즘 브라우저) 은 모두 지원합니다. (lib/brand-match.ts 참고)
 */
const NOT_LETTER_OR_DIGIT = new RegExp('[^\\p{L}\\p{N}]', 'gu');

/** 글자·숫자만 남기고 소문자로. 이모지·공백·문장부호·기호는 전부 빠집니다. */
export function normalizeReviewText(text: string): string {
  return (text ?? '').normalize('NFKC').replace(NOT_LETTER_OR_DIGIT, '').toLowerCase();
}

/** 작성일 → 한국 시간 날짜 "YYYY-MM-DD". 읽지 못하면 빈 문자열. */
export function reviewDayKST(writtenAt: string | null | undefined): string {
  if (!writtenAt) return '';
  const time = new Date(writtenAt).getTime();
  if (Number.isNaN(time)) return '';
  return new Date(time + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 중복 판정 키. 비교할 수 없는 후기(글·날짜가 비어 있음) 는 null — 중복으로 보지 않습니다.
 */
export function reviewDedupKey(review: {
  writerName: string;
  writtenAt: string | null | undefined;
  content: string;
}): string | null {
  const text = normalizeReviewText(review.content);
  const day = reviewDayKST(review.writtenAt);
  if (!text || !day) return null;
  const writer = (review.writerName ?? '').replace(/\s+/g, '');
  return `${writer}|${day}|${text}`;
}
