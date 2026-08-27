/**
 * ================================================================
 * ** 공지 구분과 글자 뽑기 — 화면과 서버가 함께 쓰는 것 (2-C, 2026-08-27)
 * ================================================================
 *
 * ** 왜 lib/notices.ts 에서 갈라 놓았나요
 *   lib/notices.ts 는 맨 윗줄이 `import 'server-only'` 입니다.
 *   DB 열쇠를 들고 있어서 손님 브라우저로 새어 나가면 안 되기 때문입니다.
 *   그런데 관리자 공지 화면(components/admin/NoticeManager.tsx)은 브라우저에서
 *   도는 화면이라 그 파일을 읽는 순간 **빌드가 통째로 실패합니다.**
 *   (2026-08-27 에 실제로 여기서 한 번 막혔습니다. 2-B 때 lib/orders.ts 에서
 *    겪은 것과 똑같은 함정입니다.)
 *
 *   그래서 **DB 를 안 건드리는 것만** 이 파일로 옮겼습니다.
 *   lib/notices.ts 는 여기 것을 그대로 다시 내보냅니다. 부르는 쪽은
 *   지금까지처럼 lib/notices.ts 에서 가져다 쓰면 됩니다.
 * ================================================================
 */

/** notice = 공지사항 / faq = 자주 묻는 질문 */
export type NoticeKind = 'notice' | 'faq';

export const NOTICE_KINDS: { value: NoticeKind; label: string }[] = [
  { value: 'notice', label: '공지사항' },
  { value: 'faq', label: '자주 묻는 질문' },
];

/**
 * 칸이 없거나 모르는 값이면 공지로 봅니다.
 *
 * ** ★ 이것이 핵심입니다. 정리SQL/12 를 돌리기 전에는 기존 공지 줄에
 *   kind 칸이 아예 없습니다. 여기서 undefined 를 그냥 넘기면 그 공지가
 *   공지도 질문도 아닌 것이 되어 손님 공지 목록에서 사라집니다.
 */
export function toKind(value: unknown): NoticeKind {
  return value === 'faq' ? 'faq' : 'notice';
}

/**
 * 편집기가 만든 HTML 에서 글자만 꺼냅니다. 줄바꿈은 살립니다.
 *
 * ** 채팅 말풍선에는 글자와 줄바꿈만 그립니다. 태그를 안 그립니다.
 *   1) 말풍선에 제목·가운데정렬·표가 들어가면 모양이 깨집니다.
 *   2) 채팅 위젯은 손님 화면 전체를 감싸는 자리에 있습니다. 거기에
 *      HTML 을 그대로 꽂아 넣는 자리를 새로 만들지 않는 것이 안전합니다.
 *      관리자가 쓴 글이라도 마찬가지입니다 — 편집기에 붙여넣기로 남의
 *      글이 통째로 들어올 수 있습니다.
 *   ★ 그래서 **서버가** 글자로 바꿔서 내보냅니다. 채팅창은 HTML 을
 *     아예 손에 쥐지 않습니다. (app/api/faq/route.ts)
 *
 * ** 관리자 화면의 글자 수 세기도 같은 함수를 씁니다.
 *   두 벌로 세면 "관리자에는 380자인데 손님한테는 다르게 보인다" 가 됩니다.
 */
export function stripTags(html: string): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    // <br> · </p> · </div> · </li> 는 줄바꿈으로
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    // &nbsp; 같은 것 몇 개만 되돌립니다
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    // ** &amp; 는 맨 나중에 풉니다. 먼저 풀면 &amp;lt; 가 < 로 되살아납니다.
    .replace(/&amp;/gi, '&')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    // 빈 줄이 세 번 넘게 이어지면 두 번으로
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
