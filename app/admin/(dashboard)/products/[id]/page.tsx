import { notFound } from 'next/navigation';
import ProductForm from '@/components/admin/ProductForm';
import { getProductById, getTemplates } from '@/lib/products';
import { getBrands, getCategories } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const [product, templates, categories, brands] = await Promise.all([
    getProductById(params.id),
    getTemplates(),
    getCategories(),
    getBrands(),
  ]);

  if (!product) notFound();

  return (
    <ProductForm
      product={product}
      templates={templates}
      allCategories={categories}
      allBrands={brands}
    />
  );
}
