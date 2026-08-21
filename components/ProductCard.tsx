'use client';

import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import SafeImage from '@/components/SafeImage';
import { useSite } from '@/components/SiteProvider';
import {
  brandLabel as findBrandLabel,
  brandName as findBrandName,
  findBrand,
} from '@/lib/brands';
import { formatPrice, getDiscountRate, isProductSoldOut } from '@/lib/product-utils';
import { expectedPurchasePoints, fillTokens } from '@/lib/site-config';
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
  const { brands, points, event } = useSite();
  const first = product.thumbnails[0] ?? '';
  const second = product.thumbnails[1] ?? '';
  /** 두 번째 컷이 실제로 있는지. 없으면 겹쳐 두지 않고 확대만 합니다. */
  const hasSecond = Boolean(second);
  const brandName = product.brandSlug ? findBrandName(brands, product.brandSlug) : '';
  const brandLabel = product.brandSlug ? findBrandLabel(brands, product.brandSlug) : '';
  /* 로고를 올린 브랜드는 로고로, 아니면 지금처럼 글자로 나갑니다. */
  const brand = product.brandSlug ? findBrand(brands, product.brandSlug) : undefined;
  const soldOut = isProductSoldOut(product);
  const discount = getDiscountRate(product);

  // ★ 적립 안내는 여기서 계산합니다. DB 조회가 늘지 않습니다.
  const earn = expectedPurchasePoints(product.price, points);

  return (
    <article className="group">
      <Link href={`/products/${product.slug}`} className="block">
        {/*
          ★ 이미지가 두 장 이상이면 마우스를 올렸을 때 두 번째 컷으로 넘어갑니다.
            한 장뿐이면 살짝 확대만 합니다. (3-J)
            예전에는 한 장짜리 상품도 같은 이미지를 두 번 겹쳐 두고 크로스페이드를
            걸어 두었습니다. 눈에는 아무 일도 일어나지 않으면서 같은 이미지를
            두 번 내려받게 만드는 낭비였습니다.
          ★ 전부 [@media(hover:hover)] 안에서만 돕니다. 손가락으로 눌렀을 때
            이미지가 바뀌면 무엇을 눌렀는지 헷갈립니다.
          ★ 틀(aspect-[3/4] + overflow-hidden)은 그대로라 카드 높이가 변하지 않습니다.
            목록 전체가 흔들리지 않습니다.
        */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-stone">
          <div
            className={`absolute inset-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${
              hasSecond ? '' : '[@media(hover:hover)]:group-hover:scale-[1.04]'
            }`}
          >
            <SafeImage
              src={first}
              alt={`${brandName} ${product.name} 정면 컷`}
              label={product.name}
              width={600}
              height={800}
              priority={priority}
            />
          </div>
          {hasSecond ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-0 transition-opacity duration-300 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:opacity-100"
            >
              {/* ★ SafeImage 는 priority 가 아니면 loading="lazy" 입니다. 미리 다 받지 않습니다. */}
              <SafeImage src={second} alt="" label={product.name} width={600} height={800} />
            </div>
          ) : null}

          <div className="absolute left-0 top-0 flex flex-col items-start">
            {soldOut ? (
              <span className="bg-ink px-3 py-1.5 text-[14px] tracking-[0.2em] text-paper">
                SOLD OUT
              </span>
            ) : null}
            {!soldOut && product.isNew ? (
              <span className="bg-wine px-3 py-1.5 text-[14px] tracking-[0.2em] text-paper">
                NEW
              </span>
            ) : null}
            {!soldOut && product.isSale ? (
              <span className="border border-wine px-3 py-1.5 text-[14px] tracking-[0.2em] text-wine">
                SALE
              </span>
            ) : null}
          </div>
        </div>

        <div className="pt-4">
          {brandLabel ? (
            /*
              ★ min-h-[25px] 인 이유
                로고 상자가 45px 이라 글자일 때도 같은 높이를 지켜야 합니다. 그래야
                높이를 지켜야 상품명이 위아래로 밀리지 않고, 목록에서 카드마다
                줄이 어긋나지 않습니다. h- 가 아니라 min-h- 인 것은, 좁은 화면에서
                긴 브랜드명이 두 줄로 접힐 때 잘리지 않게 하기 위해서입니다.
            */
            <p className="flex min-h-[45px] items-center text-[14px] tracking-[0.16em] text-muted">
              <BrandMark brand={brand ?? { label: brandLabel, name: brandName, logoUrl: '' }} size="card" />
            </p>
          ) : null}
          {/*
            ★ 상품명은 두 줄까지만 보여 줍니다.
              줄 수를 막아 두지 않으면 이름이 길거나 손님이 글자 크기를 키워 둔
              기기에서 세 줄로 늘어나고, 그만큼 가격과 할인율이 아래로 밀립니다.
              목록에서 카드마다 높이가 달라져 줄이 어긋나 보입니다.
          */}
          <h3 className="mt-1.5 line-clamp-2 text-[18px] font-medium leading-snug text-ink">
            {product.name}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[16px] leading-relaxed text-ink">
            {product.summary}
          </p>
          <p className="mt-3 flex flex-wrap items-baseline gap-2 text-[17px]">
            <span className="font-medium text-ink">{formatPrice(product.price)}원</span>
            {/*
              ★ 정가와 할인율은 한 덩어리로 묶어 둡니다.
                따로 두면 글자가 조금만 커져도 할인율만 다음 줄로 떨어져
                "50,000원 / 30%" 가 위아래로 갈라집니다.
            */}
            {product.originalPrice ? (
              <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-[15px] text-muted line-through">
                  {formatPrice(product.originalPrice)}원
                </span>
                {discount > 0 ? (
                  <span className="text-[15px] text-wine">{discount}%</span>
                ) : null}
              </span>
            ) : null}
          </p>
          {earn > 0 ? (
            <p className="mt-1.5 text-[14px] text-wine">
              {fillTokens(event.earnNotice, { points: formatPrice(earn) })}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
