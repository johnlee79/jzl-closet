/**
 * 작성자 이름 가리기. 서버·클라이언트 공용(순수 함수)입니다.
 *
 * ★ DB 의 원본 이름은 그대로 둡니다. 관리자 화면에서는 원본을 확인해야 하기 때문입니다.
 *   손님에게 내려보내기 직전에만 이 함수를 통과시킵니다.
 *
 * 규칙
 *   1자      그대로            김
 *   2자      뒤 1자            박*
 *   3자      가운데 1자        박*정
 *   4자 이상 첫·끝 제외 전부   남궁민수 → 남**수
 *   영문·닉네임 첫 글자만 남김  jinhee → j*****
 */

const HAS_HANGUL = /[가-힣]/;

export function maskName(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';

  // 영문·숫자 닉네임은 첫 글자만 남깁니다. (가운데를 남기면 추측이 쉬워집니다)
  if (!HAS_HANGUL.test(trimmed)) {
    return trimmed[0] + '*'.repeat(Math.max(1, trimmed.length - 1));
  }

  if (trimmed.length === 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;

  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}
