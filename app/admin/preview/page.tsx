import ProductPreview from '@/components/admin/ProductPreview';
import { getCachedStore } from '@/lib/settings';
import { getBrands, getCategories } from '@/lib/taxonomy';

/**
 * 상품 편집 화면의 [미리보기]가 여는 새 탭입니다.
 * 분류·브랜드·스토어 정보만 서버에서 읽어 넘기고,
 * 실제 내용은 localStorage 에 담긴 임시 저장본을 씁니다.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '미리보기' };

export default async function AdminPreviewPage() {
  const [categories, brands, store] = await Promise.all([
    getCategories(),
    getBrands(),
    getCachedStore(),
  ]);

  return (
    <ProductPreview categories={categories} brands={brands} storeName={store.name} />
  );
}
