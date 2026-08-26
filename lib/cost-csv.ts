/**
 * ================================================================
 * ** 원가 CSV 읽기 (2026-08-27)
 * ================================================================
 *
 * 일하는 순서 (사장님 확정)
 *   ① 관리자에서 「상품 CSV 내보내기」로 53줄짜리 파일을 받는다
 *   ② 엑셀에서 맨 오른쪽에 「원가」 열을 만들고 뉴욕 단가표를 보고 채운다
 *   ③ 그 파일을 그대로 올린다
 *
 * ** slug 로 짝짓습니다.
 *   상품명은 띄어쓰기 하나만 달라도 못 찾고, 같은 이름이 둘일 수도 있습니다.
 *   slug 는 DB 에서 유일하고 내보내기 파일 첫 칸이라 손댈 일이 없습니다.
 *
 * ** 상품명은 확인용으로만 씁니다.
 *   파일의 상품명이 실제 상품명과 다르면 경고만 합니다. 막지 않습니다.
 *   엉뚱한 줄에 원가를 넣는 사고를 막는 안전장치입니다.
 *
 * ** 열 이름으로 찾습니다. 순서와 개수는 상관없습니다.
 *   내보내기 파일 22개 열에 「원가」 하나만 더한 것도 그대로 받습니다.
 *   모르는 열은 전부 무시합니다.
 *
 * ** 라이브러리를 쓰지 않습니다.
 *   내보내기 쪽(app/api/admin/export/*)도 문자열로 직접 만듭니다.
 *   같은 방식으로 맞춥니다.
 * ================================================================
 */

/** 짝짓기 열로 받아들이는 이름 */
const SLUG_HEADERS = ['slug', '상품코드'];
/** 원가 열로 받아들이는 이름 */
const COST_HEADERS = ['원가', '매입가', 'cost', 'cost_price'];
/** 확인용 상품명 열 */
const NAME_HEADERS = ['상품명', 'name'];

export type CostRow = {
  /** 파일에서 몇 번째 줄인지 (머리글을 1줄로 셉니다. 사람이 보는 번호) */
  line: number;
  slug: string;
  costPrice: number;
  /** 파일에 적힌 상품명 (있으면) */
  nameInFile: string;
};

export type CostProblem = {
  line: number;
  slug: string;
  raw: string;
  reason: string;
};

export type CostCsvParsed = {
  /** 읽어들인 데이터 줄 수 (머리글 제외) */
  totalLines: number;
  rows: CostRow[];
  /** 원가 칸이 비어 건너뛴 줄 */
  skipped: CostProblem[];
  /** 형식이 잘못된 줄 */
  problems: CostProblem[];
  /** 파일 자체가 잘못됐을 때 */
  fatal: string | null;
};

/**
 * CSV 한 줄을 칸으로 나눕니다.
 *
 * ** 큰따옴표 안의 콤마와 줄바꿈을 지킵니다.
 *   상품명에 콤마가 들어 있는 경우가 실제로 있습니다.
 *   ("아미 AMI, 하트 자수" 같은 이름)
 */
function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        // 따옴표 두 개는 따옴표 한 글자입니다.
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  // 마지막 줄에 줄바꿈이 없을 수 있습니다.
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 열 이름을 견주기 좋게 다듬습니다. */
function normalizeHeader(value: string): string {
  return value.replace(/^﻿/, '').trim().toLowerCase();
}

/**
 * 금액 글자를 숫자로.
 *
 * 52000 · 52,000 · "52,000" · ₩52,000 을 전부 같게 읽습니다.
 * ** 빈칸과 0 은 다릅니다. 빈칸은 여기서 null 을 돌려주고,
 *   부르는 쪽이 "건너뜀" 으로 처리합니다. 0 은 진짜 0원입니다.
 */
function parseMoney(raw: string): { value: number | null; error: string | null } {
  const text = raw.replace(/[₩,\s]/g, '').trim();
  if (!text) return { value: null, error: null };

  const num = Number(text);
  if (!Number.isFinite(num)) {
    return { value: null, error: '숫자가 아닙니다' };
  }
  if (num < 0) {
    return { value: null, error: '음수는 넣을 수 없습니다' };
  }
  if (num > 100_000_000) {
    return { value: null, error: '1억원을 넘습니다. 자릿수를 확인해 주세요' };
  }
  // 소수점은 반올림합니다. 원 단위 아래는 뜻이 없습니다.
  return { value: Math.round(num), error: null };
}

export function parseCostCsv(text: string): CostCsvParsed {
  const empty: CostCsvParsed = {
    totalLines: 0,
    rows: [],
    skipped: [],
    problems: [],
    fatal: null,
  };

  const grid = splitCsv(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (grid.length === 0) {
    return { ...empty, fatal: '파일이 비어 있습니다.' };
  }

  const headers = grid[0].map(normalizeHeader);
  const slugAt = headers.findIndex((h) => SLUG_HEADERS.includes(h));
  const costAt = headers.findIndex((h) => COST_HEADERS.includes(h));
  const nameAt = headers.findIndex((h) => NAME_HEADERS.includes(h));

  if (slugAt === -1) {
    return {
      ...empty,
      fatal: `첫 줄에서 slug 열을 찾지 못했습니다. 열 이름이 ${SLUG_HEADERS.join(' 또는 ')} 이어야 합니다.`,
    };
  }
  if (costAt === -1) {
    return {
      ...empty,
      fatal: `첫 줄에서 원가 열을 찾지 못했습니다. 열 이름이 ${COST_HEADERS.join(' 또는 ')} 중 하나여야 합니다.`,
    };
  }

  const rows: CostRow[] = [];
  const skipped: CostProblem[] = [];
  const problems: CostProblem[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < grid.length; i += 1) {
    const line = i + 1; // 사람이 보는 줄 번호 (엑셀과 같게)
    const cells = grid[i];
    const slug = (cells[slugAt] ?? '').trim();
    const raw = (cells[costAt] ?? '').trim();
    const nameInFile = nameAt === -1 ? '' : (cells[nameAt] ?? '').trim();

    if (!slug) {
      problems.push({ line, slug: '', raw, reason: 'slug 칸이 비어 있습니다' });
      continue;
    }

    const money = parseMoney(raw);
    if (money.error) {
      problems.push({ line, slug, raw, reason: money.error });
      continue;
    }
    if (money.value === null) {
      // ** 빈칸은 건너뜁니다. 이미 넣어 둔 원가를 지우지 않습니다.
      skipped.push({ line, slug, raw, reason: '원가 칸이 비어 있어 건너뜁니다' });
      continue;
    }

    /*
     * ** 같은 slug 가 두 번 나오면 뒤엣것을 씁니다.
     *   조용히 덮어쓰지 않고 알려 줍니다. 파일이 잘못됐을 수 있습니다.
     */
    const before = seen.get(slug);
    if (before !== undefined) {
      problems.push({
        line,
        slug,
        raw,
        reason: `${before}번째 줄과 같은 slug 입니다. 뒤엣것으로 저장합니다`,
      });
      const at = rows.findIndex((row) => row.slug === slug);
      if (at >= 0) rows.splice(at, 1);
    }
    seen.set(slug, line);
    rows.push({ line, slug, costPrice: money.value, nameInFile });
  }

  return {
    totalLines: grid.length - 1,
    rows,
    skipped,
    problems,
    fatal: null,
  };
}
