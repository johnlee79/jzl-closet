'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import {
  foldForSimilarity,
  type BrandAlias,
  matchBrandAlias,
  similarity,
} from '@/lib/cost-sheet';
import { getProducts } from '@/lib/products';
import {
  applyCostSheetEntryToProduct,
  getBrandAliases,
  getCurrentCostSheet,
  getRememberedMatches,
  rememberMatch,
  setCostSheetEntryMatch,
  unmatchCostFromProduct,
  uploadCostSheet,
  upsertProductCost,
  type CostSheetEntry,
  type RememberedMatch,
} from '@/lib/product-costs';
import { getProductById } from '@/lib/products';

/**
 * 단가표 엑셀 매칭·저장 서버 액션.
 *
 * ★ 1단계 범위 (사장님 지시 2026-10-06)
 *   · 상품명·품번·위탁가만 처리합니다. 색상·사이즈·품절·실측·월 비교 **없음**.
 *   · 매칭은 전부 사람이 고르고 저장. 유일한 자동 매칭은 "기억된 짝" 뿐 (한 번 짝지은 것).
 *   · 원가는 **product_costs** 전용 테이블로. 손님 유출 금지.
 */

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ------------------------------------------------------------------
 * 미리보기 — 엑셀 상품마다 후보 3개 + 기억된 짝 조회
 * ------------------------------------------------------------------ */

export type PreviewExcelProduct = {
  key: string; // 시트+rowStart 로 만든 고유 키 (UI 식별용)
  sheet: string;
  rowStart: number;
  name: string;
  nameSkus: string[];
  normalizedName: string;
  costPrice: number | null;
};

export type Candidate = {
  productId: string;
  name: string;
  slug: string;
  brandSlug: string | null;
  brandLabel: string | null;
  thumbnail: string | null;
  sku: string | null;
  salePrice: number;
  similarity: number; // 0~1
};

export type PreviewRow = {
  excel: PreviewExcelProduct;
  /** 알파벳 줄임말로 뽑은 브랜드 — 가능하면 */
  brandSlug: string | null;
  brandAlias: string | null;
  brandUnsupported: boolean;
  /** 기억된 짝 — 있으면 UI 가 그걸 체크 상태로 미리 올려 둡니다 (자동 저장은 안 함) */
  rememberedProductId: string | null;
  /** 상위 3개 후보 */
  candidates: Candidate[];
};

export async function previewMatchesAction(
  excelProducts: PreviewExcelProduct[]
): Promise<ActionResult<{ rows: PreviewRow[] }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const [aliases, products, remembered] = await Promise.all([
      getBrandAliases(),
      // 숨김 상품까지 포함해서 매칭 — 임시저장(노출 꺼짐) 상태 상품도 원가는 넣어야 하니까
      getProducts({ includeHidden: true }),
      getRememberedMatches(
        excelProducts.map((p) => p.normalizedName).filter(Boolean)
      ),
    ]);

    // 상품을 brand_slug 로 그루핑해 두면 매칭이 빠릅니다.
    const byBrand = new Map<string, typeof products>();
    for (const product of products) {
      const key = product.brandSlug ?? '';
      const list = byBrand.get(key) ?? [];
      list.push(product);
      byBrand.set(key, list);
    }

    const rows: PreviewRow[] = [];
    for (const ex of excelProducts) {
      const brandMatch = matchBrandAlias(
        ex.name,
        aliases as BrandAlias[]
      );
      // 같은 브랜드 안에서 상위 3개 후보 — 유사도 ≥ 0.15 (너무 다른 건 제외)
      const pool = brandMatch.brandSlug
        ? byBrand.get(brandMatch.brandSlug) ?? []
        : products; // 브랜드 알리아스 없으면 전체에서 (너무 많으면 UI 가 알아서 자름)

      const candidates: Candidate[] = pool
        .map<Candidate>((product) => ({
          productId: product.id,
          name: product.name,
          slug: product.slug,
          brandSlug: product.brandSlug,
          brandLabel: null, // 브랜드 레이블은 UI 쪽 brands 조회에서 붙입니다 (payload 가벼이)
          thumbnail: product.thumbnails?.[0] ?? null,
          sku: product.sku ?? null,
          salePrice: product.price,
          similarity: similarity(ex.name, product.name),
        }))
        .filter((c) => c.similarity >= 0.15)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);

      // 품번이 일치하는 상품이 있으면 후보 맨 앞에 끼워 넣음 — 사람이 체크하기 쉽게
      if (ex.nameSkus.length > 0) {
        const skuMatch = products.find(
          (p) => p.sku && ex.nameSkus.includes(p.sku)
        );
        if (skuMatch && !candidates.find((c) => c.productId === skuMatch.id)) {
          candidates.unshift({
            productId: skuMatch.id,
            name: skuMatch.name,
            slug: skuMatch.slug,
            brandSlug: skuMatch.brandSlug,
            brandLabel: null,
            thumbnail: skuMatch.thumbnails?.[0] ?? null,
            sku: skuMatch.sku ?? null,
            salePrice: skuMatch.price,
            similarity: 1, // 품번 일치는 100%로 표시
          });
        }
      }

      const remembered1 = remembered.get(ex.normalizedName);
      rows.push({
        excel: ex,
        brandSlug: brandMatch.brandSlug,
        brandAlias: brandMatch.alias,
        brandUnsupported: brandMatch.unsupported,
        rememberedProductId: remembered1?.productId ?? null,
        candidates,
      });
    }

    return { ok: true, data: { rows } };
  } catch (error) {
    const message = error instanceof Error ? error.message : '매칭 미리보기 실패';
    console.error('[cost-sheet] previewMatches:', message);
    return { ok: false, error: message };
  }
}

/* ------------------------------------------------------------------
 * 저장 — 사람이 고른 짝 + 원가 + 매칭 기억
 * ------------------------------------------------------------------ */

export type SaveRow = {
  normalizedName: string;
  excelName: string;
  excelSkus: string[];
  costPrice: number | null;
  /** null 이면 「해당 없음」 — 매칭을 null 로 기억만 하고 원가는 저장 안 함 */
  productId: string | null;
};

export async function saveCostsAction(
  rows: SaveRow[],
  sheetDate?: string | null
): Promise<ActionResult<{ saved: number; remembered: number; skipped: number }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  // ★ 올린 사람 식별자 — 지금은 "admin" 으로 통일합니다. 로그인 세션에서 이메일을
  //   꺼내는 통일된 API 가 생기면 그걸 쓰면 됩니다.
  const email = 'admin';
  let saved = 0;
  let remembered = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.normalizedName) {
      skipped += 1;
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await rememberMatch({
        normalizedName: row.normalizedName,
        productId: row.productId,
        excelSkus: row.excelSkus,
        matchedBy: email,
      });
      remembered += 1;

      if (row.productId && row.costPrice && row.costPrice > 0) {
        // eslint-disable-next-line no-await-in-loop
        await upsertProductCost({
          productId: row.productId,
          costPrice: row.costPrice,
          source: 'newyorktrd',
          sheetDate: sheetDate ?? null,
          uploadedBy: email,
        });
        saved += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      console.error('[cost-sheet] save row:', row.normalizedName, error);
      skipped += 1;
    }
  }

  revalidatePath('/admin/products');
  revalidatePath('/admin/products/cost-sheet');

  return { ok: true, data: { saved, remembered, skipped } };
}

/* ------------------------------------------------------------------
 * 단가표 전체 저장 (사장님 지시 2026-10-06)
 * ------------------------------------------------------------------ */

export type UploadRow = {
  normalizedName: string;
  rawName: string;
  skus: string[];
  costPrice: number | null;
  imageUrl: string | null;
  sheetName: string | null;
  rowStart: number | null;
  /** 매칭된 productId 또는 null */
  productId: string | null;
};

/**
 * 사람이 짝 지은 결과를 **단가표 전체**와 함께 저장합니다. 이전 단가표는 is_current=false
 * 로 밀려 기록이 됩니다.
 *
 * ★ 저장 흐름
 *   1) cost_sheet_entries 통째로 교체 (옛것은 is_current=false)
 *   2) excel_product_match 에 짝 기억 (null 포함)
 *   3) 짝지은 상품마다 product_costs 에 upsert (history 자동)
 */
export async function uploadFullSheetAction(
  rows: UploadRow[],
  sheetDate?: string | null
): Promise<
  ActionResult<{
    archived: number;
    saved: number;
    costs: number;
    remembered: number;
  }>
> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  const email = 'admin';

  try {
    // 1) 단가표 전체 저장
    const matchedByName: Record<string, string | null> = {};
    for (const row of rows) matchedByName[row.normalizedName] = row.productId;

    const upload = await uploadCostSheet({
      sheetDate: sheetDate ?? null,
      uploadedBy: email,
      entries: rows.map((r) => ({
        normalizedName: r.normalizedName,
        rawName: r.rawName,
        skus: r.skus,
        costPrice: r.costPrice,
        imageUrl: r.imageUrl,
        sheetName: r.sheetName,
        rowStart: r.rowStart,
      })),
      matchedByName,
    });

    // 2 · 3) 매칭 기억 + 원가 upsert — 상품 짝이 있고 원가가 있을 때만
    let remembered = 0;
    let costs = 0;
    for (const row of rows) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await rememberMatch({
          normalizedName: row.normalizedName,
          productId: row.productId,
          excelSkus: row.skus,
          matchedBy: email,
        });
        remembered += 1;
        if (row.productId && row.costPrice && row.costPrice > 0) {
          // eslint-disable-next-line no-await-in-loop
          await upsertProductCost({
            productId: row.productId,
            costPrice: row.costPrice,
            source: 'newyorktrd',
            sheetDate: sheetDate ?? null,
            uploadedBy: email,
          });
          costs += 1;
        }
      } catch (error) {
        console.error('[cost-sheet] remember/cost 저장 실패:', row.normalizedName, error);
      }
    }

    revalidatePath('/admin/products');
    revalidatePath('/admin/products/cost-sheet');
    revalidatePath('/admin/products/cost-sheet/view');

    return {
      ok: true,
      data: {
        archived: upload.archivedEntries,
        saved: upload.savedEntries,
        costs,
        remembered,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '단가표 저장 실패';
    console.error('[cost-sheet] uploadFullSheet:', message);
    return { ok: false, error: message };
  }
}

/* ------------------------------------------------------------------
 * 「단가표에서 원가 찾기」 — 상품 쪽에서 부릅니다
 * ------------------------------------------------------------------ */

export type PickerEntry = {
  entryId: string;
  rawName: string;
  costPrice: number | null;
  imageUrl: string | null;
  skus: string[];
  sheetName: string | null;
  matchedProductId: string | null;
};

/**
 * 지금 쓰이는 단가표에서, 상품의 브랜드와 (별명으로) 묶인 행만 돌려줍니다.
 * 검색어가 있으면 이름 비슷한 순으로 정렬.
 */
export async function getPickerEntriesAction(
  productId: string,
  query: string
): Promise<ActionResult<{ entries: PickerEntry[] }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    const product = await getProductById(productId);
    if (!product) return { ok: false, error: '상품을 찾지 못했습니다.' };

    const [aliases, allEntries] = await Promise.all([
      getBrandAliases(),
      getCurrentCostSheet(),
    ]);

    // 같은 브랜드로 묶인 알리아스
    const brandAliases = aliases.filter((a) => a.brandSlug === product.brandSlug);
    const brandAliasList = brandAliases.map((a) => ({ alias: a.alias, brandSlug: a.brandSlug }));

    // 알리아스로 상품명 앞부분을 체크 — 매칭되는 것만
    const filtered: CostSheetEntry[] = brandAliasList.length
      ? allEntries.filter((entry) => {
          const match = matchBrandAlias(entry.rawName, brandAliasList);
          return match.brandSlug === product.brandSlug;
        })
      : allEntries;

    // 검색어로 추가 필터·정렬
    const q = query.trim().toLowerCase();
    const scored = filtered
      .map((entry) => ({
        entry,
        score: q ? similarity(entry.rawName, q) + (entry.rawName.toLowerCase().includes(q) ? 0.3 : 0) : 0,
      }))
      .filter((item) => (q ? item.score > 0.1 : true))
      .sort((a, b) => {
        if (q) return b.score - a.score;
        return a.entry.rawName.localeCompare(b.entry.rawName);
      })
      .slice(0, 50);

    const entries: PickerEntry[] = scored.map(({ entry }) => ({
      entryId: entry.id,
      rawName: entry.rawName,
      costPrice: entry.costPrice,
      imageUrl: entry.imageUrl,
      skus: entry.skus,
      sheetName: entry.sheetName,
      matchedProductId: entry.matchedProductId,
    }));

    return { ok: true, data: { entries } };
  } catch (error) {
    const message = error instanceof Error ? error.message : '단가표 조회 실패';
    console.error('[cost-sheet] getPickerEntries:', message);
    return { ok: false, error: message };
  }
}

/**
 * 상품을 아직 등록하기 전인데 **단가표 짝만 미리 골라두는** 흐름 (상품 가져오기 화면용).
 * productId 가 없으므로 brandSlug 로만 필터링해 후보를 돌려줍니다. 저장은 안 합니다.
 */
export async function getPickerEntriesByBrandAction(
  brandSlug: string | null,
  query: string
): Promise<ActionResult<{ entries: PickerEntry[] }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    const [aliases, allEntries] = await Promise.all([
      getBrandAliases(),
      getCurrentCostSheet(),
    ]);

    const brandAliases = brandSlug ? aliases.filter((a) => a.brandSlug === brandSlug) : [];
    const filtered: CostSheetEntry[] = brandAliases.length
      ? allEntries.filter((entry) => {
          const match = matchBrandAlias(entry.rawName, brandAliases);
          return match.brandSlug === brandSlug;
        })
      : allEntries;

    const q = query.trim().toLowerCase();
    const scored = filtered
      .map((entry) => ({
        entry,
        score: q
          ? similarity(entry.rawName, q) + (entry.rawName.toLowerCase().includes(q) ? 0.3 : 0)
          : 0,
      }))
      .filter((item) => (q ? item.score > 0.1 : true))
      .sort((a, b) => {
        if (q) return b.score - a.score;
        return a.entry.rawName.localeCompare(b.entry.rawName);
      })
      .slice(0, 50);

    const entries: PickerEntry[] = scored.map(({ entry }) => ({
      entryId: entry.id,
      rawName: entry.rawName,
      costPrice: entry.costPrice,
      imageUrl: entry.imageUrl,
      skus: entry.skus,
      sheetName: entry.sheetName,
      matchedProductId: entry.matchedProductId,
    }));

    return { ok: true, data: { entries } };
  } catch (error) {
    const message = error instanceof Error ? error.message : '단가표 조회 실패';
    console.error('[cost-sheet] getPickerEntriesByBrand:', message);
    return { ok: false, error: message };
  }
}

/**
 * 상품 쪽에서 "단가표 상품 하나를 골라 짝지음" — 원가도 바로 저장.
 */
export async function pickCostForProductAction(
  productId: string,
  entryId: string
): Promise<ActionResult<{ costPrice: number | null }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    const result = await applyCostSheetEntryToProduct(productId, entryId, 'admin');
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/admin/products/cost-sheet/view');
    return { ok: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : '짝 지음 실패';
    return { ok: false, error: message };
  }
}

/** 상품 쪽에서 "짝 풀기" — 단가표 entry 의 matched_product_id 비우고 원가도 삭제 */
export async function unmatchCostFromProductAction(
  productId: string
): Promise<ActionResult<undefined>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    await unmatchCostFromProduct(productId);
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/admin/products/cost-sheet/view');
    return { ok: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : '짝 풀기 실패';
    return { ok: false, error: message };
  }
}

/** 단가표 보기 페이지의 "짝 바꾸기" — entryId 쪽에서 상품 바꾸기 */
export async function updateCostSheetEntryMatchAction(
  entryId: string,
  productId: string | null
): Promise<ActionResult<undefined>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    await setCostSheetEntryMatch(entryId, productId);
    revalidatePath('/admin/products/cost-sheet/view');
    return { ok: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : '짝 변경 실패';
    return { ok: false, error: message };
  }
}

/* 쓰이지 않는 import 삭제용 placeholder — foldForSimilarity 는 비슷도 디버깅 시 유용해서 노출만. */
export { foldForSimilarity as _foldForSimilarity };
export type { RememberedMatch };
