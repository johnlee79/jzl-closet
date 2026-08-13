import ProductForm from '@/components/admin/ProductForm';
import { getTemplates } from '@/lib/products';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const templates = await getTemplates();
  return <ProductForm templates={templates} />;
}
