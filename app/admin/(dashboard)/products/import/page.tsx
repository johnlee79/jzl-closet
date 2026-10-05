import SellstarImporter from '@/components/admin/SellstarImporter';
import { getBrands, getCategories } from '@/lib/taxonomy';
import { getImportSettings } from '@/lib/settings';

/**
 * 상품 가져오기 — 셀스타 · 뉴욕트렌딕 공용.
 *
 * ★ 외부 API 는 브라우저에서 바로 부를 수 없습니다. (셀스타는 CORS, 뉴욕트렌딕은 HTML 긁기)
 *   화면은 우리 서버 라우트(/api/admin/import/sellstar)를 부르고,
 *   그 라우트가 주소를 보고 셀스타·뉴욕트렌딕 중 어디로 보낼지 자동으로 가립니다.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '상품 가져오기' };

export default async function AdminProductImportPage() {
  const [allCategories, allBrands, settings] = await Promise.all([
    getCategories(),
    getBrands(),
    getImportSettings(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <h1 className="text-[24px] font-semibold text-slate-900">상품 가져오기</h1>
      <p className="mt-1 text-[15px] leading-relaxed text-slate-600">
        셀스타·뉴욕트렌딕 상품 주소를 넣으면 정보와 이미지를 가져옵니다. 이미지는 우리
        저장소로 복사해 두므로 원본 쇼핑몰에서 바뀌어도 상품 페이지가 깨지지 않습니다.
      </p>

      <div className="mt-5">
        <SellstarImporter
          allCategories={allCategories}
          allBrands={allBrands}
          settings={settings}
        />
      </div>
    </div>
  );
}
