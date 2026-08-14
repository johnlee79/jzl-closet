'use client';

import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import { useSite } from '@/components/SiteProvider';
import { brandLabel as findBrandLabel, brandName as findBrandName } from '@/lib/brands';
import { formatPrice, getDiscountRate, isProductSoldOut } from '@/lib/product-utils';
import type { Product } from '@/lib/types';

type ProductCardProps = {
  product: Product;
  priority?: boolean;
};

/**
 * 브랜드 이름은 DB 에서 오므로 SiteProvider(컨텍스트)에서 읽습니다.
 * 클라이언트 컴포넌트지만 서버에서 한 번 렌더되어 나가므로 SEO 에 영향이 없습니다.
 */
export default function ProductCard({ product, priority = false }: ProductCardProps) {
  const { brands } = useSite();
  const first = product.thumbnails[0] ?? '';
  const second = product.thumbnails[1] ?? first;
  const brandName = product.brandSlug ? findBrandName(brands, product.brandSlug) : '';
  const brandLabel = product.brandSlug ? findBrandLabel(brands, product.brandSlug) : '';
  const soldOut = isProductSoldOut(product);
  const discount = getDiscountRate(product);

  return (
    <article className="group">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-stone">
          <div className="absolute inset-0">
            <SafeImage
              src={first}
              alt={`${brandName} ${product.name} 정면 컷`}
              label={product.name}
              width={600}
              height={800}
              priority={priority}
            />
          </div>
          {/* 시그니처: 데스크탑에서만 두 번째 이미지로 0.6초 크로스페이드 */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-0 transition-opacity duration-[600ms] ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:opacity-100"
          >
            <SafeImage src={second} alt="" label={product.name} width={600} height={800} />
          </div>

          <div className="absolute left-0 top-0 flex flex-col items-start">
            {soldOut ? (
              <span className="bg-ink px-3 py-1.5 text-[13px] tracking-[0.2em] text-paper">
                SOLD OUT
              </span>
            ) : null}
            {!soldOut && product.isNew ? (
              <span className="bg-wine px-3 py-1.5 text-[13px] tracking-[0.2em] text-paper">
                NEW
              </span>
            ) : null}
            {!soldOut && product.isSale ? (
              <span className="border border-wine px-3 py-1.5 text-[13px] tracking-[0.2em] text-wine">
                SALE
              </span>
            ) : null}
          </div>
        </div>

        <div className="pt-4">
          {brandLabel ? (
            <p className="text-[13px] tracking-[0.16em] text-muted">{brandLabel}</p>
          ) : null}
          <h3 className="mt-1.5 font-serif text-[17px] leading-snug text-ink">
            {product.name}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-ink">
            {product.summary}
          </p>
          <p className="mt-3 flex flex-wrap items-baseline gap-2 text-[16px]">
            <span className="font-medium text-ink">{formatPrice(product.price)}원</span>
            {product.originalPrice ? (
              <>
                <span className="text-[14px] text-muted line-through">
                  {formatPrice(product.originalPrice)}원
                </span>
                {discount > 0 ? (
                  <span className="text-[14px] text-wine">{discount}%</span>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
      </Link>
    </article>
  );
}
