import CategoryManager from '@/components/admin/CategoryManager';
import { sortedCategories } from '@/lib/categories';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import {
  countProductsGrouped,
  getCategories,
  isTaxonomyReady,
  isTaxonomySeeded,
} from '@/lib/taxonomy';

/** 관리자 목록은 항상 최신 DB 값을 봅니다. */
export const dynamic = 'force-dynamic';

export const metadata = { title: '분류 관리' };

export default async function AdminCategoriesPage() {
  const configured = isSupabaseConfigured();
  const [categories, counts, ready, seeded] = await Promise.all([
    getCategories(),
    countProductsGrouped(),
    configured ? isTaxonomyReady() : Promise.resolve(false),
    configured ? isTaxonomySeeded() : Promise.resolve(false),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <h1 className="text-[20px] font-semibold text-slate-900">분류 관리</h1>
      <p className="mt-1 text-[13px] text-slate-600">
        대분류 {categories.length}개 · 소분류{' '}
        {categories.reduce((sum, item) => sum + item.children.length, 0)}개
      </p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : !ready ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900">
          categories 테이블이 아직 없습니다. Supabase SQL Editor 에서{' '}
          <code>supabase/schema-1b.sql</code> 을 실행한 뒤{' '}
          <code>supabase/seed-1b.sql</code> 을 이어서 실행해 주세요. 그 전까지는 아래 목록이
          코드에 들어 있는 기본값(읽기 전용)입니다.
        </div>
      ) : !seeded ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[14px] leading-relaxed text-amber-900">
          categories 테이블이 비어 있어 기본값을 보여 주고 있습니다.{' '}
          <code>supabase/seed-1b.sql</code> 을 실행하면 아래 목록이 DB 로 옮겨집니다.
        </div>
      ) : null}

      <div className="mt-5">
        <CategoryManager categories={sortedCategories(categories)} counts={counts} />
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-slate-500">
        slug 는 주소(/category/clothing)에 쓰입니다. 등록 후에 바꾸면 검색 색인이
        초기화되므로 수정할 수 없게 막아 두었습니다.
        <br />
        slug 가 <code>all</code> 인 분류는 전체 상품을, <code>sale</code> 인 분류는 세일
        상품을 자동으로 모아 보여 줍니다.
      </p>
    </div>
  );
}
