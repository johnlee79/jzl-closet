import { DEFAULT_STORE, type StoreSettings } from '@/lib/site-config';

/**
 * ================================================================
 * ** 지금 상담이 되는지 판단합니다 (2-B, 2026-08-27)
 * ================================================================
 *
 * ** 브라우저에서 판단합니다. 서버에서 하지 않습니다.
 *   손님 화면(/products · /category/… )은 미리 구워 두는 정적 화면입니다.
 *   서버에서 판단하면 **구울 때의 시각이 그대로 박혀서**, 새벽에 구운
 *   화면이 온종일 "오늘 상담은 끝났습니다" 를 보여 줍니다.
 *   설정 숫자만 화면에 실어 보내고, 판단은 손님 브라우저에서 그때그때
 *   합니다. 그래서 정적 생성을 하나도 건드리지 않습니다.
 *
 * ** 손님 기기의 시간대와 상관없이 **한국 시간**으로 봅니다.
 *   Intl 로 서울 기준 요일·시각을 뽑습니다. 해외에서 접속해도 같습니다.
 *
 * ** 여기는 순수한 계산만 합니다. 화면도 DB 도 건드리지 않습니다.
 *   그래서 시각을 넣어 주면 그대로 시험할 수 있습니다.
 *
 * ** ★ 설정 칸이 비어 있어도 절대 터지지 않게 합니다.
 *   설정값은 unstable_cache 로 통째로 저장됩니다. 새 칸을 만들어 올려도,
 *   **저장해 둔 옛날 덩어리에는 그 칸이 없습니다.** 실제로 여기서 한 번
 *   터졌습니다. (2026-08-27, store.holidays 가 undefined)
 *   이 위젯은 손님 화면 전체를 감싸는 레이아웃 안에 있어서, 여기서 터지면
 *   **상품 화면 자체가 오류 화면으로 바뀝니다.** 그래서 칸이 없으면 조용히
 *   기본값으로 갑니다.
 * ================================================================
 */

export type BusinessState = 'open' | 'lunch' | 'closed' | 'holiday';

export type BusinessNow = {
  state: BusinessState;
  /** 채팅 첫 인사 아래에 한 줄로 붙는 말 */
  message: string;
  /** 전화가 지금 연결되는 시간인지 */
  canCall: boolean;
};

/** 서울 기준 '연-월-일' 과 '0시부터 몇 시간 지났는지' */
function seoulParts(now: Date): { day: number; hour: number; date: string } {
  /*
   * ** 서울 시각을 문자열로 뽑아 다시 읽습니다.
   *   기기의 시간대 설정과 무관해집니다.
   *   en-CA 로 뽑으면 날짜가 YYYY-MM-DD 로 나옵니다.
   */
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((part) => [part.type, part.value])
  ) as Record<string, string>;

  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // ** 자정은 '24' 로 나오는 기기가 있습니다. 0 으로 맞춥니다.
  const rawHour = Number(parts.hour);
  const hour = (rawHour === 24 ? 0 : rawHour) + Number(parts.minute) / 60;

  return {
    day: weekdays[parts.weekday] ?? 0,
    hour,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** '9' → '09:00' · '12.5' → '12:30' */
export function clockLabel(value: number): string {
  const hour = Math.floor(value);
  const minute = Math.round((value - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 쉬는 날 한 줄을 날짜 목록으로. 잘못 적은 것은 조용히 버립니다. */
function holidaySet(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[,\n]/)
      .map((piece) => piece.trim())
      .filter((piece) => /^\d{4}-\d{2}-\d{2}$/.test(piece))
  );
}

/**
 * 지금 상담이 되는지.
 *
 * @param store 관리자 설정
 * @param now   시험할 때 시각을 넣습니다. 안 넣으면 지금입니다.
 */
export function businessNow(store: StoreSettings, now: Date = new Date()): BusinessNow {
  const { day, hour, date } = seoulParts(now);

  /*
   * ** 칸이 없거나 숫자가 아니면 기본값으로 갑니다. 위의 ★ 를 보세요.
   *   여기서 터지면 손님 화면 전체가 오류 화면이 됩니다.
   */
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  const holidays = typeof store?.holidays === 'string' ? store.holidays : DEFAULT_STORE.holidays;

  const closedMessage =
    '오늘 상담은 끝났습니다. 문의를 남겨 주시면 다음 영업일에 답변드립니다.';

  /* ── 쉬는 날 ─────────────────────────────────────────── */
  if (day === 0 || holidaySet(holidays).has(date)) {
    return {
      state: 'holiday',
      message: '오늘은 쉽니다. 문의를 남겨 주시면 다음 영업일에 답변드립니다.',
      canCall: false,
    };
  }

  /* ── 오늘의 상담 시간 ────────────────────────────────── */
  const open =
    day === 6
      ? num(store?.saturdayOpen, DEFAULT_STORE.saturdayOpen)
      : num(store?.weekdayOpen, DEFAULT_STORE.weekdayOpen);
  const close =
    day === 6
      ? num(store?.saturdayClose, DEFAULT_STORE.saturdayClose)
      : num(store?.weekdayClose, DEFAULT_STORE.weekdayClose);

  /*
   * ** 시작과 끝이 뒤집혀 있으면 '오늘은 안 함' 으로 봅니다.
   *   설정을 잘못 넣었을 때 종일 "상담 가능" 이 뜨는 것보다 낫습니다.
   */
  if (!(close > open)) {
    return { state: 'closed', message: closedMessage, canCall: false };
  }

  if (hour < open || hour >= close) {
    return { state: 'closed', message: closedMessage, canCall: false };
  }

  /* ── 점심 ────────────────────────────────────────────── */
  const lunchStart = num(store?.lunchStart, DEFAULT_STORE.lunchStart);
  const lunchEnd = num(store?.lunchEnd, DEFAULT_STORE.lunchEnd);
  if (lunchEnd > lunchStart && hour >= lunchStart && hour < lunchEnd) {
    return {
      state: 'lunch',
      message: `지금은 점심시간입니다 (${clockLabel(lunchStart)}~${clockLabel(lunchEnd)}). 문의를 남겨 주시면 오후에 답변드립니다.`,
      canCall: false,
    };
  }

  return { state: 'open', message: '지금 상담 가능합니다', canCall: true };
}

/**
 * 화면에 보여 줄 상담 시간 한 줄.
 *
 * ** 관리자가 적어 둔 hours 글자를 그대로 씁니다.
 *   숫자 칸으로 문장을 만들어 내면, 관리자가 적은 글과 화면에 뜨는 글이
 *   두 벌이 되어 나중에 어긋납니다. 숫자는 판단에만 씁니다.
 */
export function hoursLabel(store: StoreSettings): string {
  return store.hours;
}
