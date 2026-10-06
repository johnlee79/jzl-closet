import { notFound } from 'next/navigation';
import ProductForm from '@/components/admin/ProductForm';
import { getProductById, getTemplates } from '@/lib/products';
import { getProductCost } from '@/lib/product-costs';
import { getBrands, getCategories } from '@/lib/taxonomy';
import { formatPrice } from '@/lib/product-utils';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const [product, templates, categories, brands, cost] = await Promise.all([
    getProductById(params.id),
    getTemplates(),
    getCategories(),
    getBrands(),
    getProductCost(params.id),
  ]);

  if (!product) notFound();

  const margin = cost ? product.price - cost.costPrice : null;
  const marginRate =
    cost && product.price > 0 ? Math.round(((margin ?? 0) / product.price) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      {/*
        ★ 원가·마진 — product_costs 전용 테이블에서 service_role 로 읽습니다.
          손님 유출 금지라 products 와 분리된 자리입니다. 이 배너는 관리자 전용
          경로(/admin/*) 에서만 그려지고, 손님용 라우트에선 import 되지 않습니다.
      */}
      {cost ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] text-emerald-900">
          <strong>원가</strong>{' '}
          {formatPrice(cost.costPrice)}원
          <span className="mx-2 text-emerald-700">·</span>
          <strong>마진</strong>{' '}
          <span className={margin !== null && margin < 0 ? 'font-semibold text-red-700' : ''}>
            {margin !== null ? `${formatPrice(margin)}원` : '—'}
            {marginRate !== null ? ` (${marginRate}%)` : ''}
          </span>
          <span className="ml-3 text-[13px] text-emerald-700">
            뉴욕트렌딕 단가표
            {cost.sheetDate ? ` · ${cost.sheetDate}` : ''} 기준 · 카드 수수료 제외 전 · 손님에게는
            안 보입니다
          </span>
        </div>
      ) : null}

      <ProductForm
        product={product}
        templates={templates}
        allCategories={categories}
        allBrands={brands}
      />
    </div>
  );
}
