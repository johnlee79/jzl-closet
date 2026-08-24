'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
      /*
        ★ 넘어온 값을 통째로 넘깁니다. 항목을 손으로 하나씩 적지 않습니다.
          예전에는 { label, nameKo, description, isVisible } 네 개만 적어 두었습니다.
          3-K 에서 대표 이미지(imageUrl)를 넣었더니, 화면에서는 올라가고 서버까지
          넘어오는데 여기서 조용히 버려져 저장을 누르면 이미지가 사라졌습니다.
          오류도 나지 않아 어디서 새는지 보이지 않았습니다.
        ★ 브랜드 저장(saveBrandAction)은 처음부터 이 방식이라 같은 일이 없었습니다.
          두 곳의 방식을 맞춰 둡니다. 앞으로 CategoryInput 에 칸을 더해도
          이 파일을 고칠 필요가 없습니다.
        ★ slug 와 parentSlug 는 빼냅니다. 등록 후 바꾸지 않는 값입니다. (검색 색인 유지)
      */
      const { slug, parentSlug, ...patch } = input;
      void slug;
      void parentSlug;
      await updateCategory(input.slug, patch);
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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
