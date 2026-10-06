/**
 * 뉴욕트렌딕 단가표 엑셀 ↔ 우리 상품 매칭에 쓰는 순수 함수들.
 *
 * ★ 이 모듈은 'server-only' 가 아닙니다.
 *   브라우저에서 55MB 엑셀을 읽기 때문에 (명세 2번), 같은 함수를 서버·브라우저 양쪽에서
 *   씁니다. DB 접근은 하지 않습니다.
 *
 * ★ 다음 단계(색상·사이즈 매칭·품절 제안·실측·월 비교)를 붙이기 쉽게 짚어 둔 자리:
 *   · parseExcelProduct 가 돌려주는 ExcelProduct 에 colors / notes / measurements 자리를
 *     이미 비워 두었습니다.
 *   · matchByRemembered / matchBySku / matchByName 세 단계로 분리해 두어
 *     다음 단계에서 색상 매칭 단계를 추가할 때 끼워 넣기 쉽습니다.
 */

/* ------------------------------------------------------------------
 * 타입
 * ------------------------------------------------------------------ */

export type ExcelProduct = {
  /** 시트 안의 몇 번째 행에서 시작했는지 (디버그·검증용) */
  rowStart: number;
  sheet: string;
  /** 사람이 보는 상품명 — 상품명 칸의 첫 줄 */
  name: string;
  /** 상품명 칸 안쪽에서 뽑은 품번들 (영문숫자 코드로 보이는 줄들) */
  nameSkus: string[];
  /** 정규화한 상품명 — DB 저장용 열쇠 (normalizeExcelName) */
  normalizedName: string;
  /** 원가 (부가세 포함) — 못 읽으면 null */
  costPrice: number | null;
  /**
   * 엑셀의 상품 사진 — 브라우저 메모리 안에 blob URL 로 보관.
   * ★ 서버로 보내지 않습니다 (명세 2번). 매칭 화면에 "엑셀 사진 ↔ 우리 사진" 나란히 보여줄 때만.
   */
  imageDataUrl?: string | null;
};

export type ExcelSheet = {
  name: string;
  rowCount: number;
  products: ExcelProduct[];
  /** 머리말을 못 찾은 시트는 skipped=true 로 둬서 UI 에서 안내 */
  skipped: boolean;
  reason?: string;
};

/* ------------------------------------------------------------------
 * 상품명 정규화 — 매칭 기억의 열쇠
 *
 * 명세 5-① "정리 방법   첫 줄만 · 공백 제거 · 앞뒤 기호 제거 · 대소문자 통일"
 *
 * ★ 이 함수의 결과가 DB 의 excel_product_match.normalized_name 과 짝입니다.
 *   한 글자라도 다르면 다음 달 매칭이 안 됩니다. **바꾸면 안 됩니다** (바꿔야 하면
 *   기존 기록도 다시 정규화해야 합니다).
 * ------------------------------------------------------------------ */
export function normalizeExcelName(name: string): string {
  if (!name) return '';
  const firstLine = String(name).split(/\r?\n/)[0] ?? '';
  return firstLine
    .toLowerCase()
    .trim()
    // 앞뒤 기호 제거
    .replace(/^[\s\-·,·.;:*#]+|[\s\-·,·.;:*#]+$/g, '')
    // 중간 공백 제거 (명세: 공백 제거)
    .replace(/\s+/g, '');
}

/* ------------------------------------------------------------------
 * 품번 뽑기 — 상품명 칸·색상 칸에서
 *
 * 품번은 영문 대문자 + 숫자 + 가끔 "." · "-" 가 섞인 토큰입니다.
 * 예) BFUSW001.730 · 118578 · 211891672007 · AX-T164 · USW787-730
 *
 * ★ 숫자만 있는 토큰(순수 색상코드) 은 품번일 수도 아닐 수도 있어, **4자 이상 숫자**이면
 *   받아 들입니다. 짧은 숫자(S사이즈의 "95" 같은)는 뺍니다.
 * ------------------------------------------------------------------ */
export function extractSkus(text: string): string[] {
  if (!text) return [];
  const skus: string[] = [];
  const seen = new Set<string>();
  // 영문·숫자·".-_" 섞인 토큰, 숫자 4자리 이상
  // ★ matchAll 반환값을 바로 for-of 하면 이 프로젝트 target(ES2017)에서 깨집니다.
  //   exec 루프로 돕니다 (lib/sellstar.ts 와 같은 요령).
  const re = /[A-Z0-9][A-Z0-9.\-_/]{3,20}[A-Z0-9]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const sku = match[0];
    // 순수 숫자인데 4자 미만은 뺍니다 (사이즈·수량과 혼동)
    if (/^\d+$/.test(sku) && sku.length < 4) continue;
    // 흔한 비-품번 패턴 거르기 (VAT · ₩ 등)
    if (/^(VAT|TODAY|SUM|KRW)$/i.test(sku)) continue;
    if (seen.has(sku)) continue;
    seen.add(sku);
    skus.push(sku);
  }
  return skus;
}

/* ------------------------------------------------------------------
 * 원가 (위탁가) 숫자만 뽑기 — "₩53,000" · "53000" · "  53,000원  " 다 받습니다.
 * ------------------------------------------------------------------ */
export function parseCostPrice(cell: unknown): number | null {
  if (cell === null || cell === undefined || cell === '') return null;
  if (typeof cell === 'number' && Number.isFinite(cell)) return Math.round(cell);
  const digits = String(cell).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------------
 * 브랜드 줄임말 매칭
 *
 * ★ DB 의 brand_aliases 를 그대로 받아 "매칭" 함수에 넣어 씁니다.
 *   코드 안에 브랜드 표를 박지 않습니다 (명세: 사장님이 관리자에서 추가 가능).
 * ------------------------------------------------------------------ */

export type BrandAlias = { alias: string; brandSlug: string | null };

/** 상품명에서 맨 앞 토큰을 떼어 알리아스 테이블과 대조합니다. */
export function matchBrandAlias(
  productName: string,
  aliases: BrandAlias[]
): { brandSlug: string | null; alias: string | null; unsupported: boolean } {
  const trimmed = productName.replace(/^new\s+/i, '').trim();
  // 가장 긴 알리아스 먼저 시도 — "스투시" · "폴로" · "꼼데가르송" 처럼 긴 것부터
  const sorted = [...aliases].sort((a, b) => b.alias.length - a.alias.length);
  for (const a of sorted) {
    const re = new RegExp(
      '^' + a.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s(.·\\-]|$)',
      'i'
    );
    if (re.test(trimmed)) {
      return {
        brandSlug: a.brandSlug,
        alias: a.alias,
        unsupported: a.brandSlug === null,
      };
    }
  }
  return { brandSlug: null, alias: null, unsupported: false };
}

/* ------------------------------------------------------------------
 * 이름 유사도 — 같은 브랜드 안에서 "비슷한 상품 3개" 고를 때
 *
 * 명세 5-③. 같은 말 묶기 (맨투맨=스웨트셔츠=크루넥 등) 를 먼저 통일한 뒤
 * 글자 겹침 비율로 재킵니다. 간단하지만 상품 100~200개 수준에서 충분합니다.
 * ------------------------------------------------------------------ */

const SYNONYMS: [RegExp, string][] = [
  [/맨투맨|스웨트\s*셔츠|크루넥|crew\s*neck|sweat\s*shirt/gi, '맨투맨'],
  [/반팔(?:티)?|티셔츠|t\s*shirt|short\s*sleeve|숏슬리브|숏\s*슬리브/gi, '반팔'],
  [/긴팔|롱슬리브|롱\s*슬리브|long\s*sleeve/gi, '긴팔'],
  [/후드티|후디|hoodie/gi, '후드'],
  [/후드\s*집업|후드집업|풀집업|zip\s*up|zip\s*hoodie/gi, '후드집업'],
  [/카라\s*티|pk|피케|polo\s*shirt/gi, '카라티'],
  [/가디건|카디건|cardigan/gi, '가디건'],
  [/니트|스웨터|sweater|knit/gi, '니트'],
  [/\(기모\)|\s*기모\s*/gi, '기모'],
];

export function foldForSimilarity(name: string): string {
  let out = (name ?? '').toLowerCase();
  for (const [re, replacement] of SYNONYMS) out = out.replace(re, replacement);
  return out.replace(/[\s\-·()[\]{}]+/g, '');
}

/** Jaccard 유사도 — 글자 2-그램 겹침 비율 (0~1) */
export function similarity(a: string, b: string): number {
  const sa = ngrams(foldForSimilarity(a));
  const sb = ngrams(foldForSimilarity(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let hit = 0;
  for (const t of Array.from(sa)) if (sb.has(t)) hit += 1;
  const union = sa.size + sb.size - hit;
  return union === 0 ? 0 : hit / union;
}

function ngrams(s: string, n = 2): Set<string> {
  const out = new Set<string>();
  if (s.length < n) {
    if (s.length > 0) out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - n; i += 1) out.add(s.slice(i, i + n));
  return out;
}
