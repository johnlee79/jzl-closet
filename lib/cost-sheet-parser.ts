import * as XLSX from 'xlsx';
import {
  type ExcelProduct,
  extractSkus,
  normalizeExcelName,
  parseCostPrice,
} from '@/lib/cost-sheet';

/**
 * 55MB 뉴욕트렌딕 단가표를 **브라우저에서** 파싱합니다.
 *
 * ★ 서버로 보내지 않습니다 (명세 2번) — Vercel 함수 4.5MB 제한을 넘기도 하고 이미지 296장을
 *   서버로 올리는 건 낭비입니다. 매칭 화면이 이 결과를 **글자만** 서버에 전달합니다.
 *
 * ★ 1단계 범위 (사장님 지시 2026-10-06)
 *   상품명 첫 줄 · 품번 · 위탁가만 읽습니다. 색상/사이즈/수량/비고/실측은 **읽지 않습니다**.
 *   미래에 붙이기 쉽게 ExcelProduct 타입을 그대로 두고 지금은 세 자리만 채웁니다.
 *
 * ★ 머리말 위치가 시트마다 다릅니다 (긴팔재고 r4, 반팔재고 r3). 위치를 숫자로 박지 말고
 *   "위탁가" 와 "상품명" 글자가 같이 들어 있는 줄을 찾아 그 줄을 머리말로 씁니다.
 */

export type ParsedSheet = {
  name: string;
  skipped: boolean;
  reason?: string;
  products: ExcelProduct[];
};

export type ParsedWorkbook = {
  sheets: ParsedSheet[];
  totalProducts: number;
};

export async function parseExcelFile(file: File): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer();
  // cellDates: true 로 날짜 셀도 파싱되게. 1단계에선 날짜 안 쓰지만 미래 대비.
  // dense: true 는 메모리를 아낍니다 (대용량 파일).
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, dense: false });

  const sheets: ParsedSheet[] = [];
  for (const sheetName of wb.SheetNames) {
    sheets.push(parseSheet(sheetName, wb.Sheets[sheetName]));
  }
  const totalProducts = sheets.reduce((n, s) => n + s.products.length, 0);
  return { sheets, totalProducts };
}

/* ------------------------------------------------------------------
 * 한 시트 파싱
 * ------------------------------------------------------------------ */

function parseSheet(name: string, sheet: XLSX.WorkSheet): ParsedSheet {
  if (!sheet || !sheet['!ref']) {
    return { name, skipped: true, reason: '빈 시트', products: [] };
  }

  // 2D 배열로 변환
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as string[][];

  // 머리말 줄 찾기 — "위탁가" + "상품명" 둘 다 있는 줄
  let headerRow = -1;
  for (let i = 0; i < Math.min(15, rows.length); i += 1) {
    const row = rows[i] ?? [];
    if (
      row.some((c) => /위탁가/.test(String(c))) &&
      row.some((c) => /상품명/.test(String(c)))
    ) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) {
    return { name, skipped: true, reason: '머리말에서 「위탁가」와 「상품명」을 못 찾았습니다', products: [] };
  }

  // 머리말 글자로 열 번호 찾기 (명세: 숫자로 박지 말고 글자로)
  const header = rows[headerRow];
  const priceCol = header.findIndex((c) => /위탁가/.test(String(c)));
  const nameCol = header.findIndex((c) => /^상품명$/.test(String(c).trim()));
  if (priceCol < 0 || nameCol < 0) {
    return { name, skipped: true, reason: '위탁가/상품명 열 번호를 못 찾았습니다', products: [] };
  }

  // 병합 셀 해소 — 위탁가·상품명은 블록 단위로 병합되어 있음.
  // 상품명이 비어 있지 않은 "새 블록 시작" 줄만 상품으로 셉니다.
  const merges = sheet['!merges'] ?? [];
  resolveMergesInColumn(rows, merges, priceCol);
  resolveMergesInColumn(rows, merges, nameCol);

  const products: ExcelProduct[] = [];
  // 다음 "새 상품 시작" 을 알아보기 위한 트래킹
  let lastNameKey: string | null = null;

  for (let i = headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const nameCell = String(row[nameCol] ?? '').trim();
    if (!nameCell) {
      // 상품명이 비어 있으면 그냥 넘어감 (사이즈 줄 등)
      continue;
    }
    // 병합 해소 뒤에도 "같은 상품의 다른 색/사이즈 줄" 은 같은 상품명이 반복되어 들어옵니다.
    // 이전과 다른 상품명이 나올 때만 "새 상품" 으로 봅니다.
    if (nameCell === lastNameKey) continue;
    lastNameKey = nameCell;

    const priceCell = row[priceCol];
    const nameLines = nameCell
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const firstLine = nameLines[0] ?? '';
    const costPrice = parseCostPrice(priceCell);

    // 품번 — 상품명 전체에서 뽑되, 첫 줄 끝에 붙은 품번도 포함되게 전체 문자열에서 추출
    const nameSkus = extractSkus(nameCell);

    products.push({
      rowStart: i,
      sheet: name,
      name: firstLine,
      nameSkus,
      normalizedName: normalizeExcelName(firstLine),
      costPrice,
    });
  }

  return { name, skipped: false, products };
}

/* ------------------------------------------------------------------
 * 병합 셀을 특정 열에서만 해소
 * ------------------------------------------------------------------ */

function resolveMergesInColumn(
  rows: string[][],
  merges: XLSX.Range[],
  col: number
): void {
  for (const m of merges) {
    if (m.s.c > col || m.e.c < col) continue;
    const v = rows[m.s.r]?.[col];
    if (v === undefined || v === null || v === '') continue;
    for (let r = m.s.r + 1; r <= m.e.r; r += 1) {
      if (!rows[r]) rows[r] = [];
      if (!rows[r][col]) rows[r][col] = v;
    }
  }
}
