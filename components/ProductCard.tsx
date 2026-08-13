import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import { getBrandLabel, getBrandName } from '@/lib/brands';
import { formatPrice, isProductSoldOut, type Product } from '@/lib/products';

type ProductCardProps = {
  product: Product;
  priority?: boolean;
};

export default function ProductCard({ product, priority = false }: ProductCardProps) {
  const first = product.thumbnails[0];
  const second = product.thumbnails[1] ?? first;
  const brandName = getBrandName(product.brand); // alt·검색용 정식 명칭
  const brandLabel = getBrandLabel(product.brand); // 화면 출력용
  const soldOut = isProductSoldOut(product);
  const discount =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round((1 - product.price / product.originalPrice) * 100)
      : 0;

  return (
    <article className="group">
      <Link href={`/products/${product.id}`} className="block">
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
            <SafeImage
              src={second}
              alt=""
              label={product.name}
              width={600}
              height={800}
            />
          </div>

          <div className="absolute left-0 top-0 flex flex-col items-start">
            {soldOut ? (
              <span className="bg-ink px-3 py-1.5 text-[10px] tracking-[0.2em] text-paper">
                SOLD OUT
              </span>
            ) : null}
            {!soldOut && product.isNew ? (
              <span className="bg-wine px-3 py-1.5 text-[10px] tracking-[0.2em] text-paper">
                NEW
              </span>
            ) : null}
            {!soldOut && product.isSale ? (
              <span className="border border-wine px-3 py-1.5 text-[10px] tracking-[0.2em] text-wine">
                SALE
              </span>
            ) : null}
            {!soldOut && product.isOutlet ? (
              <span className="border border-ink px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink">
                OUTLET
              </span>
            ) : null}
          </div>
        </div>

        <div className="pt-4">
          <p className="text-[11px] tracking-[0.16em] text-muted">{brandLabel}</p>
          <h3 className="mt-1.5 font-serif text-[15px] leading-snug text-ink">
            {product.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
            {product.summary}
          </p>
          <p className="mt-2.5 flex flex-wrap items-baseline gap-2 text-[13px]">
            <span className="text-ink">{formatPrice(product.price)}원</span>
            {product.originalPrice ? (
              <>
                <span className="text-[12px] text-muted line-through">
                  {formatPrice(product.originalPrice)}원
                </span>
                {discount > 0 ? (
                  <span className="text-[12px] text-wine">{discount}%</span>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
      </Link>
    </article>
  );
}
