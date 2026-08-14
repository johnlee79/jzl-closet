'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import OptionSelector from '@/components/OptionSelector';
import { getBrandLabel } from '@/lib/brands';
import { useCart } from '@/lib/cart';
import {
  findCombination,
  formatPrice,
  isCombinationAvailable,
  isProductSoldOut,
  isValueSelectable,
} from '@/lib/product-utils';
import { store } from '@/lib/store';
import type { Product } from '@/lib/types';

const MAX_QUANTITY = 99;

export default function AddToCartButton({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const hasOptions = product.optionGroups.length > 0;

  const allSelected = useMemo(
    () => product.optionGroups.every((group) => Boolean(selected[group.name])),
    [product.optionGroups, selected]
  );

  /** 고른 값들에 해당하는 조합. 옵션이 없는 상품이면 null 입니다. */
  const combination = useMemo(
    () => (hasOptions && allSelected ? findCombination(product, selected) : null),
    [hasOptions, allSelected, product, selected]
  );

  const available = hasOptions ? isCombinationAvailable(combination) : true;
  const soldOutCombination = hasOptions && allSelected && !available;

  const extraPrice = combination?.extraPrice ?? 0;
  const unitPrice = product.price + extraPrice;

  /** 재고를 관리하는 조합이면 남은 수량까지만 담을 수 있습니다. */
  const maxQuantity = Math.max(
    1,
    Math.min(MAX_QUANTITY, combination?.stock ?? MAX_QUANTITY)
  );
  const canAdd = (!hasOptions || allSelected) && available;

  const handleChange = (name: string, value: string) => {
    setSelected((prev) => ({ ...prev, [name]: value }));
    setQuantity(1);
    setAdded(false);
  };

  const handleAdd = () => {
    if (!canAdd) return;
    addItem({
      // 장바구니 링크(/products/{slug})에 그대로 쓰이므로 slug 를 넣습니다.
      productId: product.slug,
      name: product.name,
      brand: product.brandSlug ? getBrandLabel(product.brandSlug) : '',
      price: unitPrice,
      thumbnail: product.thumbnails[0] ?? '',
      options: selected,
      optionKey: combination?.key ?? '',
      extraPrice,
      quantity: Math.min(quantity, maxQuantity),
    });
    setAdded(true);
  };

  if (isProductSoldOut(product)) {
    return (
      <div className="mt-8 border-t border-stone pt-8">
        <p className="text-[15px] leading-relaxed text-ink">
          현재 품절된 상품입니다. 재입고 일정은 고객센터 {store.phone}으로 문의해 주세요.
        </p>
        <button type="button" className="btn-primary mt-6 w-full" disabled>
          품절
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-stone pt-8">
      {hasOptions ? (
        <OptionSelector
          groups={product.optionGroups}
          selected={selected}
          onChange={handleChange}
          isSelectable={(groupIndex, value) =>
            isValueSelectable(product, groupIndex, value, selected)
          }
        />
      ) : null}

      <div
        className={`flex items-center justify-between border-stone ${
          hasOptions ? 'mt-6 border-t pt-6' : ''
        }`}
      >
        <span className="text-[13px] tracking-[0.14em] text-muted">수량</span>
        <div className="flex items-center border border-stone">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="수량 줄이기"
            className="flex h-11 w-11 items-center justify-center text-ink transition-colors duration-200 hover:bg-stone"
          >
            <svg width="11" height="1" viewBox="0 0 11 1" stroke="#14141A" aria-hidden="true">
              <path d="M0 0.5h11" />
            </svg>
          </button>
          <span className="w-12 text-center text-[15px] tabular-nums">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            aria-label="수량 늘리기"
            className="flex h-11 w-11 items-center justify-center text-ink transition-colors duration-200 hover:bg-stone"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              stroke="#14141A"
              aria-hidden="true"
            >
              <path d="M0 5.5h11M5.5 0v11" />
            </svg>
          </button>
        </div>
      </div>

      {extraPrice !== 0 ? (
        <p className="mt-3 text-right text-[13px] text-muted">
          기본가 {formatPrice(product.price)}원
          {extraPrice > 0 ? ' + 옵션 ' : ' − 옵션 '}
          {formatPrice(Math.abs(extraPrice))}원
        </p>
      ) : null}

      <div className="mt-6 flex items-baseline justify-between border-t border-stone pt-6">
        <span className="text-[13px] tracking-[0.14em] text-muted">합계</span>
        <span className="font-display text-[26px] font-medium tracking-wide text-ink">
          {formatPrice(unitPrice * quantity)}
          <span className="ml-1 font-sans text-[15px]">원</span>
        </span>
      </div>

      {hasOptions && !allSelected ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          옵션을 모두 선택하시면 장바구니에 담을 수 있습니다.
        </p>
      ) : null}

      {soldOutCombination ? (
        <p className="mt-4 text-[13px] leading-relaxed text-wine">
          선택하신 옵션은 품절되었습니다. 다른 옵션을 골라 주세요.
        </p>
      ) : null}

      {canAdd && combination?.stock !== null && combination?.stock !== undefined ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          남은 수량 {combination.stock}개
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="btn-primary w-full"
        >
          장바구니 담기
        </button>
        <a href={`tel:${store.phone}`} className="btn-secondary w-full">
          바로 문의 {store.phone}
        </a>
      </div>

      {added ? (
        <p className="mt-4 text-[15px] leading-relaxed text-ink">
          장바구니에 담았습니다.{' '}
          <Link href="/order" className="link-wine">
            주문 페이지로 이동
          </Link>
        </p>
      ) : null}
    </div>
  );
}
