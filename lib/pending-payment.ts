/**
 * ============================================================
 * "결제창으로 넘어간 주문" 표시
 * ============================================================
 *
 * 모바일 결제의 안전망입니다. (2026-08-25)
 *
 * ★★ 왜 필요한가
 *   모바일은 결제창으로 갈 때 페이지가 통째로 넘어갑니다. (target=_self)
 *   그 순간 우리 페이지가 사라지므로, PC 처럼 "바깥 창이 결과를 계속
 *   물어보는" 길을 쓸 수 없습니다. 물어볼 주체가 없어집니다.
 *
 *   그래서 넘어가기 직전에 여기에 표시를 남겨 두고, 손님이 다음에 우리
 *   사이트를 열 때 그 표시를 보고 한 번 확인합니다. (PaymentReturnWatch)
 *
 * ★★ 이 표시가 잡는 것은 다른 길이 못 잡는 경우입니다 —
 *   결제창에서 우리 서버로 돌아오는 요청이 아예 일어나지 않은 경우.
 *   카드 앱을 다녀오다 브라우저가 페이지를 버리거나 통신이 끊기면
 *   303 도 스크립트도 실행될 기회조차 없습니다.
 *
 * ★ sessionStorage 가 아니라 localStorage 입니다.
 *   카드 앱을 다녀오면 새 탭이 될 수 있는데, sessionStorage 는 탭마다
 *   따로라 그때 사라집니다.
 *
 * ★ 서명(k)을 함께 담습니다. 상태 창구가 그 값으로 본인 주문인지 봅니다.
 *   이 값은 이미 지금 보고 있는 주소에 들어 있는 것과 같은 값이라,
 *   여기 둔다고 새로 새어 나가는 것이 없습니다. 끝나면 지웁니다.
 *
 * ★ 저장·읽기가 실패해도 아무 일도 일어나지 않습니다. 안전망일 뿐이라
 *   결제 자체를 막지 않습니다.
 */

const KEY = 'jzl-pending-pay';

/** 이 시간이 지난 표시는 스스로 버립니다. 결제창도 그쯤이면 닫힙니다. */
export const PENDING_MAX_AGE_MS = 30 * 60 * 1000; // 30분

/**
 * 이 시간 안이면 "방금 결제하고 돌아온 것" 으로 보고 화면을 바로 옮깁니다.
 *
 * ★★ 이 선을 두는 이유
 *   30분 뒤에 손님이 그냥 구경하러 들어왔는데 화면이 갑자기 주문 완료로
 *   바뀌면 놀랍니다. 방금 돌아온 경우에만 옮기고, 그 뒤로는 작은 띠로
 *   알리기만 합니다. 손님이 누를지 말지 정합니다.
 */
export const AUTO_MOVE_WITHIN_MS = 3 * 60 * 1000; // 3분

export type PendingPayment = {
  /** 주문번호 */
  no: string;
  /** 주문 직후 발급한 서명 */
  k: string;
  /** 결제창으로 넘어간 시각 */
  at: number;
};

/** 결제창으로 넘어가기 직전에 남깁니다. */
export function markPendingPayment(orderNo: string, token: string): void {
  if (!orderNo || !token) return;
  try {
    const value: PendingPayment = { no: orderNo, k: token, at: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* 저장소를 못 쓰면 이 안전망만 없는 것입니다. 결제는 그대로 진행됩니다. */
  }
}

/**
 * 표시를 읽습니다.
 *
 * ★ 모양이 이상하거나 30분이 지났으면 지우고 null 을 돌려줍니다.
 *   낡은 표시가 남아 있으면 엉뚱한 주문으로 안내하게 됩니다.
 */
export function readPendingPayment(now = Date.now()): PendingPayment | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingPayment> | null;
    const no = typeof parsed?.no === 'string' ? parsed.no : '';
    const k = typeof parsed?.k === 'string' ? parsed.k : '';
    const at = typeof parsed?.at === 'number' ? parsed.at : 0;

    if (!no || !k || !at) {
      clearPendingPayment();
      return null;
    }
    if (now - at > PENDING_MAX_AGE_MS) {
      clearPendingPayment();
      return null;
    }
    return { no, k, at };
  } catch {
    return null;
  }
}

/** 결론이 났거나 낡았으면 지웁니다. */
export function clearPendingPayment(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 못 지워도 30분 뒤에 스스로 버려집니다. */
  }
}
