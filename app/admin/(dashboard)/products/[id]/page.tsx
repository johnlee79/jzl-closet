import { notFound } from 'next/navigation';
import CostSheetPicker from '@/components/admin/CostSheetPicker';
import ProductForm from '@/components/admin/ProductForm';
import { getProductById, getTemplates } from '@/lib/products';
import {
  getCostSheetEntryByProduct,
  getProductCost,
} from '@/lib/product-costs';
import { getBrands, getCategories } from '@/lib/taxonomy';
import { formatPrice } from '@/lib/product-utils';
import { judgeMargin, marginToneClass } from '@/lib/margin';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const [product, templates, categories, brands, cost, sheetEntry] = await Promise.all([
    getProductById(params.id),
    getTemplates(),
    getCategories(),
    getBrands(),
    getProductCost(params.id),
    getCostSheetEntryByProduct(params.id),
  ]);

  if (!product) notFound();

  const judge = judgeMargin(product.price, cost?.costPrice ?? null);

  return (
    <div className="flex flex-col gap-4">
      {/*
        ★ 원가·마진 — product_costs 전용 테이블에서 service_role 로 읽습니다.
          손님 유출 금지라 products 와 분리된 자리입니다. 이 배너는 관리자 전용
          경로(/admin/*) 에서만 그려지고, 손님용 라우트에선 import 되지 않습니다.
      */}
      {cost ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] text-emerald-900">
          <strong>원가</strong> {formatPrice(cost.costPrice)}원
          <span className="mx-2 text-emerald-700">·</span>
          <strong>마진</strong>{' '}
          <span className={marginToneClass(judge)}>
            {judge.kind !== 'none'
              ? `${formatPrice(judge.margin)}원 (${judge.rate}%)`
              : '—'}
          </span>
          <span className="ml-3 text-[13px] text-emerald-700">
            뉴욕트렌딕 단가표
            {cost.sheetDate ? ` · ${cost.sheetDate}` : ''} 기준 · 카드 수수료 제외 전 · 손님에게는
            안 보입니다
          </span>
          {judge.kind !== 'ok' && judge.kind !== 'none' ? (
            <p className="mt-1 text-[13px] font-medium text-red-700">
              ★ {judge.reason}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 단가표에서 원가 찾기 — 짝 바꾸기·짝 풀기 포함 */}
      <CostSheetPicker
        productId={product.id}
        productName={product.name}
        currentlyMatched={
          sheetEntry
            ? { rawName: sheetEntry.rawName, costPrice: sheetEntry.costPrice }
            : null
        }
      />

      <ProductForm
        product={product}
        templates={templates}
        allCategories={categories}
        allBrands={brands}
      />
    </div>
  );
}
