'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import { parseCostCsv, type CostProblem } from '@/lib/cost-csv';
import { getProducts, setCostPrices } from '@/lib/products';

/**
 * ================================================================
 * ** 원가 CSV 올리기 (2026-08-27)
 * ================================================================
 *
 * ** 두 단계입니다. 올린다고 바로 저장하지 않습니다.
 *   ① previewCostCsvAction — 읽고 짝지어 보여만 줍니다. DB 를 안 건드립니다.
 *   ② applyCostCsvAction   — 사장님이 확인 버튼을 누르면 그때 저장합니다.
 *
 *   원가는 한 번 덮어쓰면 이전 값을 알 수 없습니다. 눈으로 보고
 *   "50줄 저장하기" 를 누르게 하는 편이 안전합니다.
 *
 * ** 상품 정보를 통째로 덮어쓰지 않습니다. cost_price 한 칸만 씁니다.
 *   CSV 에 옛 판매가가 들어 있어도 상품이 망가지지 않습니다.
 *   (lib/products.ts 의 setCostPrices)
 * ================================================================
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CostMatch = {
  line: number;
  slug: string;
  costPrice: number;
  /** DB 에 있는 상품명 */
  productName: string;
  /** 지금 저장되어 있는 원가 (없으면 null) */
  before: number | null;
  /** 파일의 상품명이 DB 와 달라 확인이 필요한지 */
  nameMismatch: boolean;
  nameInFile: string;
};

export type CostPreview = {
  totalLines: number;
  matched: CostMatch[];
  notFound: CostProblem[];
  problems: CostProblem[];
  skipped: CostProblem[];
};

/** ① 읽고 짝지어 보여 주기 — 아무것도 저장하지 않습니다. */
export async function previewCostCsvAction(text: string): Promise<ActionResult<CostPreview>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = parseCostCsv(text);
  if (parsed.fatal) return { ok: false, error: parsed.fatal };

  /*
   * ** 숨긴 상품도 함께 봅니다. (includeHidden)
   *   숨겨 둔 상품에도 원가는 넣을 수 있어야 합니다.
   */
  const products = await getProducts({ includeHidden: true, light: true });
  const bySlug = new Map(products.map((product) => [product.slug, product]));

  const matched: CostMatch[] = [];
  const notFound: CostProblem[] = [];

  for (const row of parsed.rows) {
    const product = bySlug.get(row.slug);
    if (!product) {
      notFound.push({
        line: row.line,
        slug: row.slug,
        raw: String(row.costPrice),
        reason: '그런 slug 의 상품이 없습니다. 오타이거나 지워진 상품입니다',
      });
      continue;
    }
    matched.push({
      line: row.line,
      slug: row.slug,
      costPrice: row.costPrice,
      productName: product.name,
      before: product.costPrice,
      /*
       * ** 상품명이 다르면 알려만 줍니다. 막지 않습니다.
       *   엉뚱한 줄에 원가를 넣는 사고를 막는 안전장치입니다.
       */
      nameMismatch: Boolean(row.nameInFile) && row.nameInFile !== product.name,
      nameInFile: row.nameInFile,
    });
  }

  return {
    ok: true,
    data: {
      totalLines: parsed.totalLines,
      matched,
      notFound,
      problems: parsed.problems,
      skipped: parsed.skipped,
    },
  };
}

/** ② 저장 — 미리보기에서 확인한 것만 넣습니다. */
export async function applyCostCsvAction(
  rows: { slug: string; costPrice: number }[]
): Promise<ActionResult<{ saved: number }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (rows.length === 0) return { ok: false, error: '저장할 줄이 없습니다.' };

  const result = await setCostPrices(rows);
  if (result.error) {
    // 몇 줄까지 저장됐는지 함께 알려 줍니다. 조용히 실패하지 않습니다.
    return {
      ok: false,
      error: `${result.error} (${result.saved}줄까지 저장되었습니다)`,
    };
  }

  revalidatePath('/admin/products');
  revalidatePath('/admin/profit');
  return { ok: true, data: { saved: result.saved } };
}
