import 'server-only';
import { assertWritten } from '@/lib/db-write';

import { unstable_cache } from 'next/cache';
import {
  FALLBACK_BRANDS,
  paragraphsToStory,
  storyToParagraphs,
  type Brand,
} from '@/lib/brands';
import {
  FALLBACK_CATEGORIES,
  matchTypeOf,
  type Category,
  type SubCategory,
} from '@/lib/categories';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';

/**
 * 분류·브랜드를 DB 에서 읽고 씁니다. (서버 전용)
 *
 * ★ supabase/schema-1b.sql 과 seed-1b.sql 을 아직 실행하지 않았어도
 *   사이트가 죽지 않습니다. 테이블이 없거나 비어 있으면
 *   lib/categories.ts · lib/brands.ts 의 폴백 값을 씁니다.
 *
 * ★ 프론트는 캐시된 함수(getCachedCategories / getCachedBrands)를 씁니다.
 *   관리자에서 저장하면 revalidateTag(TAXONOMY_TAG) 로 즉시 갈아 끼웁니다.
 *   덕분에 ISR·정적 생성을 깨지 않으면서도 저장 즉시 반영됩니다.
 */

const CATEGORY_TABLE = 'categories';
const BRAND_TABLE = 'brands';

/** 분류·브랜드가 바뀌면 이 태그를 무효화합니다. */
export const TAXONOMY_TAG = 'taxonomy';

/** 테이블이 아직 없을 때 PostgREST 가 돌려주는 코드들 */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

function isMissingTable(code: string | undefined): boolean {
  return Boolean(code && MISSING_TABLE_CODES.has(code));
}

/* ------------------------------------------------------------------
 * DB row → 앱 타입
 * ------------------------------------------------------------------ */

type CategoryRow = {
  id: string;
  slug: string;
  label: string;
  name_ko: string;
  parent_slug: string | null;
  display_order: number | null;
  is_visible: boolean | null;
  description: string | null;
};

type BrandRow = {
  id: string;
  slug: string;
  label: string;
  name: string;
  name_ko: string | null;
  tagline: string | null;
  story: string | null;
  origin: string | null;
  since: string | null;
  image_url: string | null;
  display_order: number | null;
  is_visible: boolean | null;
  is_featured: boolean | null;
};

const CATEGORY_COLUMNS =
  'id, slug, label, name_ko, parent_slug, display_order, is_visible, description';
const BRAND_COLUMNS =
  'id, slug, label, name, name_ko, tagline, story, origin, since, image_url, display_order, is_visible, is_featured';

function toSubCategory(row: CategoryRow): SubCategory {
  return {
    slug: row.slug,
    label: row.label,
    nameKo: row.name_ko,
    order: row.display_order ?? 0,
    isVisible: row.is_visible !== false,
    description: row.description ?? undefined,
  };
}

/** 평평한 row 목록을 대분류 → children 트리로 접습니다. */
function rowsToCategories(rows: CategoryRow[]): Category[] {
  const parents = rows.filter((row) => !row.parent_slug);
  const childrenBySlug = new Map<string, SubCategory[]>();

  for (const row of rows) {
    if (!row.parent_slug) continue;
    const list = childrenBySlug.get(row.parent_slug) ?? [];
    list.push(toSubCategory(row));
    childrenBySlug.set(row.parent_slug, list);
  }

  return parents
    .map((row) => ({
      slug: row.slug,
      label: row.label,
      nameKo: row.name_ko,
      order: row.display_order ?? 0,
      isVisible: row.is_visible !== false,
      description: row.description ?? '',
      children: (childrenBySlug.get(row.slug) ?? []).sort((a, b) => a.order - b.order),
      ...matchTypeOf(row.slug),
    }))
    .sort((a, b) => a.order - b.order);
}

function rowToBrand(row: BrandRow): Brand {
  return {
    slug: row.slug,
    label: row.label,
    name: row.name,
    nameKo: row.name_ko ?? '',
    tagline: row.tagline ?? '',
    story: storyToParagraphs(row.story),
    origin: row.origin ?? '',
    since: row.since ?? '',
    imageUrl: row.image_url ?? '',
    order: row.display_order ?? 0,
    isVisible: row.is_visible !== false,
    isFeatured: Boolean(row.is_featured),
  };
}

/* ------------------------------------------------------------------
 * 읽기 — 실패하면 조용히 폴백으로 넘어갑니다.
 * ------------------------------------------------------------------ */

/** DB 에서 분류를 읽습니다. 테이블이 없거나 비어 있으면 null. */
async function readCategories(): Promise<Category[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(CATEGORY_TABLE)
      .select(CATEGORY_COLUMNS)
      .order('display_order', { ascending: true });

    if (error) {
      if (!isMissingTable(error.code)) {
        console.warn('[taxonomy] 분류를 읽지 못했습니다:', error.message);
      }
      return null;
    }
    const rows = (data ?? []) as CategoryRow[];
    return rows.length > 0 ? rowsToCategories(rows) : null;
  } catch (error) {
    console.warn('[taxonomy] 분류를 읽지 못했습니다:', error);
    return null;
  }
}

async function readBrands(): Promise<Brand[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(BRAND_TABLE)
      .select(BRAND_COLUMNS)
      .order('display_order', { ascending: true });

    if (error) {
      if (!isMissingTable(error.code)) {
        console.warn('[taxonomy] 브랜드를 읽지 못했습니다:', error.message);
      }
      return null;
    }
    const rows = (data ?? []) as BrandRow[];
    return rows.length > 0 ? rows.map(rowToBrand) : null;
  } catch (error) {
    console.warn('[taxonomy] 브랜드를 읽지 못했습니다:', error);
    return null;
  }
}

/** 관리자용 — 항상 DB 를 직접 봅니다. (DB 가 비면 폴백) */
export async function getCategories(): Promise<Category[]> {
  return (await readCategories()) ?? FALLBACK_CATEGORIES;
}

export async function getBrands(): Promise<Brand[]> {
  return (await readBrands()) ?? FALLBACK_BRANDS;
}

/** 프론트용 — 페이지마다 DB 를 두드리지 않도록 캐시합니다. */
export const getCachedCategories = unstable_cache(getCategories, ['taxonomy-categories'], {
  tags: [TAXONOMY_TAG],
  revalidate: 3600,
});

export const getCachedBrands = unstable_cache(getBrands, ['taxonomy-brands'], {
  tags: [TAXONOMY_TAG],
  revalidate: 3600,
});

/** 분류·브랜드를 한 번에 (대부분의 페이지가 둘 다 필요합니다) */
export async function getTaxonomy(): Promise<{ categories: Category[]; brands: Brand[] }> {
  const [categories, brands] = await Promise.all([
    getCachedCategories(),
    getCachedBrands(),
  ]);
  return { categories, brands };
}

/** 1-B 테이블을 아직 만들지 않았는지 — 관리자 화면 안내에 씁니다. */
export async function isTaxonomyReady(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from(CATEGORY_TABLE).select('id').limit(1);
  return !error;
}

/** DB 에 실제 행이 들어 있는지 (폴백을 쓰고 있는 중인지 판단) */
export async function isTaxonomySeeded(): Promise<boolean> {
  return (await readCategories()) !== null;
}

/* ------------------------------------------------------------------
 * 상품 개수 — 삭제를 막을 때와 목록 표시에 씁니다.
 * ------------------------------------------------------------------ */

async function countBy(column: string, value: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq(column, value);
  if (error) return 0;
  return count ?? 0;
}

export async function countProductsInCategory(slug: string): Promise<number> {
  return countBy('category_slug', slug);
}

export async function countProductsInSubCategory(slug: string): Promise<number> {
  return countBy('sub_category_slug', slug);
}

export async function countProductsOfBrand(slug: string): Promise<number> {
  return countBy('brand_slug', slug);
}

/** 목록 화면에서 한 번에 세기 — slug 별 상품 수 */
export async function countProductsGrouped(): Promise<{
  byCategory: Record<string, number>;
  bySubCategory: Record<string, number>;
  byBrand: Record<string, number>;
}> {
  const empty = { byCategory: {}, bySubCategory: {}, byBrand: {} };
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const { data, error } = await supabase
    .from('products')
    .select('category_slug, sub_category_slug, brand_slug');
  if (error || !data) return empty;

  const byCategory: Record<string, number> = {};
  const bySubCategory: Record<string, number> = {};
  const byBrand: Record<string, number> = {};

  for (const row of data as {
    category_slug: string | null;
    sub_category_slug: string | null;
    brand_slug: string | null;
  }[]) {
    if (row.category_slug) {
      byCategory[row.category_slug] = (byCategory[row.category_slug] ?? 0) + 1;
    }
    if (row.sub_category_slug) {
      bySubCategory[row.sub_category_slug] = (bySubCategory[row.sub_category_slug] ?? 0) + 1;
    }
    if (row.brand_slug) {
      byBrand[row.brand_slug] = (byBrand[row.brand_slug] ?? 0) + 1;
    }
  }
  return { byCategory, bySubCategory, byBrand };
}

/* ------------------------------------------------------------------
 * 쓰기 — 관리자 전용. 실패하면 예외를 던집니다.
 * ------------------------------------------------------------------ */

function missingTableError(table: string): Error {
  return new Error(
    `${table} 테이블이 없습니다. supabase/schema-1b.sql 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도해 주세요.`
  );
}

export type CategoryInput = {
  slug: string;
  label: string;
  nameKo: string;
  parentSlug: string | null;
  description: string;
  isVisible: boolean;
  displayOrder?: number;
};

export async function createCategory(input: CategoryInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(CATEGORY_TABLE).insert({
    slug: input.slug,
    label: input.label,
    name_ko: input.nameKo,
    parent_slug: input.parentSlug,
    description: input.description || null,
    is_visible: input.isVisible,
    display_order: input.displayOrder ?? (await nextOrder(CATEGORY_TABLE, input.parentSlug)),
  });
  if (error) {
    if (isMissingTable(error.code)) throw missingTableError('categories');
    if (error.code === '23505') throw new Error(`이미 쓰고 있는 slug 입니다: ${input.slug}`);
    throw new Error(`분류를 저장하지 못했습니다: ${error.message}`);
  }
}

/** slug 는 절대 바꾸지 않습니다. (검색 색인 유지) */
export async function updateCategory(
  slug: string,
  patch: Partial<Omit<CategoryInput, 'slug' | 'parentSlug'>>
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.nameKo !== undefined) row.name_ko = patch.nameKo;
  if (patch.description !== undefined) row.description = patch.description || null;
  if (patch.isVisible !== undefined) row.is_visible = patch.isVisible;
  if (patch.displayOrder !== undefined) row.display_order = patch.displayOrder;

  const result = await supabase
    .from(CATEGORY_TABLE)
    .update(row)
    .eq('slug', slug)
    .select('slug');
  if (result.error && isMissingTable(result.error.code)) throw missingTableError('categories');
  assertWritten(result, '분류를 수정하지 못했습니다');
}

export async function deleteCategory(slug: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const result = await supabase
    .from(CATEGORY_TABLE)
    .delete()
    .eq('slug', slug)
    .select('slug');
  assertWritten(result, '분류를 삭제하지 못했습니다');
}

/** 소분류가 몇 개 달려 있는지 (대분류 삭제를 막을 때 씁니다) */
export async function countChildCategories(slug: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from(CATEGORY_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('parent_slug', slug);
  if (error) return 0;
  return count ?? 0;
}

export type BrandInput = {
  slug: string;
  label: string;
  name: string;
  nameKo: string;
  tagline: string;
  story: string[];
  origin: string;
  since: string;
  imageUrl: string;
  isVisible: boolean;
  isFeatured: boolean;
  displayOrder?: number;
};

export async function createBrand(input: BrandInput): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from(BRAND_TABLE).insert({
    slug: input.slug,
    label: input.label,
    name: input.name,
    name_ko: input.nameKo || null,
    tagline: input.tagline || null,
    story: paragraphsToStory(input.story) || null,
    origin: input.origin || null,
    since: input.since || null,
    image_url: input.imageUrl || null,
    is_visible: input.isVisible,
    is_featured: input.isFeatured,
    display_order: input.displayOrder ?? (await nextOrder(BRAND_TABLE, null)),
  });
  if (error) {
    if (isMissingTable(error.code)) throw missingTableError('brands');
    if (error.code === '23505') throw new Error(`이미 쓰고 있는 slug 입니다: ${input.slug}`);
    throw new Error(`브랜드를 저장하지 못했습니다: ${error.message}`);
  }
}

export async function updateBrand(
  slug: string,
  patch: Partial<Omit<BrandInput, 'slug'>>
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.nameKo !== undefined) row.name_ko = patch.nameKo || null;
  if (patch.tagline !== undefined) row.tagline = patch.tagline || null;
  if (patch.story !== undefined) row.story = paragraphsToStory(patch.story) || null;
  if (patch.origin !== undefined) row.origin = patch.origin || null;
  if (patch.since !== undefined) row.since = patch.since || null;
  if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl || null;
  if (patch.isVisible !== undefined) row.is_visible = patch.isVisible;
  if (patch.isFeatured !== undefined) row.is_featured = patch.isFeatured;
  if (patch.displayOrder !== undefined) row.display_order = patch.displayOrder;

  const result = await supabase
    .from(BRAND_TABLE)
    .update(row)
    .eq('slug', slug)
    .select('slug');
  if (result.error && isMissingTable(result.error.code)) throw missingTableError('brands');
  assertWritten(result, '브랜드를 수정하지 못했습니다');
}

export async function deleteBrand(slug: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const result = await supabase
    .from(BRAND_TABLE)
    .delete()
    .eq('slug', slug)
    .select('slug');
  assertWritten(result, '브랜드를 삭제하지 못했습니다');
}

/** 드래그로 바꾼 순서를 한 번에 저장합니다. 10 단위로 다시 매깁니다. */
export async function reorder(
  table: 'categories' | 'brands',
  slugs: string[]
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  for (let index = 0; index < slugs.length; index += 1) {
    const { error } = await supabase
      .from(table)
      .update({ display_order: (index + 1) * 10 })
      .eq('slug', slugs[index]);
    if (error) {
      if (isMissingTable(error.code)) throw missingTableError(table);
      throw new Error(`순서를 저장하지 못했습니다: ${error.message}`);
    }
  }
}

/** 새 항목의 display_order — 마지막 값 + 10 */
async function nextOrder(table: string, parentSlug: string | null): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 10;

  let query = supabase
    .from(table)
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1);
  if (table === CATEGORY_TABLE) {
    query = parentSlug ? query.eq('parent_slug', parentSlug) : query.is('parent_slug', null);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return 10;
  return ((data[0] as { display_order: number | null }).display_order ?? 0) + 10;
}
