'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import { createProduct, getProductBySlug } from '@/lib/products';
import { splitOriginAndManufacturer } from '@/lib/origin';
import { slugify } from '@/lib/product-utils';
import {
  SellstarError,
  fetchSellstarProduct,
  type SellstarProduct,
} from '@/lib/sellstar';
import { IMPORT_KEY, getImportSettings, writeSetting } from '@/lib/settings';
import { normalizeImport } from '@/lib/settings';
import type { DetailBlock, OptionCombination, OptionGroup, ProductInput } from '@/lib/types';
import type { ImportSettings } from '@/lib/site-config';

/**
 * 셀스타 가져오기 서버 액션.
 *
 * ★ 등록은 항상 임시저장(노출 끔) 상태로 합니다.
 *   가져온 내용을 눈으로 확인한 뒤 관리자가 직접 판매중으로 바꿉니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin/import]', message);
  return { ok: false, error: message };
}

/* ── 셀스타에서 한 건 가져오기 ────────────────────────────── */

export async function fetchSellstarAction(
  id: number
): Promise<ActionResult<SellstarProduct>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    return { ok: true, data: await fetchSellstarProduct(id) };
  } catch (error) {
    if (error instanceof SellstarError) return { ok: false, error: error.message };
    return fail(error, '상품을 가져오지 못했습니다.');
  }
}

/* ── 등록 ─────────────────────────────────────────────────── */

export type ImportPayload = {
  sellstarId: number;
  sellstarPrice: number;
  sellstarSalePrice: number;
  name: string;
  slug: string;
  summary: string;
  price: number;
  originalPrice: number | null;
  categorySlug: string;
  subCategorySlug: string | null;
  brandSlug: string | null;
  origin: string | null;
  manufacturer: string | null;
  /** 이미 R2 로 복사한 대표 이미지 주소 */
  thumbnails: string[];
  /** 이미 R2 로 복사한 상세 구성 */
  detail: DetailBlock[];
  optionGroups: OptionGroup[];
  optionCombinations: OptionCombination[];
  freeShipping: boolean;
};

/** slug 가 겹치면 뒤에 번호를 붙입니다. */
async function uniqueSlug(base: string): Promise<string> {
  const seed = slugify(base) || `item-${Date.now().toString(36)}`;
  let slug = seed;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await getProductBySlug(slug)) {
    slug = `${seed}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export async function importProductAction(
  payload: ImportPayload
): Promise<ActionResult<{ id: string; slug: string }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (!payload.name.trim()) return { ok: false, error: '상품명을 입력해 주세요.' };
  if (payload.price <= 0) return { ok: false, error: 'JZL 판매가를 입력해 주세요.' };
  if (!payload.categorySlug) return { ok: false, error: '분류를 선택해 주세요.' };
  if (payload.thumbnails.length === 0) {
    return { ok: false, error: '대표 이미지가 없습니다. 이미지 가져오기를 먼저 끝내 주세요.' };
  }

  try {
    const slug = await uniqueSlug(payload.slug || payload.name);

    const input: ProductInput = {
      slug,
      name: payload.name.trim(),
      brandSlug: payload.brandSlug,
      categorySlug: payload.categorySlug,
      subCategorySlug: payload.subCategorySlug,
      price: payload.price,
      originalPrice: payload.originalPrice,
      summary: payload.summary.trim(),
      // ★ 원산지와 제조사를 제자리에 놓습니다.
      //   제조사 칸에 나라 이름만 들어 있으면 원산지로 옮기고 제조사는 비웁니다.
      //   화면에서도 같은 정리를 하지만, 저장 직전에 한 번 더 거릅니다.
      //   (가져오기 payload 는 서버 액션이라 화면을 거치지 않고도 들어올 수 있습니다)
      ...(() => {
        const placed = splitOriginAndManufacturer({
          origin: payload.origin,
          manufacturer: payload.manufacturer,
        });
        return { origin: placed.origin, manufacturer: placed.manufacturer };
      })(),
      gender: 'women',
      season: null,
      thumbnails: payload.thumbnails,
      optionGroups: payload.optionGroups,
      optionCombinations: payload.optionCombinations,
      detail: payload.detail,
      measurements: [],
      isNew: true,
      isSale: Boolean(payload.originalPrice && payload.originalPrice > payload.price),
      freeShipping: payload.freeShipping,
      // ★ 임시저장으로 넣습니다. 확인 뒤 관리자가 판매중으로 바꿉니다.
      isVisible: false,
      isSoldOut: false,
      displayOrder: 0,
      sellstarId: payload.sellstarId,
      sellstarSyncedAt: new Date().toISOString(),
      sellstarPrice: payload.sellstarPrice,
      sellstarSalePrice: payload.sellstarSalePrice,
    };

    const saved = await createProduct(input);

    revalidatePath('/admin/products');
    revalidatePath('/admin/products/import');
    return { ok: true, data: { id: saved.id, slug: saved.slug } };
  } catch (error) {
    return fail(error, '상품을 등록하지 못했습니다.');
  }
}

/* ── 가져오기 설정 (공통 블록 · 글 템플릿) ────────────────── */

export async function saveImportSettingsAction(
  input: ImportSettings
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await writeSetting(IMPORT_KEY, normalizeImport(input));
    revalidatePath('/admin/settings');
    revalidatePath('/admin/products/import');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '가져오기 설정을 저장하지 못했습니다.');
  }
}

/** 화면에서 쓰는 현재 설정 */
export async function loadImportSettingsAction(): Promise<
  ActionResult<ImportSettings>
> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    return { ok: true, data: await getImportSettings() };
  } catch (error) {
    return fail(error, '가져오기 설정을 읽지 못했습니다.');
  }
}
