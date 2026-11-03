'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import {
  createProduct,
  createTemplate,
  deleteProduct,
  deleteTemplate,
  duplicateProduct,
  getProductById,
  getProductBySlug,
  patchProduct,
  updateProduct,
  countOrderLinesForProduct,
  listProductsForPicker,
} from '@/lib/products';
import {
  countReviewsForProduct,
  deleteReviewsForProduct,
  moveReviewsToProduct,
} from '@/lib/reviews';
import type { Product, ProductInput } from '@/lib/types';

/** 액션 결과 — 화면에서 그대로 메시지로 보여 줍니다. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin]', message);
  return { ok: false, error: message };
}

/**
 * 프론트를 즉시 다시 굽습니다. 60초를 기다리지 않고 바로 반영됩니다.
 * 상품이 옮겨 다녔을 수 있으므로 이전/이후 경로를 모두 넘겨 주세요.
 */
async function revalidateStorefront(products: (Product | null)[]): Promise<void> {
  revalidatePath('/');
  revalidatePath('/products');
  // 브랜드 목록은 상품 수를 함께 보여 주므로 상품이 바뀌면 같이 다시 굽습니다.
  revalidatePath('/brands');
  revalidatePath('/sitemap.xml');

  for (const product of products) {
    if (!product) continue;
    revalidatePath(`/products/${product.slug}`);
    if (product.categorySlug) {
      revalidatePath(`/category/${product.categorySlug}`);
      if (product.subCategorySlug) {
        revalidatePath(`/category/${product.categorySlug}/${product.subCategorySlug}`);
      }
    }
    // 전체·세일 모음 카테고리도 함께 갱신합니다.
    revalidatePath('/category/all');
    revalidatePath('/category/sale');
    if (product.brandSlug) revalidatePath(`/brand/${product.brandSlug}`);
  }
}

/** 목록에서 바로 고치는 항목 (가격·품절·노출·진열순서) */
export async function patchProductAction(
  id: string,
  patch: Partial<
    Pick<Product, 'price' | 'isSoldOut' | 'isVisible' | 'displayOrder' | 'isNew' | 'isSale'>
  >
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const updated = await patchProduct(id, patch);
    await revalidateStorefront([updated]);
    revalidatePath('/admin/products');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '수정에 실패했습니다.');
  }
}

/**
 * 지우기 전에 보여 줄 것 — 붙은 후기·주문, 그리고 후기를 옮길 후보 상품.
 * ★ 화면은 이걸 보고 「후기를 다른 상품으로 옮기기 / 같이 지우기 / 취소」 를 고르게 합니다.
 */
export type ProductDeleteImpact = {
  reviews: { total: number; imported: number; own: number };
  orderLines: number;
  /** 옮길 곳 후보. 같은 출처·상품번호 → 같은 이름 순으로 먼저 놓고 suggested 를 켭니다. */
  targets: { id: string; slug: string; name: string; suggested: boolean }[];
};

export async function getProductDeleteImpactAction(
  id: string
): Promise<ActionResult<ProductDeleteImpact>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  try {
    const product = await getProductById(id);
    const [reviews, orderLines] = await Promise.all([
      countReviewsForProduct(id),
      countOrderLinesForProduct(id),
    ]);
    let targets: ProductDeleteImpact['targets'] = [];
    if (reviews.total > 0) {
      const all = (await listProductsForPicker()).filter((p) => p.id !== id);
      const isSuggested = (p: (typeof all)[number]) =>
        Boolean(
          product &&
            ((product.source &&
              product.sourceProductNo &&
              p.source === product.source &&
              p.sourceProductNo === product.sourceProductNo) ||
              p.name.trim() === product.name.trim())
        );
      targets = all
        .map((p) => ({ id: p.id, slug: p.slug, name: p.name, suggested: isSuggested(p) }))
        .sort((a, b) => Number(b.suggested) - Number(a.suggested));
    }
    return { ok: true, data: { reviews, orderLines, targets } };
  } catch (error) {
    return fail(error, '삭제 전 확인에 실패했습니다.');
  }
}

/**
 * 상품 삭제.
 * ★ 붙은 후기가 있으면 reviews 로 어떻게 할지 꼭 받아야 지웁니다 (2026-11-03).
 *   예전엔 그냥 지워서 후기가 「지워진 상품」 에 남았고, 손님 화면 어디에도 안 보이면서
 *   같은 후기를 다시 가져올 수도 없었습니다 (뉴욕트렌딕 26번 · 25건).
 * ★ 주문이 붙은 상품은 지우지 않습니다. 숨김으로 돌리라고 돌려보냅니다.
 */
export async function deleteProductAction(
  id: string,
  options?: { reviews?: 'move' | 'delete'; moveToId?: string }
): Promise<ActionResult<{ movedReviews: number; deletedReviews: number }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const before = await getProductById(id);

    const orderLines = await countOrderLinesForProduct(id);
    if (orderLines > 0) {
      return {
        ok: false,
        error: `주문 ${orderLines}줄이 붙은 상품이라 지우지 않았습니다. 「노출」 을 꺼서 숨김으로 두세요.`,
      };
    }

    const reviews = await countReviewsForProduct(id);
    let movedReviews = 0;
    let deletedReviews = 0;
    let target: Product | null = null;
    if (reviews.total > 0) {
      if (options?.reviews === 'move') {
        if (!options.moveToId || options.moveToId === id) {
          return { ok: false, error: '후기를 옮길 상품을 골라 주세요.' };
        }
        target = await getProductById(options.moveToId);
        if (!target) return { ok: false, error: '후기를 옮길 상품을 찾지 못했습니다.' };
        movedReviews = await moveReviewsToProduct(id, target.id, target.slug);
      } else if (options?.reviews === 'delete') {
        deletedReviews = await deleteReviewsForProduct(id);
      } else {
        return {
          ok: false,
          error: `이 상품에 후기 ${reviews.total}건이 붙어 있습니다. 옮길지 같이 지울지 골라 주세요.`,
        };
      }
    }

    /*
     * ★ 이미 지워져 있어도 성공입니다. (deleteProduct 가 false 를 돌려줍니다)
     *   원한 결과는 이미 이뤄져 있습니다. 여기서 오류를 내면 사장님이
     *   "안 지워졌구나" 하고 또 누르게 됩니다.
     * ★ 그래도 화면은 반드시 새로 그립니다. 목록에 남아 있는 옛 줄을
     *   치우는 것이 이 상황에서 정말 필요한 일입니다.
     */
    await deleteProduct(id);
    await revalidateStorefront([before, target]);
    revalidatePath('/admin/products');
    if (movedReviews || deletedReviews) revalidatePath('/admin/reviews');
    return { ok: true, data: { movedReviews, deletedReviews } };
  } catch (error) {
    return fail(error, '삭제에 실패했습니다.');
  }
}

/** 복제 — 이름 뒤 " (사본)", slug 뒤 "-copy". 새로 만든 상품 id 를 돌려줍니다. */
export async function duplicateProductAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const copy = await duplicateProduct(id);
    revalidatePath('/admin/products');
    return { ok: true, data: { id: copy.id } };
  } catch (error) {
    return fail(error, '복제에 실패했습니다.');
  }
}

function validate(input: ProductInput): string | null {
  if (!input.name.trim()) return '상품명을 입력해 주세요.';
  if (!input.slug.trim()) return 'slug 를 입력해 주세요.';
  if (!/^[a-z0-9-]+$/.test(input.slug)) {
    return 'slug 는 영문 소문자·숫자·하이픈만 쓸 수 있습니다.';
  }
  if (!input.categorySlug) return '대분류를 선택해 주세요.';
  if (!Number.isFinite(input.price) || input.price < 0) {
    return '판매가를 숫자로 입력해 주세요.';
  }
  return null;
}

/** 상품 등록·수정. id 를 주면 수정, 없으면 새로 만듭니다. */
export async function saveProductAction(
  input: ProductInput,
  id?: string
): Promise<ActionResult<{ id: string; slug: string }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const problem = validate(input);
  if (problem) return { ok: false, error: problem };

  try {
    // slug 중복은 DB 제약보다 먼저 걸러 친절한 메시지를 보여 줍니다.
    const sameSlug = await getProductBySlug(input.slug);
    if (sameSlug && sameSlug.id !== id) {
      return { ok: false, error: `이미 쓰고 있는 slug 입니다: ${input.slug}` };
    }

    const before = id ? await getProductById(id) : null;
    const saved = id ? await updateProduct(id, input) : await createProduct(input);

    await revalidateStorefront([before, saved]);
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${saved.id}`);

    return { ok: true, data: { id: saved.id, slug: saved.slug } };
  } catch (error) {
    return fail(error, '저장에 실패했습니다.');
  }
}

/* ── 문구 템플릿 ───────────────────────────────────────────── */

export async function createTemplateAction(
  title: string,
  body: string
): Promise<ActionResult<{ id: string; title: string; body: string }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!title.trim()) return { ok: false, error: '템플릿 제목을 입력해 주세요.' };
  if (!body.trim()) return { ok: false, error: '템플릿 내용을 입력해 주세요.' };

  try {
    const template = await createTemplate(title.trim(), body);
    return {
      ok: true,
      data: { id: template.id, title: template.title, body: template.body },
    };
  } catch (error) {
    return fail(error, '템플릿 저장에 실패했습니다.');
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await deleteTemplate(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '템플릿 삭제에 실패했습니다.');
  }
}
