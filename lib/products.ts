import 'server-only';
import { assertWritten } from '@/lib/db-write';

import { findCategory } from '@/lib/categories';
import {
  buildCombinationKeys,
  cleanOptionValue,
  fromCombinationKey,
  rebuildCombinations,
} from '@/lib/product-utils';
import { getSupabaseAdmin, requireSupabaseAdmin } from '@/lib/supabase/server';
import { getCachedCategories } from '@/lib/taxonomy';
import type {
  DetailBlock,
  Measurement,
  OptionCombination,
  OptionGroup,
  Product,
  ProductFilter,
  ProductInput,
  ProductRow,
  StoredOptions,
  Template,
  TemplateRow,
} from '@/lib/types';

const TABLE = 'products';

/* ------------------------------------------------------------------
 * DB row → 앱 타입 변환
 * ------------------------------------------------------------------ */

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/* ── 옵션 ────────────────────────────────────────────────────
 * DB 의 options(jsonb) 는 두 가지 형태가 섞여 있을 수 있습니다.
 *   (구) [{ name, values, soldOutValues }]            ← 조합 개념이 없던 시절
 *   (신) { groups: [...], combinations: [...] }
 * 읽을 때 항상 신 형태로 맞춰 돌려줍니다.
 * ---------------------------------------------------------- */

type LegacyOption = { name?: unknown; values?: unknown; soldOutValues?: unknown };

function toGroup(option: LegacyOption): OptionGroup {
  const values = Array.isArray(option.values)
    ? option.values.map((value) => cleanOptionValue(String(value))).filter(Boolean)
    : [];
  return {
    name: String(option.name ?? '').trim(),
    // 같은 값이 두 번 들어가면 조합이 중복되므로 여기서 걸러 냅니다.
    values: Array.from(new Set(values)),
  };
}

function normalizeGroups(value: unknown): OptionGroup[] {
  return asArray<LegacyOption>(value)
    .filter((option) => option && typeof option === 'object')
    .map(toGroup)
    .filter((group) => group.name.length > 0);
}

function normalizeCombinations(value: unknown): OptionCombination[] {
  return asArray<Record<string, unknown>>(value)
    .filter((item) => typeof item?.key === 'string' && item.key.length > 0)
    .map((item) => ({
      key: String(item.key),
      isActive: item.isActive !== false,
      stock:
        typeof item.stock === 'number' && Number.isFinite(item.stock)
          ? Math.max(0, Math.trunc(item.stock))
          : null,
      extraPrice:
        typeof item.extraPrice === 'number' && Number.isFinite(item.extraPrice)
          ? Math.trunc(item.extraPrice)
          : 0,
    }));
}

/** 구 형식 → 신 형식. 품절 체크가 있던 값이 들어간 조합을 품절로 옮깁니다. */
function fromLegacyOptions(value: unknown): StoredOptions {
  const raw = asArray<LegacyOption>(value).filter(
    (option) => option && typeof option === 'object' && String(option.name ?? '').trim()
  );
  const groups = raw.map(toGroup);
  const soldOutByGroup = raw.map(
    (option) =>
      new Set(
        Array.isArray(option.soldOutValues)
          ? option.soldOutValues.map((item) => cleanOptionValue(String(item)))
          : []
      )
  );

  const combinations = buildCombinationKeys(groups).map((key) => {
    const parts = fromCombinationKey(key);
    const soldOut = parts.some((part, index) => soldOutByGroup[index]?.has(part));
    return { key, isActive: !soldOut, stock: null, extraPrice: 0 };
  });

  return { groups, combinations };
}

export function normalizeOptions(value: unknown): StoredOptions {
  let parsed: unknown = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      parsed = null;
    }
  }

  const options: StoredOptions = Array.isArray(parsed)
    ? fromLegacyOptions(parsed)
    : parsed && typeof parsed === 'object'
      ? {
          groups: normalizeGroups((parsed as { groups?: unknown }).groups),
          combinations: normalizeCombinations(
            (parsed as { combinations?: unknown }).combinations
          ),
        }
      : { groups: [], combinations: [] };

  // 그룹과 조합이 어긋나 있으면(값 추가·삭제 후 조합 미생성) 여기서 맞춰 줍니다.
  return {
    groups: options.groups,
    combinations: rebuildCombinations(options.groups, options.combinations),
  };
}

function normalizeMeasurements(value: unknown): Measurement[] {
  return asArray<Partial<Measurement>>(value)
    .filter((row) => typeof row?.label === 'string')
    .map((row) => ({ label: String(row.label), value: String(row.value ?? '') }));
}

function normalizeDetail(value: unknown): DetailBlock[] {
  return asArray<DetailBlock>(value).filter((block) => {
    if (!block || typeof block !== 'object') return false;
    return block.type === 'image' || block.type === 'text' || block.type === 'spec';
  });
}

export function rowToProduct(row: ProductRow): Product {
  const gender = row.gender === 'men' || row.gender === 'unisex' ? row.gender : 'women';
  const options = normalizeOptions(row.options);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brandSlug: row.brand_slug,
    categorySlug: row.category_slug,
    subCategorySlug: row.sub_category_slug,
    price: row.price,
    originalPrice: row.original_price,
    summary: row.summary ?? '',
    origin: row.origin,
    manufacturer: row.manufacturer,
    gender,
    season: row.season,
    thumbnails: asArray<string>(row.thumbnails).map(String),
    optionGroups: options.groups,
    optionCombinations: options.combinations,
    detail: normalizeDetail(row.detail_blocks),
    measurements: normalizeMeasurements(row.measurements),
    isNew: Boolean(row.is_new),
    isSale: Boolean(row.is_sale),
    isSoldOut: Boolean(row.is_sold_out),
    isVisible: row.is_visible !== false,
    freeShipping: Boolean(row.free_shipping),
    displayOrder: row.display_order ?? 0,
    sellstarId: row.sellstar_id ?? 0,
    sellstarSyncedAt: row.sellstar_synced_at ?? null,
    sellstarPrice: row.sellstar_price ?? 0,
    sellstarSalePrice: row.sellstar_sale_price ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function productToRow(input: ProductInput): Omit<ProductRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    slug: input.slug,
    name: input.name,
    brand_slug: input.brandSlug,
    category_slug: input.categorySlug,
    sub_category_slug: input.subCategorySlug,
    price: input.price,
    original_price: input.originalPrice,
    summary: input.summary,
    origin: input.origin,
    manufacturer: input.manufacturer,
    gender: input.gender,
    season: input.season,
    thumbnails: input.thumbnails,
    options: {
      groups: input.optionGroups,
      combinations: input.optionCombinations,
    } satisfies StoredOptions,
    detail_blocks: input.detail,
    measurements: input.measurements,
    is_new: input.isNew,
    is_sale: input.isSale,
    is_sold_out: input.isSoldOut,
    is_visible: input.isVisible,
    free_shipping: input.freeShipping,
    display_order: input.displayOrder,
    // ★ 셀스타에서 가져온 상품만 채웁니다. 손으로 등록한 상품은 건드리지 않습니다.
    ...(input.sellstarId > 0
      ? {
          sellstar_id: input.sellstarId,
          sellstar_synced_at: input.sellstarSyncedAt ?? new Date().toISOString(),
          sellstar_price: input.sellstarPrice,
          sellstar_sale_price: input.sellstarSalePrice,
        }
      : {}),
  };
}

/* ------------------------------------------------------------------
 * 조회 — DB 가 없어도 빌드가 죽지 않도록 빈 배열을 돌려줍니다.
 * ------------------------------------------------------------------ */

/** 상품 목록. filter 를 생략하면 전시 중인 상품만 진열 순서대로 돌려줍니다. */
/**
 * 목록 화면에 필요한 컬럼만.
 *
 * ★ detail_blocks(상세설명 전체)와 measurements 는 목록에서 쓰지 않습니다.
 *   상품 하나에 이미지·문단이 수십 개씩 들어 있어, 20개만 불러도 전송량이 크게 늘어납니다.
 *   목록 화면에서는 이 두 컬럼을 빼고 읽습니다.
 */
const LIST_COLUMNS = [
  'id',
  'slug',
  'name',
  'summary',
  'price',
  'original_price',
  'brand_slug',
  'category_slug',
  'sub_category_slug',
  'gender',
  'season',
  'origin',
  'manufacturer',
  'images',
  'options',
  'is_visible',
  'is_sold_out',
  'is_new',
  'is_sale',
  'free_shipping',
  'display_order',
  'created_at',
  'updated_at',
].join(', ');

export async function getProducts(filter: ProductFilter = {}): Promise<Product[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // ★ 목록에서는 상세설명을 빼고 읽습니다. (filter.light)
  let query = supabase.from(TABLE).select(filter.light ? LIST_COLUMNS : '*');

  if (!filter.includeHidden) query = query.eq('is_visible', true);
  if (filter.visible !== undefined) query = query.eq('is_visible', filter.visible);
  if (filter.categorySlug) query = query.eq('category_slug', filter.categorySlug);
  if (filter.subCategorySlug) query = query.eq('sub_category_slug', filter.subCategorySlug);
  if (filter.brandSlug) query = query.eq('brand_slug', filter.brandSlug);
  if (filter.gender) query = query.eq('gender', filter.gender);
  if (filter.onlySale) query = query.eq('is_sale', true);
  if (filter.soldOut !== undefined) query = query.eq('is_sold_out', filter.soldOut);
  if (filter.search) {
    const term = filter.search.replace(/[%,]/g, '');
    query = query.or(`name.ilike.%${term}%,brand_slug.ilike.%${term}%,slug.ilike.%${term}%`);
  }

  query = query.order('display_order', { ascending: true }).order('created_at', {
    ascending: false,
  });

  if (filter.limit !== undefined) {
    const from = filter.offset ?? 0;
    query = query.range(from, from + filter.limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[products] 목록 조회 실패:', error.message);
    return [];
  }
  return (data as unknown as ProductRow[]).map(rowToProduct);
}

/** 관리자 목록용 — 전체 개수까지 함께 돌려줍니다. */
export async function getProductsWithCount(
  filter: ProductFilter = {}
): Promise<{ products: Product[]; total: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { products: [], total: 0 };

  let countQuery = supabase.from(TABLE).select('id', { count: 'exact', head: true });
  if (!filter.includeHidden) countQuery = countQuery.eq('is_visible', true);
  if (filter.visible !== undefined) countQuery = countQuery.eq('is_visible', filter.visible);
  if (filter.categorySlug) countQuery = countQuery.eq('category_slug', filter.categorySlug);
  if (filter.soldOut !== undefined) countQuery = countQuery.eq('is_sold_out', filter.soldOut);
  if (filter.search) {
    const term = filter.search.replace(/[%,]/g, '');
    countQuery = countQuery.or(
      `name.ilike.%${term}%,brand_slug.ilike.%${term}%,slug.ilike.%${term}%`
    );
  }

  const [{ count }, products] = await Promise.all([countQuery, getProducts(filter)]);
  return { products, total: count ?? products.length };
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.from(TABLE).select('*').eq('slug', slug).maybeSingle();
  if (error || !data) return null;
  return rowToProduct(data as ProductRow);
}

/**
 * 상품 slug 하나만 가져옵니다.
 *
 * ★ 문의·리뷰가 바뀌었을 때 어느 상품 페이지를 다시 구울지 정하는 데만 씁니다.
 *   그것 때문에 상세설명까지 통째로 읽을 이유가 없습니다.
 */
export async function getProductSlugById(id: string): Promise<string> {
  if (!id) return '';
  const supabase = getSupabaseAdmin();
  if (!supabase) return '';

  const { data, error } = await supabase
    .from(TABLE)
    .select('slug')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return '';
  return (data as { slug: string }).slug ?? '';
}

export async function getProductById(id: string): Promise<Product | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return rowToProduct(data as ProductRow);
}

/**
 * 카테고리의 matchType 규칙에 따라 상품을 고릅니다.
 * 분류는 DB(또는 폴백)에서 읽으므로 함수 안에서 직접 가져옵니다.
 */
export async function getProductsByCategory(
  categorySlug: string,
  subCategorySlug?: string
): Promise<Product[]> {
  const category = findCategory(await getCachedCategories(), categorySlug);
  if (!category) return [];

  if (category.matchType === 'all') {
    return getProducts(subCategorySlug ? { subCategorySlug } : {});
  }
  if (category.matchType === 'flag') {
    return getProducts({ onlySale: true });
  }
  return getProducts({ categorySlug, subCategorySlug });
}

export async function getProductsByBrand(brandSlug: string): Promise<Product[]> {
  return getProducts({ brandSlug });
}

/** 신상품 우선 정렬로 count 개 */
export async function getNewProducts(count = 4): Promise<Product[]> {
  const products = await getProducts();
  const news = products.filter((product) => product.isNew);
  const rest = products.filter((product) => !product.isNew);
  return [...news, ...rest].slice(0, count);
}

/** 같은 소분류 → 같은 대분류 → 나머지 순으로 채웁니다. */
export async function getRelated(product: Product, count = 4): Promise<Product[]> {
  const products = await getProducts();
  const pool = products.filter((item) => item.id !== product.id);
  const sameSub = pool.filter(
    (item) =>
      item.categorySlug === product.categorySlug &&
      item.subCategorySlug === product.subCategorySlug
  );
  const sameCategory = pool.filter(
    (item) =>
      item.categorySlug === product.categorySlug &&
      item.subCategorySlug !== product.subCategorySlug
  );
  const others = pool.filter((item) => item.categorySlug !== product.categorySlug);
  return [...sameSub, ...sameCategory, ...others].slice(0, count);
}

/** 상품 상세 하단의 "이 브랜드의 다른 상품" */
export async function getBrandRelated(product: Product, count = 4): Promise<Product[]> {
  if (!product.brandSlug) return [];
  const products = await getProducts({ brandSlug: product.brandSlug });
  return products.filter((item) => item.id !== product.id).slice(0, count);
}

/** generateStaticParams · sitemap 용 */
export async function getAllProductSlugs(): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('slug')
    .eq('is_visible', true)
    .order('display_order', { ascending: true });
  if (error || !data) return [];
  return (data as { slug: string }[]).map((row) => row.slug);
}

/** sitemap 의 lastModified 용 */
export async function getProductSitemapRows(): Promise<
  { slug: string; updatedAt: string | null }[]
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('slug, updated_at')
    .eq('is_visible', true);
  if (error || !data) return [];
  return (data as { slug: string; updated_at: string | null }[]).map((row) => ({
    slug: row.slug,
    updatedAt: row.updated_at,
  }));
}

/* ------------------------------------------------------------------
 * 저장 — 관리자 전용. 실패하면 예외를 던집니다.
 * ------------------------------------------------------------------ */

export async function createProduct(input: ProductInput): Promise<Product> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .insert(productToRow(input))
    .select('*')
    .single();
  if (error) throw new Error(`상품 저장에 실패했습니다: ${error.message}`);
  return rowToProduct(data as ProductRow);
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .update(productToRow(input))
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`상품 수정에 실패했습니다: ${error.message}`);
  return rowToProduct(data as ProductRow);
}

/** 목록에서 바로 고치는 항목 (가격·품절·노출·진열순서) */
export async function patchProduct(
  id: string,
  patch: Partial<
    Pick<Product, 'price' | 'isSoldOut' | 'isVisible' | 'displayOrder' | 'isNew' | 'isSale'>
  >
): Promise<Product> {
  const supabase = requireSupabaseAdmin();
  const row: Record<string, unknown> = {};
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.isSoldOut !== undefined) row.is_sold_out = patch.isSoldOut;
  if (patch.isVisible !== undefined) row.is_visible = patch.isVisible;
  if (patch.displayOrder !== undefined) row.display_order = patch.displayOrder;
  if (patch.isNew !== undefined) row.is_new = patch.isNew;
  if (patch.isSale !== undefined) row.is_sale = patch.isSale;

  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`수정에 실패했습니다: ${error.message}`);
  return rowToProduct(data as ProductRow);
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase.from(TABLE).delete().eq('id', id).select('id'),
    '삭제에 실패했습니다'
  );
}

/** 상품 복제 — 이름 뒤 " (사본)", slug 뒤 "-copy". 이미지는 그대로 참조합니다. */
export async function duplicateProduct(id: string): Promise<Product> {
  const original = await getProductById(id);
  if (!original) throw new Error('복제할 상품을 찾을 수 없습니다.');

  let slug = `${original.slug}-copy`;
  let suffix = 2;
  // slug 는 유일해야 하므로 이미 있으면 번호를 붙인다
  while (await getProductBySlug(slug)) {
    slug = `${original.slug}-copy-${suffix}`;
    suffix += 1;
  }

  const input: ProductInput = {
    // ★ 사본에는 셀스타 연결을 물려주지 않습니다.
    //   같은 셀스타 번호가 두 상품에 붙으면 "다시 불러오기" 가 어느 쪽인지 알 수 없습니다.
    sellstarId: 0,
    sellstarSyncedAt: null,
    sellstarPrice: 0,
    sellstarSalePrice: 0,
    slug,
    name: `${original.name} (사본)`,
    brandSlug: original.brandSlug,
    categorySlug: original.categorySlug,
    subCategorySlug: original.subCategorySlug,
    price: original.price,
    originalPrice: original.originalPrice,
    summary: original.summary,
    origin: original.origin,
    manufacturer: original.manufacturer,
    gender: original.gender,
    season: original.season,
    thumbnails: original.thumbnails,
    optionGroups: original.optionGroups,
    optionCombinations: original.optionCombinations,
    detail: original.detail,
    measurements: original.measurements,
    isNew: original.isNew,
    isSale: original.isSale,
    isSoldOut: original.isSoldOut,
    isVisible: false, // 사본은 숨김으로 만들어 실수로 노출되지 않게 한다
    freeShipping: original.freeShipping,
    displayOrder: original.displayOrder,
  };
  return createProduct(input);
}

/* ------------------------------------------------------------------
 * 문구 템플릿
 * ------------------------------------------------------------------ */

export async function getTemplates(): Promise<Template[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as TemplateRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export async function createTemplate(title: string, body: string): Promise<Template> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from('templates')
    .insert({ title, body })
    .select('*')
    .single();
  if (error) throw new Error(`템플릿 저장에 실패했습니다: ${error.message}`);
  const row = data as TemplateRow;
  return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at };
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  assertWritten(
    await supabase.from('templates').delete().eq('id', id).select('id'),
    '템플릿 삭제에 실패했습니다'
  );
}

/* ------------------------------------------------------------------
 * 셀스타 연동 (3-D)
 * ------------------------------------------------------------------ */

/**
 * 셀스타 상품번호로 이미 가져온 상품을 찾습니다.
 * ★ 같은 상품을 두 번 등록하지 않도록 가져오기 화면에서 먼저 확인합니다.
 */
export async function getProductBySellstarId(
  sellstarId: number
): Promise<Product | null> {
  if (!sellstarId || sellstarId <= 0) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('sellstar_id', sellstarId)
    .limit(1)
    .maybeSingle();

  // sellstar_id 컬럼이 아직 없으면(schema-3d.sql 미실행) 조용히 넘어갑니다.
  if (error || !data) return null;
  return rowToProduct(data as ProductRow);
}
