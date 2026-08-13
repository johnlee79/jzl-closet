import { notFound } from 'next/navigation';
import ProductForm from '@/components/admin/ProductForm';
import { getProductById, getTemplates } from '@/lib/products';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const [product, templates] = await Promise.all([
    getProductById(params.id),
    getTemplates(),
  ]);

  if (!product) notFound();

  return <ProductForm product={product} templates={templates} />;
}
