import { courierName, resolveCourier } from '@/lib/couriers';

/**
 * 송장번호 일괄 등록 — 붙여넣은 글이나 CSV 를 줄 단위로 읽습니다.
 * 순수 함수만 두어 서버·클라이언트 어디서나 씁니다.
 *
 * 인식 형식 (콤마 또는 탭으로 나눔, 줄바꿈으로 여러 건)
 *   ORD-20260814-0001, CJ대한통운, 123456789012
 *   ORD-20260814-0002	한진	987654321098
 *
 * 순서가 뒤바뀌어 와도 알아봅니다.
 *   · ORD- 로 시작하는 칸을 주문번호로
 *   · 택배사 표에서 알아본 칸을 택배사로
 *   · 남은 칸 중 숫자가 8자 이상인 것을 송장번호로
 */

export type ParsedTrackingRow = {
  /** 원본 줄 번호 (1부터). 오류를 알려 줄 때 씁니다. */
  line: number;
  /** 원본 그대로 — 화면에 다시 보여 줍니다. */
  raw: string;
  orderNo: string;
  /** 사람이 적어 넣은 택배사 이름 */
  courierInput: string;
  /** 표를 거쳐 알아낸 내부 코드. 못 알아보면 빈 문자열 */
  courierCode: string;
  trackingNo: string;
  /** 형식 자체가 잘못됐을 때의 사유 */
  parseError: string;
};

/** 주문번호처럼 보이는가 */
const ORDER_NO_PATTERN = /^ORD-\d{8}-\d{3,}$/i;

/** CSV 한 줄을 칸으로 나눕니다. 따옴표로 감싼 칸을 지원합니다. */
function splitCells(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        // "" 는 따옴표 한 개를 뜻합니다.
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',' || char === '\t' || char === ';') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);

  return cells.map((cell) => cell.trim()).filter((cell) => cell.length > 0);
}

/** 머리글 줄인가 — "주문번호,택배사,송장번호" 같은 줄은 건너뜁니다. */
function isHeaderLine(cells: string[]): boolean {
  const joined = cells.join('').toLowerCase();
  return (
    /주문번호|orderno|order_no/.test(joined) &&
    /송장|tracking|운송장/.test(joined)
  );
}

/** 숫자만 남긴 길이 */
function digitCount(value: string): number {
  return value.replace(/[^0-9]/g, '').length;
}

/**
 * 붙여넣은 글 전체를 줄 단위로 읽습니다.
 * 빈 줄과 머리글 줄은 건너뜁니다.
 */
export function parseTrackingText(text: string): ParsedTrackingRow[] {
  // 엑셀에서 저장한 CSV 는 맨 앞에 BOM 이 붙습니다.
  const cleaned = text.replace(/^﻿/, '');
  const rows: ParsedTrackingRow[] = [];

  const lines = cleaned.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim()) continue;

    const cells = splitCells(raw);
    if (cells.length === 0) continue;
    if (rows.length === 0 && isHeaderLine(cells)) continue;

    const row: ParsedTrackingRow = {
      line: index + 1,
      raw: raw.trim(),
      orderNo: '',
      courierInput: '',
      courierCode: '',
      trackingNo: '',
      parseError: '',
    };

    const rest: string[] = [];

    // 1) 주문번호 찾기
    for (const cell of cells) {
      if (!row.orderNo && ORDER_NO_PATTERN.test(cell)) {
        row.orderNo = cell.toUpperCase();
      } else {
        rest.push(cell);
      }
    }

    // 2) 남은 칸에서 택배사 찾기
    const afterCourier: string[] = [];
    for (const cell of rest) {
      if (!row.courierCode) {
        const code = resolveCourier(cell);
        if (code) {
          row.courierInput = cell;
          row.courierCode = code;
          continue;
        }
      }
      afterCourier.push(cell);
    }

    // 3) 남은 칸 중 숫자가 8자 이상인 것을 송장번호로
    for (const cell of afterCourier) {
      if (!row.trackingNo && digitCount(cell) >= 8) {
        row.trackingNo = cell.replace(/[^0-9A-Za-z]/g, '');
        continue;
      }
      // 택배사를 못 알아봤다면 남은 글자를 택배사 입력으로 남겨 안내에 씁니다.
      if (!row.courierCode && !row.courierInput) row.courierInput = cell;
    }

    if (!row.orderNo) {
      row.parseError = '주문번호를 찾지 못했습니다. (ORD-20260814-0001 형식)';
    } else if (!row.trackingNo) {
      row.parseError = '송장번호를 찾지 못했습니다. (숫자 8자 이상)';
    } else if (!row.courierCode) {
      row.parseError = row.courierInput
        ? `택배사를 알아보지 못했습니다: ${row.courierInput}`
        : '택배사가 없습니다.';
    }

    rows.push(row);
  }

  return rows;
}

/** 미리보기 표에 쓰는 매칭 결과 */
export type TrackingMatchStatus = 'ok' | 'not_found' | 'already' | 'invalid';

export type TrackingMatchRow = ParsedTrackingRow & {
  status: TrackingMatchStatus;
  /** 매칭된 주문 */
  orderId: string;
  ordererName: string;
  orderStatus: string;
  /** 이미 등록되어 있던 송장 */
  currentCourier: string;
  currentTrackingNo: string;
  message: string;
};

export const MATCH_LABEL: Record<TrackingMatchStatus, string> = {
  ok: '매칭 성공',
  not_found: '주문번호 없음',
  already: '이미 송장 있음',
  invalid: '형식 오류',
};

export const MATCH_BADGE: Record<TrackingMatchStatus, string> = {
  ok: 'bg-green-100 text-green-800',
  not_found: 'bg-red-100 text-red-700',
  already: 'bg-amber-100 text-amber-800',
  invalid: 'bg-slate-200 text-slate-700',
};

/** 미리보기 표에 보여 줄 택배사 이름 */
export function matchCourierName(row: ParsedTrackingRow): string {
  return row.courierCode ? courierName(row.courierCode) : row.courierInput;
}
