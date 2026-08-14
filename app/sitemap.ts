import type { MetadataRoute } from 'next';
import { visibleBrands } from '@/lib/brands';
import { visibleCategories, visibleSubCategories } from '@/lib/categories';
import { getVisibleNotices } from '@/lib/notices';
import { getProductSitemapRows } from '@/lib/products';
import { SITE_URL } from '@/lib/store';
import { getCachedBrands, getCachedCategories } from '@/lib/taxonomy';

/**
 * 사이트맵은 데이터를 순회해서 만듭니다.
 * 분류·브랜드는 DB(관리자에서 고친 값), 상품은 products 테이블에서 읽습니다.
 * 노출을 끈 분류·브랜드와 숨김 상품은 자동으로 빠집니다.
 */
export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const [categories, brands, productRows, notices] = await Promise.all([
    getCachedCategories(),
    getCachedBrands(),
    getProductSitemapRows(),
    getVisibleNotices(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/products`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/brand`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/notice`, lastModified, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${SITE_URL}/guide`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = visibleCategories(categories).flatMap(
    (category) => [
      {
        url: `${SITE_URL}/category/${category.slug}`,
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      },
      ...visibleSubCategories(categories, category.slug).map((child) => ({
        url: `${SITE_URL}/category/${category.slug}/${child.slug}`,
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    ]
  );

  const brandRoutes: MetadataRoute.Sitemap = visibleBrands(brands).map((brand) => ({
    url: `${SITE_URL}/brand/${brand.slug}`,
    lastModified,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const productRoutes: MetadataRoute.Sitemap = productRows.map((row) => ({
    url: `${SITE_URL}/products/${row.slug}`,
    lastModified: row.updatedAt ? new Date(row.updatedAt) : lastModified,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const noticeRoutes: MetadataRoute.Sitemap = notices.map((notice) => ({
    url: `${SITE_URL}/notice/${notice.id}`,
    lastModified: notice.updatedAt ? new Date(notice.updatedAt) : lastModified,
    changeFrequency: 'monthly',
    priority: 0.4,
  }));

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...brandRoutes,
    ...productRoutes,
    ...noticeRoutes,
  ];
}
