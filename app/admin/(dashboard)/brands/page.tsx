import BrandManager from '@/components/admin/BrandManager';
import { sortedBrands } from '@/lib/brands';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { countProductsGrouped, getBrands, isTaxonomyReady } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

export const metadata = { title: '브랜드 관리' };

export default async function AdminBrandsPage() {
  const configured = isSupabaseConfigured();
  const [brands, counts, ready] = await Promise.all([
    getBrands(),
    countProductsGrouped(),
    configured ? isTaxonomyReady() : Promise.resolve(false),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-slate-900">브랜드 관리</h1>
      <p className="mt-1 text-[15px] text-slate-600">전체 {brands.length}개</p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[16px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : !ready ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[16px] leading-relaxed text-amber-900">
          brands 테이블이 아직 없습니다. Supabase SQL Editor 에서{' '}
          <code>supabase/schema-1b.sql</code> · <code>supabase/seed-1b.sql</code> 을 차례로
          실행해 주세요.
        </div>
      ) : null}

      <div className="mt-5">
        <BrandManager brands={sortedBrands(brands)} counts={counts.byBrand} />
      </div>

      <p className="mt-6 text-[14px] leading-relaxed text-slate-500">
        브랜드 스토리는 <code>/brand/&#123;slug&#125;</code> 페이지에 그대로 출력됩니다.
        검색으로 들어오는 길이므로 브랜드마다 두세 문단씩 채워 두는 편이 좋습니다.
      </p>
    </div>
  );
}
