import ProductForm from '@/components/admin/ProductForm';
import { getTemplates } from '@/lib/products';
import { getBrands, getCategories } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const [templates, categories, brands] = await Promise.all([
    getTemplates(),
    getCategories(),
    getBrands(),
  ]);

  return (
    <ProductForm templates={templates} allCategories={categories} allBrands={brands} />
  );
}
