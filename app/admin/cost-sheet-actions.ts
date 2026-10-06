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
  getBrandAliases,
  getRememberedMatches,
  rememberMatch,
  upsertProductCost,
  type RememberedMatch,
} from '@/lib/product-costs';

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

/* 쓰이지 않는 import 삭제용 placeholder — foldForSimilarity 는 비슷도 디버깅 시 유용해서 노출만. */
export { foldForSimilarity as _foldForSimilarity };
export type { RememberedMatch };
