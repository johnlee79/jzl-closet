/**
 * 팝업이 겹쳐 뜨는 것을 막기 위한 아주 작은 신호 장치. 브라우저 전용입니다.
 *
 * ★ 순서 — 공지·이벤트 팝업이 먼저, 보유 포인트 팝업이 그다음입니다.
 *   공지 팝업이 하나라도 떠 있으면 포인트 팝업은 이번 방문에서 뜨지 않습니다.
 *
 * PopupLayer 가 "몇 개 띄웠는지" 를 알려 주고, PointPopup 이 그걸 듣습니다.
 * 서로 import 하지 않아도 되도록 이벤트로만 주고받습니다.
 */

export const NOTICE_POPUP_EVENT = 'jzl:notice-popup-count';

type Detail = { count: number };

/** PopupLayer 가 마운트하며 부릅니다. */
export function announceNoticePopups(count: number): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>).__jzlNoticePopupCount = count;
  window.dispatchEvent(
    new CustomEvent<Detail>(NOTICE_POPUP_EVENT, { detail: { count } })
  );
}

/** 지금까지 알려진 값. 아직 아무도 알려 주지 않았으면 null 입니다. */
export function readNoticePopupCount(): number | null {
  if (typeof window === 'undefined') return null;
  const value = (window as unknown as Record<string, unknown>).__jzlNoticePopupCount;
  return typeof value === 'number' ? value : null;
}
