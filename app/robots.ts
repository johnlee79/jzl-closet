import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/store';

/**
 * 개인정보나 장바구니가 나오는 화면은 검색에서 뺍니다.
 * 각 페이지에도 metadata.robots 로 noindex 를 걸어 두었습니다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/order', '/checkout', '/order-lookup', '/admin'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
