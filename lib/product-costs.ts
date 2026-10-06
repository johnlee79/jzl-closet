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

/* ------------------------------------------------------------------
 * 저장된 단가표 — cost_sheet_entries
 *
 * ★ 새 엑셀을 올리면 current 를 바꿔 끼우고 옛것은 is_current=false 로 기록 남김.
 *   service_role 전용 RLS. 손님 유출 금지.
 * ------------------------------------------------------------------ */

export type CostSheetEntry = {
  id: string;
  source: string;
  sheetDate: string | null;
  uploadedAt: string;
  isCurrent: boolean;
  normalizedName: string;
  rawName: string;
  skus: string[];
  costPrice: number | null;
  imageUrl: string | null;
  matchedProductId: string | null;
  sheetName: string | null;
  rowStart: number | null;
};

type CostSheetEntryRow = {
  id: string;
  source: string;
  sheet_date: string | null;
  uploaded_at: string;
  is_current: boolean;
  normalized_name: string;
  raw_name: string;
  skus: string[];
  cost_price: number | null;
  image_url: string | null;
  matched_product_id: string | null;
  sheet_name: string | null;
  row_start: number | null;
};

function toEntry(row: CostSheetEntryRow): CostSheetEntry {
  return {
    id: row.id,
    source: row.source,
    sheetDate: row.sheet_date,
    uploadedAt: row.uploaded_at,
    isCurrent: row.is_current,
    normalizedName: row.normalized_name,
    rawName: row.raw_name,
    skus: row.skus ?? [],
    costPrice: row.cost_price,
    imageUrl: row.image_url,
    matchedProductId: row.matched_product_id,
    sheetName: row.sheet_name,
    rowStart: row.row_start,
  };
}

/** 지금 쓰이는 단가표의 모든 행 */
export async function getCurrentCostSheet(source = 'newyorktrd'): Promise<CostSheetEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('cost_sheet_entries')
    .select('*')
    .eq('source', source)
    .eq('is_current', true)
    .order('sheet_name', { ascending: true })
    .order('row_start', { ascending: true });
  if (error || !data) return [];
  return (data as CostSheetEntryRow[]).map(toEntry);
}

/** 상품 하나에 짝지어진 단가표 행 (가장 최근 current) */
export async function getCostSheetEntryByProduct(
  productId: string,
  source = 'newyorktrd'
): Promise<CostSheetEntry | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('cost_sheet_entries')
    .select('*')
    .eq('source', source)
    .eq('is_current', true)
    .eq('matched_product_id', productId)
    .maybeSingle();
  if (error || !data) return null;
  return toEntry(data as CostSheetEntryRow);
}

export type UploadSheetInput = {
  source?: string;
  sheetDate: string | null;
  uploadedBy?: string | null;
  entries: {
    normalizedName: string;
    rawName: string;
    skus: string[];
    costPrice: number | null;
    imageUrl: string | null;
    sheetName: string | null;
    rowStart: number | null;
  }[];
  /** 사람이 짝지은 정보 — normalized_name → matched_product_id */
  matchedByName: Record<string, string | null>;
};

/**
 * 새 단가표를 통째로 저장합니다. 기존 current 는 is_current=false 로 기록으로 밀고,
 * 새 행들을 is_current=true 로 insert.
 */
export async function uploadCostSheet(input: UploadSheetInput): Promise<{
  savedEntries: number;
  archivedEntries: number;
}> {
  const supabase = requireSupabaseAdmin();
  const source = input.source ?? 'newyorktrd';
  const now = new Date().toISOString();

  // 1) 기존 current → 기록으로 (unique index 가 current 만 걸려 있어 중복 걱정 없음)
  const { count: archivedCount, error: archiveError } = await supabase
    .from('cost_sheet_entries')
    .update({ is_current: false, updated_at: now }, { count: 'exact' })
    .eq('source', source)
    .eq('is_current', true);
  if (archiveError) throw new Error(`옛 단가표 기록 처리 실패: ${archiveError.message}`);

  // 2) 새 행 insert
  const rows = input.entries.map((e) => ({
    source,
    sheet_date: input.sheetDate,
    uploaded_at: now,
    uploaded_by: input.uploadedBy ?? null,
    is_current: true,
    normalized_name: e.normalizedName,
    raw_name: e.rawName,
    skus: e.skus,
    cost_price: e.costPrice,
    image_url: e.imageUrl,
    matched_product_id: input.matchedByName[e.normalizedName] ?? null,
    sheet_name: e.sheetName,
    row_start: e.rowStart,
    updated_at: now,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('cost_sheet_entries').insert(rows);
    if (insertError) throw new Error(`단가표 저장 실패: ${insertError.message}`);
  }

  return { savedEntries: rows.length, archivedEntries: archivedCount ?? 0 };
}

/**
 * 단가표 엔트리를 상품에 적용 — 짝 지음 + 매칭 기억 + 원가 저장을 한 번에.
 *
 * ★ 상품 가져오기 흐름(SellstarImporter)과 상품 수정 picker 양쪽에서 씁니다.
 *   서버 액션끼리 서로 못 부르는 걸 피하려고 lib 쪽에 함께 둡니다.
 */
export async function applyCostSheetEntryToProduct(
  productId: string,
  entryId: string,
  uploadedBy: string | null
): Promise<{ costPrice: number | null }> {
  const supabase = requireSupabaseAdmin();
  // entry 조회
  const { data, error } = await supabase
    .from('cost_sheet_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle();
  if (error) throw new Error(`단가표 행 조회 실패: ${error.message}`);
  if (!data) throw new Error('단가표 행을 찾지 못했습니다.');
  const entry = toEntry(data as CostSheetEntryRow);

  await setCostSheetEntryMatch(entryId, productId);
  await rememberMatch({
    normalizedName: entry.normalizedName,
    productId,
    excelSkus: entry.skus,
    matchedBy: uploadedBy,
  });
  if (entry.costPrice && entry.costPrice > 0) {
    await upsertProductCost({
      productId,
      costPrice: entry.costPrice,
      source: 'newyorktrd',
      sheetDate: entry.sheetDate,
      uploadedBy,
    });
  }
  return { costPrice: entry.costPrice };
}

/** 짝 바꾸기 / 짝 풀기 — matched_product_id 만 바꿉니다 */
export async function setCostSheetEntryMatch(
  entryId: string,
  productId: string | null
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from('cost_sheet_entries')
    .update({ matched_product_id: productId, updated_at: new Date().toISOString() })
    .eq('id', entryId);
  if (error) throw new Error(`짝 변경 실패: ${error.message}`);
}

/** 상품 쪽에서 "짝 풀기" — 원가 테이블의 레코드도 함께 삭제 */
export async function unmatchCostFromProduct(
  productId: string,
  source = 'newyorktrd'
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  // cost_sheet_entries 의 matched_product_id 비움
  await supabase
    .from('cost_sheet_entries')
    .update({ matched_product_id: null, updated_at: new Date().toISOString() })
    .eq('source', source)
    .eq('matched_product_id', productId);
  // product_costs 에서 삭제
  await supabase.from('product_costs').delete().eq('product_id', productId).eq('source', source);
}

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
