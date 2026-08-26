/**
 * ** 날짜 두 함수를 여기 둡니다. (2026-08-27)
 *   전에는 lib/orders.ts 에 있었는데, 그 파일은 'server-only' 라
 *   클라이언트 컴포넌트(StatsRange)가 이 파일을 쓰면 빌드가 깨집니다.
 *   순수한 날짜 계산이라 서버·브라우저 어디서 돌아도 같습니다.
 *
 * ** lib/orders.ts 가 여기서 다시 내보냅니다. 정의는 이 한 곳뿐입니다.
 *   두 벌로 두면 한쪽만 고쳤을 때 기간이 어긋납니다.
 */

/** 오늘 한국 날짜 (YYYY-MM-DD) */
export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** n일 전 한국 날짜 */
export function kstDaysAgo(days: number, now = new Date()): string {
  return kstToday(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

/**
 * ================================================================
 * ** 관리자 화면의 기간 선택 — 한 곳에서 정합니다 (2026-08-27)
 * ================================================================
 *
 * ** 통계 화면과 수익 관리 화면이 같은 것을 씁니다.
 *   전에는 이 함수가 통계 화면 안에만 있었습니다. 수익 화면을 만들면서
 *   복사했다면, 한쪽만 고쳐도 두 화면이 다른 기간을 보게 됩니다.
 *   "매출 기준이 두 곳에 있어서 숫자가 달랐다" 는 일이 이미 있었습니다.
 *
 * ** 기준 시각은 한국 시간입니다.
 *   kstToday / kstDaysAgo 가 UTC 에 9시간을 더해 날짜를 뽑습니다.
 *   그 날짜를 kstStart / kstEnd 가 다시 한국 시간 00:00~23:59 로 만듭니다.
 *
 * * '전일' 은 이번에 새로 넣었습니다. 통계 화면에도 함께 생깁니다.
 * ================================================================
 */

export type RangePreset = {
  key: string;
  label: string;
};

/**
 * 화면 위에 늘어놓는 버튼들.
 *
 * ** 순서가 곧 읽는 순서입니다. 좁은 것에서 넓은 것으로 둡니다.
 *   당일 → 전일 → 1주일 → 당월 → 전월
 */
export const RANGE_PRESETS: RangePreset[] = [
  { key: 'today', label: '당일' },
  { key: 'yesterday', label: '전일' },
  { key: '7d', label: '1주일' },
  { key: 'month', label: '당월' },
  { key: 'lastMonth', label: '전월' },
];

export type RangeParams = { from?: string; to?: string; preset?: string };

export type ResolvedRange = { from: string; to: string; preset: string };

/**
 * preset 이름 → 실제 기간.
 *
 * @param params 주소에서 읽은 값
 * @param fallback preset 도 from/to 도 없을 때 무엇으로 볼지.
 *   ** 수익 관리는 '당일' 이 기본입니다. (사장님 지시)
 *   ** 통계 화면은 지금까지 '7일' 이 기본이었습니다. 바꾸지 않습니다.
 */
export function resolveRange(params: RangeParams, fallback = 'today'): ResolvedRange {
  const today = kstToday();
  const preset = params.preset ?? (params.from || params.to ? 'custom' : fallback);

  if (preset === 'custom' && (params.from || params.to)) {
    return { from: params.from ?? today, to: params.to ?? today, preset: 'custom' };
  }

  const [year, month] = today.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');

  switch (preset) {
    case 'today':
      return { from: today, to: today, preset };

    /*
     * ** 전일은 어제 하루만 봅니다. from 과 to 가 둘 다 어제입니다.
     *   "어제부터 오늘까지" 가 아닙니다. 어제 장사가 어땠는지 보는 것입니다.
     */
    case 'yesterday': {
      const day = kstDaysAgo(1);
      return { from: day, to: day, preset };
    }

    case '7d':
      // 오늘을 포함해 7일입니다. (6일 전 ~ 오늘)
      return { from: kstDaysAgo(6), to: today, preset };

    case '30d':
      return { from: kstDaysAgo(29), to: today, preset };

    case 'month':
      return { from: `${year}-${pad(month)}-01`, to: today, preset };

    case 'lastMonth': {
      const lastYear = month === 1 ? year - 1 : year;
      const last = month === 1 ? 12 : month - 1;
      const start = `${lastYear}-${pad(last)}-01`;
      // 이번 달 1일의 하루 전이 지난 달 마지막 날입니다.
      const end = new Date(
        new Date(`${year}-${pad(month)}-01T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 10);
      return { from: start, to: end, preset };
    }

    default:
      // 모르는 preset 이면 기본으로 돌립니다.
      return resolveRange({}, fallback === preset ? 'today' : fallback);
  }
}
