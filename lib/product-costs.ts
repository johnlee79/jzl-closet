import 'server-only';

import { requireSupabaseAdmin, getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * 원가 전용 테이블 (product_costs) 접근.
 *
 * ★ 반드시 지킬 것 (newyorktrd-cost-sheet.md 6번 · 사장님 지시 2026-10-06)
 *   · 이 테이블은 service_role 전용으로 RLS 가 잠긴 상태입니다. 손님 anon 키로는 아예
 *     읽히지 않습니다.
 *   · 모든 쿼리를 service_role 쓰는 requireSupabaseAdmin / getSupabaseAdmin 으로만 돌립니다.
 *   · 손님용 컴포넌트에 **cost 라는 글자가 흘러들어가면 안 됩니다**.
 */

export type ProductCost = {
  productId: string;
  source: string;
  optionCombinationKey: string | null;
  costPrice: number;
  sheetDate: string | null;
  uploadedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ProductCostRow = {
  product_id: string;
  source: string;
  option_combination_key: string | null;
  cost_price: number;
  sheet_date: string | null;
  uploaded_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function toCost(row: ProductCostRow): ProductCost {
  return {
    productId: row.product_id,
    source: row.source,
    optionCombinationKey: row.option_combination_key,
    costPrice: row.cost_price,
    sheetDate: row.sheet_date,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------
 * 조회
 * ------------------------------------------------------------------ */

/**
 * 상품 하나의 "현재 원가" (option_combination_key = null = 상품 단위).
 * ★ 1단계에선 상품 단위 하나만 저장합니다.
 */
export async function getProductCost(productId: string): Promise<ProductCost | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('product_costs')
    .select('*')
    .eq('product_id', productId)
    .is('option_combination_key', null)
    .maybeSingle();
  if (error || !data) return null;
  return toCost(data as ProductCostRow);
}

/** 여러 상품의 "현재 원가" 를 Map 으로 (목록 화면용). */
export async function getProductCostsByIds(
  productIds: string[]
): Promise<Map<string, ProductCost>> {
  const out = new Map<string, ProductCost>();
  if (productIds.length === 0) return out;
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const { data, error } = await supabase
    .from('product_costs')
    .select('*')
    .in('product_id', productIds)
    .is('option_combination_key', null);
  if (error || !data) return out;
  for (const row of data as ProductCostRow[]) {
    out.set(row.product_id, toCost(row));
  }
  return out;
}

/* ------------------------------------------------------------------
 * 저장 — upsert + history
 * ------------------------------------------------------------------ */

export type UpsertCostInput = {
  productId: string;
  costPrice: number;
  source?: string;
  sheetDate?: string | null;
  uploadedBy?: string | null;
};

/**
 * 상품 원가 저장. 이전 값과 다르면 product_cost_history 에도 기록을 남깁니다.
 * (언제 얼마에서 얼마로 바뀌었는지 — 명세 6번 "바뀐 기록을 남기세요")
 */
export async function upsertProductCost(input: UpsertCostInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const source = input.source ?? 'newyorktrd';

  // 이전 값 조회
  const prevResult = await supabase
    .from('product_costs')
    .select('cost_price')
    .eq('product_id', input.productId)
    .eq('source', source)
    .is('option_combination_key', null)
    .maybeSingle();

  const prevCost = prevResult.data ? (prevResult.data as { cost_price: number }).cost_price : null;
  const changed = prevCost !== input.costPrice;

  const row = {
    product_id: input.productId,
    source,
    option_combination_key: null,
    cost_price: input.costPrice,
    sheet_date: input.sheetDate ?? null,
    uploaded_by: input.uploadedBy ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('product_costs')
    .upsert(row, { onConflict: 'product_id,source,option_combination_key' });
  if (error) throw new Error(`원가 저장 실패: ${error.message}`);

  if (changed) {
    await supabase.from('product_cost_history').insert({
      product_id: input.productId,
      source,
      option_combination_key: null,
      prev_cost_price: prevCost,
      new_cost_price: input.costPrice,
      sheet_date: input.sheetDate ?? null,
      uploaded_by: input.uploadedBy ?? null,
    });
  }
}

/* ------------------------------------------------------------------
 * 엑셀 매칭 기억 — excel_product_match
 * ------------------------------------------------------------------ */

export type RememberedMatch = {
  source: string;
  normalizedName: string;
  productId: string | null;
};

/** 정규화한 엑셀 상품명들에 대응하는 "기억된 짝" 을 가져옵니다. */
export async function getRememberedMatches(
  normalizedNames: string[],
  source = 'newyorktrd'
): Promise<Map<string, RememberedMatch>> {
  const out = new Map<string, RememberedMatch>();
  if (normalizedNames.length === 0) return out;
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const { data, error } = await supabase
    .from('excel_product_match')
    .select('source, normalized_name, product_id')
    .eq('source', source)
    .in('normalized_name', normalizedNames);
  if (error || !data) return out;
  for (const row of data as {
    source: string;
    normalized_name: string;
    product_id: string | null;
  }[]) {
    out.set(row.normalized_name, {
      source: row.source,
      normalizedName: row.normalized_name,
      productId: row.product_id,
    });
  }
  return out;
}

/** 사람이 확정한 매칭을 저장합니다. */
export async function rememberMatch(input: {
  normalizedName: string;
  productId: string | null;
  excelSkus: string[];
  matchedBy?: string | null;
  source?: string;
}): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from('excel_product_match').upsert(
    {
      source: input.source ?? 'newyorktrd',
      normalized_name: input.normalizedName,
      product_id: input.productId,
      excel_skus: input.excelSkus,
      matched_by: input.matchedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'source,normalized_name' }
  );
  if (error) throw new Error(`매칭 기억 저장 실패: ${error.message}`);
}

/* ------------------------------------------------------------------
 * 브랜드 줄임말
 * ------------------------------------------------------------------ */

export async function getBrandAliases(): Promise<
  { alias: string; brandSlug: string | null }[]
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('brand_aliases')
    .select('alias, brand_slug')
    .order('alias');
  if (error || !data) return [];
  return (data as { alias: string; brand_slug: string | null }[]).map((row) => ({
    alias: row.alias,
    brandSlug: row.brand_slug,
  }));
}
