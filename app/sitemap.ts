import type { MetadataRoute } from 'next';
import { brands } from '@/lib/brands';
import { getVisibleCategories } from '@/lib/categories';
import { products } from '@/lib/products';
import { SITE_URL } from '@/lib/store';

/**
 * 사이트맵은 데이터를 순회해서 만듭니다.
 * lib/categories.ts 에 대분류·소분류를 추가하면 자동으로 포함되고,
 * isVisible:false 인 카테고리는 자동으로 빠집니다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/products`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/brand`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/guide`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = getVisibleCategories().flatMap(
    (category) => [
      {
        url: `${SITE_URL}/category/${category.slug}`,
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      },
      ...(category.children ?? []).map((child) => ({
        url: `${SITE_URL}/category/${category.slug}/${child.slug}`,
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    ]
  );

  const brandRoutes: MetadataRoute.Sitemap = brands.map((brand) => ({
    url: `${SITE_URL}/brand/${brand.slug}`,
    lastModified,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE_URL}/products/${product.id}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticRoutes, ...categoryRoutes, ...brandRoutes, ...productRoutes];
}
