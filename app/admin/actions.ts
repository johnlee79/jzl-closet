'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
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
} from '@/lib/products';
import type { Product, ProductInput } from '@/lib/types';

/** 액션 결과 — 화면에서 그대로 메시지로 보여 줍니다. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * 미들웨어가 /admin/* 를 이미 막고 있지만,
 * 서버 액션은 직접 호출될 수도 있으므로 여기서 한 번 더 확인합니다.
 */
async function assertAdmin(): Promise<boolean> {
  return verifySessionToken(cookies().get(ADMIN_COOKIE)?.value);
}

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
  revalidatePath('/brand');
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
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const updated = await patchProduct(id, patch);
    await revalidateStorefront([updated]);
    revalidatePath('/admin/products');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '수정에 실패했습니다.');
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const before = await getProductById(id);
    await deleteProduct(id);
    await revalidateStorefront([before]);
    revalidatePath('/admin/products');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '삭제에 실패했습니다.');
  }
}

/** 복제 — 이름 뒤 " (사본)", slug 뒤 "-copy". 새로 만든 상품 id 를 돌려줍니다. */
export async function duplicateProductAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
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
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await deleteTemplate(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '템플릿 삭제에 실패했습니다.');
  }
}
