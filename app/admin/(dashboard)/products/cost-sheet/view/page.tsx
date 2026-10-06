import CostSheetView from '@/components/admin/CostSheetView';
import { getProducts } from '@/lib/products';
import { getCurrentCostSheet, getProductCostsByIds } from '@/lib/product-costs';

/**
 * 저장된 단가표 전체 보기 — 상품 관리 하위.
 *
 * ★ 손님 유출 금지라 service_role 로만 읽습니다 (lib/product-costs.ts).
 *   손님 쪽 라우트 어디에서도 이 페이지의 컴포넌트를 import 하지 않습니다.
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: '단가표 보기' };

export default async function CostSheetViewPage() {
  const [entries, products] = await Promise.all([
    getCurrentCostSheet(),
    getProducts({ includeHidden: true, light: true }),
  ]);

  const costByProductId = await getProductCostsByIds(
    entries.map((e) => e.matchedProductId).filter((id): id is string => Boolean(id))
  );

  return (
    <div className="mx-auto w-full max-w-[1300px]">
      <h1 className="text-[24px] font-semibold text-slate-900">단가표 보기</h1>
      <p className="mt-1 text-[15px] text-slate-600">
        지금 쓰이는 단가표 전체입니다. 사진·이름·위탁가와 짝지은 우리 상품의 판매가·마진·
        마진율을 한 눈에 봅니다. 손님에게는 안 보입니다.
      </p>
      <div className="mt-5">
        <CostSheetView
          entries={entries.map((e) => ({
            id: e.id,
            rawName: e.rawName,
            sheetName: e.sheetName,
            costPrice: e.costPrice,
            imageUrl: e.imageUrl,
            skus: e.skus,
            matchedProductId: e.matchedProductId,
          }))}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            brandSlug: p.brandSlug,
            thumbnail: p.thumbnails[0] ?? null,
            price: p.price,
            costPrice: costByProductId.get(p.id)?.costPrice ?? null,
          }))}
        />
      </div>
    </div>
  );
}
