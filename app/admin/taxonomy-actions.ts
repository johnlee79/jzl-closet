'use server';

import { cookies } from 'next/headers';
import { revalidatePath, revalidateTag } from 'next/cache';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import {
  TAXONOMY_TAG,
  countChildCategories,
  countProductsInCategory,
  countProductsInSubCategory,
  countProductsOfBrand,
  createBrand,
  createCategory,
  deleteBrand,
  deleteCategory,
  getCategories,
  reorder,
  updateBrand,
  updateCategory,
  type BrandInput,
  type CategoryInput,
} from '@/lib/taxonomy';
import { findCategory } from '@/lib/categories';

/**
 * 분류·브랜드 관리 서버 액션.
 *
 * ★ slug 는 등록 후 절대 바꾸지 않습니다. 주소가 바뀌면 검색 색인이 초기화됩니다.
 *   그래서 수정 액션은 slug 를 "찾는 키" 로만 쓰고 값으로는 받지 않습니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function assertAdmin(): Promise<boolean> {
  return verifySessionToken(cookies().get(ADMIN_COOKIE)?.value);
}

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin/taxonomy]', message);
  return { ok: false, error: message };
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function checkSlug(slug: string): string | null {
  if (!slug.trim()) return 'slug 를 입력해 주세요.';
  if (!SLUG_PATTERN.test(slug)) {
    return 'slug 는 영문 소문자·숫자·하이픈만 쓸 수 있습니다.';
  }
  return null;
}

/**
 * 분류·브랜드가 바뀌면 프론트 전체를 다시 굽습니다.
 * 메뉴·푸터·사이트맵이 모든 페이지에 들어 있어 부분 갱신이 의미가 없습니다.
 */
function revalidateAll(): void {
  revalidateTag(TAXONOMY_TAG);
  revalidatePath('/', 'layout');
  revalidatePath('/sitemap.xml');
}

/* ==================================================================
 * 분류
 * ================================================================== */

export async function saveCategoryAction(
  input: CategoryInput,
  isNew: boolean
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (!input.label.trim()) return { ok: false, error: '라벨을 입력해 주세요.' };
  if (!input.nameKo.trim()) return { ok: false, error: '한글명을 입력해 주세요.' };

  try {
    if (isNew) {
      const problem = checkSlug(input.slug);
      if (problem) return { ok: false, error: problem };

      // 대분류·소분류를 한 테이블에 담으므로 slug 는 전체에서 유일해야 합니다.
      const categories = await getCategories();
      const taken =
        categories.some((category) => category.slug === input.slug) ||
        categories.some((category) =>
          category.children.some((child) => child.slug === input.slug)
        );
      if (taken) return { ok: false, error: `이미 쓰고 있는 slug 입니다: ${input.slug}` };

      await createCategory(input);
    } else {
      await updateCategory(input.slug, {
        label: input.label,
        nameKo: input.nameKo,
        description: input.description,
        isVisible: input.isVisible,
      });
    }

    revalidateAll();
    revalidatePath('/admin/categories');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '분류를 저장하지 못했습니다.');
  }
}

export async function toggleCategoryAction(
  slug: string,
  isVisible: boolean
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await updateCategory(slug, { isVisible });
    revalidateAll();
    revalidatePath('/admin/categories');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '노출 설정을 바꾸지 못했습니다.');
  }
}

/** 드래그로 바꾼 순서를 저장합니다. slug 를 화면에 보이는 순서대로 넘기세요. */
export async function reorderCategoriesAction(slugs: string[]): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await reorder('categories', slugs);
    revalidateAll();
    revalidatePath('/admin/categories');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '순서를 저장하지 못했습니다.');
  }
}

/**
 * 삭제. 상품이 한 개라도 있으면 막고 개수를 알려 줍니다.
 * 대분류는 소분류가 남아 있어도 막습니다. (소분류가 미아가 되기 때문입니다)
 */
export async function deleteCategoryAction(
  slug: string,
  isSub: boolean
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const used = isSub
      ? await countProductsInSubCategory(slug)
      : await countProductsInCategory(slug);
    if (used > 0) {
      return {
        ok: false,
        error: `이 분류에 속한 상품이 ${used}개 있습니다. 상품의 분류를 먼저 옮긴 뒤 삭제해 주세요.`,
      };
    }

    if (!isSub) {
      const children = await countChildCategories(slug);
      if (children > 0) {
        return {
          ok: false,
          error: `소분류가 ${children}개 남아 있습니다. 소분류를 먼저 삭제해 주세요.`,
        };
      }
    }

    await deleteCategory(slug);
    revalidateAll();
    revalidatePath('/admin/categories');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '분류를 삭제하지 못했습니다.');
  }
}

/** 소분류 순서 저장 — 대분류 안에서만 다시 매깁니다. */
export async function reorderSubCategoriesAction(
  parentSlug: string,
  slugs: string[]
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    // 넘어온 slug 들이 정말 이 대분류의 자식인지 확인합니다.
    const parent = findCategory(await getCategories(), parentSlug);
    const known = new Set((parent?.children ?? []).map((child) => child.slug));
    if (slugs.some((slug) => !known.has(slug))) {
      return { ok: false, error: '순서 정보가 맞지 않습니다. 새로고침 후 다시 시도해 주세요.' };
    }

    await reorder('categories', slugs);
    revalidateAll();
    revalidatePath('/admin/categories');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '순서를 저장하지 못했습니다.');
  }
}

/* ==================================================================
 * 브랜드
 * ================================================================== */

export async function saveBrandAction(
  input: BrandInput,
  isNew: boolean
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (!input.label.trim()) return { ok: false, error: '라벨을 입력해 주세요.' };
  if (!input.name.trim()) return { ok: false, error: '정식 표기(name)를 입력해 주세요.' };

  try {
    if (isNew) {
      const problem = checkSlug(input.slug);
      if (problem) return { ok: false, error: problem };
      await createBrand(input);
    } else {
      const { slug, ...patch } = input;
      void slug; // slug 는 바꾸지 않습니다
      await updateBrand(input.slug, patch);
    }

    revalidateAll();
    revalidatePath(`/brand/${input.slug}`);
    revalidatePath('/admin/brands');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '브랜드를 저장하지 못했습니다.');
  }
}

export async function toggleBrandAction(
  slug: string,
  patch: { isVisible?: boolean; isFeatured?: boolean }
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await updateBrand(slug, patch);
    revalidateAll();
    revalidatePath('/admin/brands');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '설정을 바꾸지 못했습니다.');
  }
}

export async function reorderBrandsAction(slugs: string[]): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await reorder('brands', slugs);
    revalidateAll();
    revalidatePath('/admin/brands');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '순서를 저장하지 못했습니다.');
  }
}

export async function deleteBrandAction(slug: string): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const used = await countProductsOfBrand(slug);
    if (used > 0) {
      return {
        ok: false,
        error: `이 브랜드의 상품이 ${used}개 있습니다. 상품의 브랜드를 먼저 바꾼 뒤 삭제해 주세요.`,
      };
    }

    await deleteBrand(slug);
    revalidateAll();
    revalidatePath('/admin/brands');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '브랜드를 삭제하지 못했습니다.');
  }
}
