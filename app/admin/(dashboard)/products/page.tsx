import Link from 'next/link';
import ProductTable from '@/components/admin/ProductTable';
import ProductFilters from '@/components/admin/ProductFilters';
import { filterableCategories } from '@/lib/categories';
import { getProductsWithCount } from '@/lib/products';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getBrands, getCategories } from '@/lib/taxonomy';
import type { ProductFilter } from '@/lib/types';

/** 관리자 목록은 항상 최신 데이터를 보여 줍니다. */
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  category?: string;
  visible?: string;
  soldOut?: string;
  page?: string;
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);
  const search = (searchParams.q ?? '').trim();

  const filter: ProductFilter = {
    includeHidden: true, // 관리자는 숨김 상품도 봐야 합니다
    // ★ 목록에는 상세설명이 필요 없습니다. 빼고 읽어 전송량을 줄입니다.
    light: true,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  if (search) filter.search = search;
  if (searchParams.category) filter.categorySlug = searchParams.category;
  if (searchParams.visible === 'true') filter.visible = true;
  if (searchParams.visible === 'false') filter.visible = false;
  if (searchParams.soldOut === 'true') filter.soldOut = true;
  if (searchParams.soldOut === 'false') filter.soldOut = false;

  const configured = isSupabaseConfigured();
  const [{ products, total }, allCategories, allBrands] = await Promise.all([
    configured ? getProductsWithCount(filter) : { products: [], total: 0 },
    getCategories(),
    getBrands(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categories = filterableCategories(allCategories);

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">상품 관리</h1>
          <p className="mt-1 text-[13px] text-slate-600">
            전체 {total}개 · {page}/{totalPages} 페이지
          </p>
        </div>
        <Link href="/admin/products/new" className="admin-btn-primary">
          + 새 상품 등록
        </Link>
      </div>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[14px] text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 에{' '}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> 과 <code>SUPABASE_SERVICE_ROLE_KEY</code> 를
          넣고 서버를 다시 시작해 주세요.
        </div>
      ) : null}

      <div className="admin-card mt-5 p-4">
        <ProductFilters
          categories={categories.map((category) => ({
            slug: category.slug,
            label: category.nameKo,
          }))}
        />
      </div>

      <div className="mt-5">
        <ProductTable products={products} categories={allCategories} brands={allBrands} />
      </div>

      {totalPages > 1 ? (
        <nav aria-label="페이지" className="mt-6 flex flex-wrap items-center gap-2">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => {
            const params = new URLSearchParams();
            if (search) params.set('q', search);
            if (searchParams.category) params.set('category', searchParams.category);
            if (searchParams.visible) params.set('visible', searchParams.visible);
            if (searchParams.soldOut) params.set('soldOut', searchParams.soldOut);
            params.set('page', String(number));

            return (
              <Link
                key={number}
                href={`/admin/products?${params.toString()}`}
                aria-current={number === page ? 'page' : undefined}
                className={`min-h-[38px] min-w-[38px] rounded-md border px-3 py-2 text-center text-[14px] ${
                  number === page
                    ? 'border-blue-700 bg-blue-700 font-semibold text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {number}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
