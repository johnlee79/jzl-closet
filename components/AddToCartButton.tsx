'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OptionSelector from '@/components/OptionSelector';
import KakaoChatButton from '@/components/KakaoChatButton';
import SignupPointBadge from '@/components/SignupPointBadge';
import { useSite } from '@/components/SiteProvider';
import { brandLabel as findBrandLabel, brandName as findBrandName } from '@/lib/brands';
import { categoryNameKo } from '@/lib/categories';
import { useCart } from '@/lib/cart';
import { trackAddToCart } from '@/lib/gtag';
import {
  findCombination,
  formatPrice,
  isCombinationAvailable,
  isProductSoldOut,
  isValueSelectable,
} from '@/lib/product-utils';
import type { Product } from '@/lib/types';

const MAX_QUANTITY = 99;

/**
 * ============================================================
 * 모바일 하단 고정 구매 바 (3-I)
 * ============================================================
 *
 * ★ 모바일에서만 나옵니다. 데스크톱은 손대지 않았습니다.
 *   오른쪽 구매 영역이 1338px 로 뷰포트(911px)보다 길어 sticky 를 걸면
 *   아래쪽 버튼이 화면 밖에 영구히 남습니다. (3-H 에서 실측했습니다)
 *
 * ★ 원래 구매 버튼이 화면에서 벗어나면 나타납니다.
 *   스크롤 이벤트로 위치를 계산하지 않고 IntersectionObserver 로 봅니다.
 *   손가락 한 번에 수십 번 오는 이벤트마다 좌표를 재는 것보다 싸고 정확합니다.
 *
 * ★ 버튼 동작은 위쪽 버튼과 같은 핸들러를 그대로 씁니다.
 *   따로 만들면 금액 계산과 옵션 판정이 두 벌이 되어 반드시 어긋납니다.
 *
 * ★ 맨 위로 버튼과 자리가 겹칩니다. 바가 떠 있는 동안 --buy-bar-h 를 심어
 *   ScrollToTop 이 그만큼 위로 올라가게 합니다. (app/globals.css 의 .to-top)
 *   높이를 코드에 박지 않고 실제로 재서 넘깁니다.
 */
const BUY_BAR_VAR = '--buy-bar-h';

export default function AddToCartButton({ product }: { product: Product }) {
  const router = useRouter();
  const { addItem } = useCart();
  const { brands, categories, store } = useSite();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  /**
   * 로그인 여부에 따라 버튼 문구만 바꿉니다.
   * ★ 서버에서 쿠키를 읽으면 상품 상세가 정적 생성에서 빠집니다. (SEO 최우선)
   *   문구가 조금 늦게 바뀌는 것은 문제가 되지 않습니다.
   */
  const [isMember, setIsMember] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { loggedIn?: boolean } | null) => {
        if (alive && data?.loggedIn) setIsMember(true);
      })
      .catch(() => {
        /* 확인하지 못하면 비회원으로 봅니다. */
      });
    return () => {
      alive = false;
    };
  }, []);

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

  const handleAdd = (): boolean => {
    if (!canAdd) return false;
    const amount = Math.min(quantity, maxQuantity);

    addItem({
      // 장바구니 링크(/products/{slug})에 그대로 쓰이므로 slug 를 넣습니다.
      productId: product.slug,
      name: product.name,
      brand: product.brandSlug ? findBrandLabel(brands, product.brandSlug) : '',
      price: unitPrice,
      thumbnail: product.thumbnails[0] ?? '',
      options: selected,
      optionKey: combination?.key ?? '',
      extraPrice,
      quantity: amount,
    });

    // GA4 표준 이벤트. 측정 ID 를 넣지 않았으면 아무 일도 하지 않습니다.
    trackAddToCart({
      item_id: product.slug,
      item_name: product.name,
      item_brand: product.brandSlug
        ? findBrandName(brands, product.brandSlug)
        : store.name,
      item_category: categoryNameKo(categories, product.categorySlug),
      item_variant: combination?.key || undefined,
      price: unitPrice,
      quantity: amount,
    });

    setAdded(true);
    return true;
  };

  /**
   * 비회원 구매 / 바로 구매 — 장바구니를 거치지 않고 주문서로 갑니다.
   * ★ 장바구니에 담는 동작 자체는 같습니다. 담자마자 주문서로 넘어갈 뿐입니다.
   *   따로 "바로구매 전용" 흐름을 만들면 금액 계산이 두 벌이 됩니다.
   */
  const handleBuyNow = () => {
    if (!handleAdd()) return;
    router.push('/checkout');
  };

  const soldOut = isProductSoldOut(product);

  /* ── 모바일 하단 구매 바 (3-I) ─────────────────────────── */

  /** 위쪽 버튼 묶음. 이게 화면에서 사라지면 바를 띄웁니다. */
  const buttonsRef = useRef<HTMLDivElement>(null);
  /** 옵션 영역. 옵션을 안 고르고 바를 눌렀을 때 여기로 올려 보냅니다. */
  const optionsRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [barShown, setBarShown] = useState(false);
  /** 옵션을 안 고르고 눌렀을 때 잠깐 띄우는 안내 */
  const [needOption, setNeedOption] = useState(false);

  useEffect(() => {
    const target = buttonsRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setBarShown(!entry.isIntersecting),
      // 조금이라도 보이면 바를 내립니다. 둘이 동시에 보이면 어느 쪽을 눌러야 할지 헷갈립니다.
      { threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  /*
    바 높이를 재서 문서에 심습니다. 맨 위로 버튼이 이 값만큼 올라갑니다.
    ★ 바가 내려가면 0px 로 되돌립니다. 상품 상세를 떠날 때도 정리해야
      다른 페이지의 맨 위로 버튼이 이유 없이 떠 있게 되지 않습니다.
  */
  useEffect(() => {
    const root = document.documentElement;
    const height = barShown ? (barRef.current?.offsetHeight ?? 0) : 0;
    root.style.setProperty(BUY_BAR_VAR, `${height}px`);
    return () => root.style.setProperty(BUY_BAR_VAR, '0px');
  }, [barShown]);

  /** 옵션을 안 골랐으면 실패시키지 않고 옵션 자리로 데려갑니다. */
  const guardOption = useCallback((): boolean => {
    if (canAdd) return true;
    setNeedOption(true);
    optionsRef.current?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
    return false;
  }, [canAdd]);

  // 옵션을 고르고 나면 안내를 내립니다.
  useEffect(() => {
    if (canAdd) setNeedOption(false);
  }, [canAdd]);

  /** 하단 바 — 품절이든 아니든 같은 모양으로 나갑니다. */
  const buyBar = (
    <div
      ref={barRef}
      className={`buy-bar md:hidden ${barShown ? 'buy-bar-on' : ''}`}
      aria-hidden={!barShown}
    >
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-muted">{product.name}</p>
          <p className="text-[18px] font-medium tabular-nums text-ink">
            {formatPrice(soldOut ? product.price : unitPrice * quantity)}원
          </p>
        </div>
        {soldOut ? (
          <button type="button" disabled className="btn-primary min-h-[46px] shrink-0 px-6">
            품절
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (guardOption()) handleAdd();
              }}
              tabIndex={barShown ? 0 : -1}
              className="btn-secondary min-h-[46px] shrink-0 px-4 text-[15px] tracking-normal"
            >
              장바구니
            </button>
            <button
              type="button"
              onClick={() => {
                if (guardOption()) handleBuyNow();
              }}
              tabIndex={barShown ? 0 : -1}
              className="btn-primary min-h-[46px] shrink-0 px-4 text-[15px] tracking-normal"
            >
              바로구매
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (soldOut) {
    return (
      <div className="mt-8 border-t border-stone pt-8">
        <p className="text-[16px] leading-relaxed text-ink">
          현재 품절된 상품입니다. 재입고 일정은 고객센터 {store.phone}으로 문의해 주세요.
        </p>
        <div ref={buttonsRef}>
          <button type="button" className="btn-primary mt-6 w-full" disabled>
            품절
          </button>
        </div>
        {buyBar}
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-stone pt-8">
      {hasOptions ? (
        <div ref={optionsRef}>
          <OptionSelector
            groups={product.optionGroups}
            selected={selected}
            onChange={handleChange}
            isSelectable={(groupIndex, value) =>
              isValueSelectable(product, groupIndex, value, selected)
            }
          />
          {needOption ? (
            <p role="status" className="mt-3 text-[14px] leading-relaxed text-wine">
              옵션을 먼저 선택해 주세요.
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={`flex items-center justify-between border-stone ${
          hasOptions ? 'mt-6 border-t pt-6' : ''
        }`}
      >
        <span className="text-[14px] tracking-[0.14em] text-muted">수량</span>
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
          <span className="w-12 text-center text-[16px] tabular-nums">{quantity}</span>
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
        <p className="mt-3 text-right text-[14px] text-muted">
          기본가 {formatPrice(product.price)}원
          {extraPrice > 0 ? ' + 옵션 ' : ' − 옵션 '}
          {formatPrice(Math.abs(extraPrice))}원
        </p>
      ) : null}

      <div className="mt-6 flex items-baseline justify-between border-t border-stone pt-6">
        <span className="text-[14px] tracking-[0.14em] text-muted">합계</span>
        <span className="font-display text-[28px] font-medium tracking-wide text-ink">
          {formatPrice(unitPrice * quantity)}
          <span className="ml-1 font-sans text-[16px]">원</span>
        </span>
      </div>

      {hasOptions && !allSelected ? (
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          옵션을 모두 선택하시면 장바구니에 담을 수 있습니다.
        </p>
      ) : null}

      {soldOutCombination ? (
        <p className="mt-4 text-[14px] leading-relaxed text-wine">
          선택하신 옵션은 품절되었습니다. 다른 옵션을 골라 주세요.
        </p>
      ) : null}

      {canAdd && combination?.stock !== null && combination?.stock !== undefined ? (
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          남은 수량 {combination.stock}개
        </p>
      ) : null}

      {/* ★ ref 는 이 묶음에 겁니다. 이게 화면 밖으로 나가면 하단 바가 올라옵니다. */}
      <div ref={buttonsRef} className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => handleAdd()}
          disabled={!canAdd}
          className="btn-primary w-full"
        >
          장바구니 담기
        </button>
        {/* ★ 비회원도 그대로 주문할 수 있게 길을 하나 더 둡니다. 가입을 강요하지 않습니다. */}
        <button
          type="button"
          onClick={handleBuyNow}
          disabled={!canAdd}
          className="btn-secondary w-full"
        >
          {isMember ? '바로 구매' : '비회원 구매'}
        </button>
        {/* ★ 전화번호 버튼을 카카오톡 문의로 바꿨습니다.
            전화번호는 판매정보 탭의 판매자 정보와 푸터에 그대로 있습니다.
            설정에 채팅방 주소가 없으면 이 버튼은 나오지 않습니다. */}
        <KakaoChatButton className="w-full" />
      </div>

      {/* 가입 유도 — 설정에서 가입 축하 포인트를 껐거나 0이면 나오지 않습니다. */}
      {isMember ? null : (
        <div className="mt-4 flex justify-center">
          <SignupPointBadge />
        </div>
      )}

      {added ? (
        <p className="mt-4 text-[16px] leading-relaxed text-ink">
          장바구니에 담았습니다.{' '}
          <Link href="/order" className="link-wine">
            주문 페이지로 이동
          </Link>
        </p>
      ) : null}

      {buyBar}
    </div>
  );
}
