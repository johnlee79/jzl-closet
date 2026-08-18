import 'server-only';
import { assertWritten } from '@/lib/db-write';

import { findCategory } from '@/lib/categories';
import {
  buildCombinationKeys,
  cleanOptionValue,
  fromCombinationKey,
  isProductSoldOut,
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
  // ★ 컬럼 이름은 thumbnails 입니다. images 로 잘못 적어 두는 바람에
  //   3-C 이후 관리자 상품 목록이 계속 비어 있었습니다. (건수만 맞고 목록은 0건)
  'thumbnails',
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
  return readProducts(filter, filter.light ? LIST_COLUMNS : '*');
}

/** 아직 없는 컬럼을 골랐을 때 오는 코드 */
const MISSING_COLUMN = '42703';

/**
 * 검색어와 이름이 닮은 브랜드의 slug 를 찾아 둡니다.
 *
 * ★ 상품 테이블에는 브랜드가 slug(`ganni`) 로만 들어 있습니다.
 *   그래서 "가니" 라고 쳐도 상품 테이블만 뒤져서는 절대 걸리지 않습니다.
 *   브랜드 테이블에서 표기(label)·정식명(name)·한글명(name_ko) 을 먼저 훑어
 *   해당하는 slug 목록을 얻은 다음, 그 slug 로 상품을 찾습니다.
 *   이렇게 해야 한글로 쳐도 영문으로 쳐도 같은 상품이 나옵니다.
 */
async function brandSlugsMatching(term: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !term) return [];

  const like = `%${term}%`;
  const { data, error } = await supabase
    .from('brands')
    .select('slug')
    .or(`slug.ilike.${like},label.ilike.${like},name.ilike.${like},name_ko.ilike.${like}`);

  if (error) {
    console.error('[products] 브랜드 이름 검색 실패:', error.message);
    return [];
  }
  return (data as { slug: string }[]).map((row) => row.slug);
}

/** 검색어에 쓸 수 없는 글자를 걷어냅니다. (or 구문이 깨집니다) */
function cleanTerm(search: string): string {
  return search.replace(/[%,().]/g, '').trim();
}

function searchClause(term: string, brandSlugs: string[]): string {
  const parts = [`name.ilike.%${term}%`, `slug.ilike.%${term}%`, `brand_slug.ilike.%${term}%`];
  // 이름이 닮은 브랜드가 있으면 그 브랜드의 상품도 모두 검색 결과에 넣습니다.
  if (brandSlugs.length > 0) parts.push(`brand_slug.in.(${brandSlugs.join(',')})`);
  return parts.join(',');
}

/**
 * 목록 조회와 건수 조회에 똑같은 조건을 겁니다.
 *
 * ★ 예전에는 두 곳에 조건을 따로 적어 두어서, 조건이 하나만 빠져도
 *   "전체 3개"라고 써 놓고 목록에는 1개만 나오는 어긋남이 생겼습니다.
 *   조건을 다는 곳을 이 함수 하나로 모아 두면 그런 일이 생기지 않습니다.
 */
/**
 * 조건을 걸 수 있는 최소한의 모양.
 * supabase 빌더의 진짜 타입은 조건을 걸 때마다 겹겹이 불어나서
 * 그대로 쓰면 타입 검사가 끝나지 않습니다. 필요한 두 개만 추려 씁니다.
 */
type Filterable = {
  eq: (column: string, value: never) => Filterable;
  or: (query: string) => Filterable;
};

function applyFilter<T>(query: T, filter: ProductFilter, searchOr: string): T {
  let q = query as Filterable;
  if (!filter.includeHidden) q = q.eq('is_visible', true as never);
  if (filter.visible !== undefined) q = q.eq('is_visible', filter.visible as never);
  if (filter.categorySlug) q = q.eq('category_slug', filter.categorySlug as never);
  if (filter.subCategorySlug) q = q.eq('sub_category_slug', filter.subCategorySlug as never);
  if (filter.brandSlug) q = q.eq('brand_slug', filter.brandSlug as never);
  if (filter.gender) q = q.eq('gender', filter.gender as never);
  if (filter.onlySale) q = q.eq('is_sale', true as never);
  if (filter.soldOut !== undefined) q = q.eq('is_sold_out', filter.soldOut as never);
  if (searchOr) q = q.or(searchOr);
  return q as T;
}

async function readProducts(
  filter: ProductFilter,
  columns: string,
  searchOr?: string
): Promise<Product[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const term = filter.search ? cleanTerm(filter.search) : '';
  const or =
    searchOr ?? (term ? searchClause(term, await brandSlugsMatching(term)) : '');

  let query = applyFilter(supabase.from(TABLE).select(columns), filter, or);

  query = query.order('display_order', { ascending: true }).order('created_at', {
    ascending: false,
  });

  if (filter.limit !== undefined) {
    const from = filter.offset ?? 0;
    query = query.range(from, from + filter.limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    /*
     * ★ 고른 컬럼 중 하나가 없으면 조회 전체가 실패해 목록이 통째로 비어 버립니다.
     *   화면에는 건수만 맞고 상품은 하나도 안 보이는 상태가 됩니다.
     *   실제로 그 일이 있었기에, 컬럼 문제일 때는 전체 컬럼으로 한 번 더 읽습니다.
     *   (느려지지만 빈 화면보다는 낫습니다. 로그를 보고 컬럼 목록을 고치면 됩니다)
     */
    if (error.code === MISSING_COLUMN && columns !== '*') {
      console.error('[products] 컬럼 목록이 스키마와 다릅니다:', error.message);
      return readProducts(filter, '*', or);
    }
    console.error('[products] 목록 조회 실패:', error.message);
    return [];
  }
  return (data as unknown as ProductRow[]).map(rowToProduct);
}

/** 관리자 목록용 — 전체 개수까지 함께 돌려줍니다. */
export async function getProductsWithCount(
  filter: ProductFilter = {}
): Promise<{ products: Product[]; total: number; totalAll: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { products: [], total: 0, totalAll: 0 };

  // 검색어에 걸리는 브랜드는 한 번만 찾아서 목록·건수·전체건수에 함께 씁니다.
  const term = filter.search ? cleanTerm(filter.search) : '';
  const or = term ? searchClause(term, await brandSlugsMatching(term)) : '';

  const countQuery = applyFilter(
    supabase.from(TABLE).select('id', { count: 'exact', head: true }),
    filter,
    or
  );

  /*
   * ★ 조건을 하나도 걸지 않았을 때의 전체 건수도 같이 셉니다.
   *   "조건에 맞는 상품 2개 · 전체 31개" 처럼 보여 주려면 둘 다 필요합니다.
   *   숨김 상품 포함 여부(includeHidden)만 맞춰 두고 나머지 조건은 뺍니다.
   */
  let allQuery = supabase.from(TABLE).select('id', { count: 'exact', head: true });
  if (!filter.includeHidden) allQuery = allQuery.eq('is_visible', true);

  const [{ count }, { count: allCount }, products] = await Promise.all([
    countQuery,
    allQuery,
    readProducts(filter, filter.light ? LIST_COLUMNS : '*', or),
  ]);

  return {
    products,
    total: count ?? products.length,
    totalAll: allCount ?? count ?? products.length,
  };
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

/**
 * ============================================================
 * 상품 상세 하단에 함께 나가는 이웃 상품들 (3-H C-2)
 * ============================================================
 *
 * ★ DB 조회는 딱 한 번입니다.
 *   예전에는 getRelated 와 getBrandRelated 가 각자 getProducts 를 불러
 *   상품 하나를 그릴 때마다 두 번씩 읽었습니다. 두 목록 모두 "노출 중인 상품"
 *   이라는 같은 모집단에서 골라내는 일이라, 한 번 읽어 코드로 나누면 충분합니다.
 *   상세는 ISR 로 구워 두는 페이지라 이 한 번도 굽는 시점에만 일어납니다.
 *
 * ★ light 로 읽습니다. 카드에 쓰는 컬럼만 가져오면 되고,
 *   상세 본문(detail_blocks)·실측표는 카드에 나오지 않습니다.
 *   상품 하나에 이미지·문단이 수십 개씩 들어 있어 전송량 차이가 큽니다.
 *
 * ★ 추천 순서 — 무작위가 아닙니다. 가까운 것부터 채웁니다.
 *     1. 같은 브랜드 + 같은 소분류   (가장 닮은 것)
 *     2. 같은 브랜드
 *     3. 같은 소분류
 *     4. 같은 대분류
 *   여기까지에서도 못 채우면 그냥 모자란 채로 둡니다.
 *   대분류까지 다른 상품을 억지로 끼워 넣으면 추천이 아니라 아무 상품 나열입니다.
 *
 * ★ 품절은 추천에서 뺍니다. 눌러 봐야 살 수 없는 상품을 권하는 셈입니다.
 *   다만 '이 브랜드의 다른 상품' 은 품절도 그대로 둡니다. 그쪽은 추천이 아니라
 *   브랜드가 무엇을 다루는지 보여 주는 자리라, 품절 딱지가 붙은 채로도 뜻이 있습니다.
 */
export async function getProductNeighbours(
  product: Product,
  options: { related?: number; brand?: number } = {}
): Promise<{ related: Product[]; brandRelated: Product[] }> {
  const relatedCount = options.related ?? 8;
  const brandCount = options.brand ?? 4;

  // ── 여기 한 번이 전부입니다 ─────────────────────────────
  const pool = (await getProducts({ light: true })).filter(
    (item) => item.id !== product.id
  );

  const brandRelated = product.brandSlug
    ? pool.filter((item) => item.brandSlug === product.brandSlug).slice(0, brandCount)
    : [];

  const sameBrand = (item: Product) =>
    Boolean(product.brandSlug) && item.brandSlug === product.brandSlug;
  // 소분류가 없는 상품은 "같은 소분류" 가 성립하지 않습니다. null 끼리 묶지 않습니다.
  const sameSub = (item: Product) =>
    Boolean(product.subCategorySlug) && item.subCategorySlug === product.subCategorySlug;
  const sameCategory = (item: Product) => item.categorySlug === product.categorySlug;

  const candidates = pool.filter((item) => !isProductSoldOut(item));
  const tiers = [
    candidates.filter((item) => sameBrand(item) && sameSub(item)),
    candidates.filter((item) => sameBrand(item) && !sameSub(item)),
    candidates.filter((item) => !sameBrand(item) && sameSub(item)),
    candidates.filter((item) => !sameBrand(item) && !sameSub(item) && sameCategory(item)),
  ];

  // 앞 단계에서 이미 담은 상품이 뒤 단계에 또 나오지 않도록 걸러 가며 채웁니다.
  const picked: Product[] = [];
  const seen = new Set<string>();
  for (const tier of tiers) {
    for (const item of tier) {
      if (picked.length >= relatedCount) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      picked.push(item);
    }
  }

  return { related: picked, brandRelated };
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
