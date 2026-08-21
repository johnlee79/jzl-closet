'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export type CartItem = {
  key: string; // productId + 옵션 조합
  productId: string;
  name: string;
  brand: string;
  /** 옵션 추가금액까지 더한 개당 가격 */
  price: number;
  thumbnail: string;
  options: Record<string, string>;
  /** 선택한 조합 이름. 예: "블랙/S" (옵션이 없으면 빈 문자열) */
  optionKey: string;
  /** 조합의 추가금액. price 에 이미 포함되어 있고, 표시용으로 따로 둡니다. */
  extraPrice: number;
  quantity: number;
  /**
   * 손님이 이 상품을 주문에 넣을지 직접 고른 값.
   *
   * ★ "품절이라 못 산다" 와는 다릅니다. 그건 화면이 서버에 물어봐서 따로 가립니다.
   *   여기에는 손님이 스스로 고른 것만 담깁니다.
   *   담긴 것을 우리가 지우지 않기 때문에, 못 사는 물건도 장바구니에는 남아 있습니다.
   */
  selected: boolean;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  ready: boolean;
  addItem: (item: Omit<CartItem, 'key' | 'selected'>) => void;
  removeItem: (key: string) => void;
  /** 여러 개를 한 번에 뺍니다. 주문한 상품만 골라 뺄 때 씁니다. */
  removeMany: (keys: string[]) => void;
  updateQuantity: (key: string, quantity: number) => void;
  /** 주문에 넣을지 말지 */
  setSelected: (key: string, selected: boolean) => void;
  /**
   * 서버가 알려 준 지금 가격을 장바구니에 적어 둡니다.
   * ★ "손님이 이 가격을 보고 있다" 를 기록하는 것입니다.
   *   값이 오른 경우에는 손님이 확인을 누르기 전까지 부르지 않습니다.
   */
  acceptPrices: (
    updates: { key: string; price: number; extraPrice: number }[]
  ) => void;
  clear: () => void;
};

const STORAGE_KEY = 'jzl-closet-cart-v1';

const CartContext = createContext<CartContextValue | null>(null);

function makeKey(productId: string, options: Record<string, string>): string {
  const suffix = Object.keys(options)
    .sort()
    .map((name) => `${name}:${options[name]}`)
    .join('|');
  return suffix ? `${productId}__${suffix}` : productId;
}

/**
 * 저장된 값을 CartItem 으로 되살립니다.
 * 조합 정보(optionKey·extraPrice)가 없던 시절에 담아 둔 항목도 그대로 살립니다.
 */
function toCartItem(value: unknown): CartItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.key !== 'string' ||
    typeof item.productId !== 'string' ||
    typeof item.name !== 'string' ||
    typeof item.price !== 'number' ||
    typeof item.quantity !== 'number'
  ) {
    return null;
  }

  const options =
    item.options && typeof item.options === 'object'
      ? (item.options as Record<string, string>)
      : {};

  return {
    key: item.key,
    productId: item.productId,
    name: item.name,
    brand: typeof item.brand === 'string' ? item.brand : '',
    price: item.price,
    thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : '',
    options,
    optionKey: typeof item.optionKey === 'string' ? item.optionKey : '',
    extraPrice: typeof item.extraPrice === 'number' ? item.extraPrice : 0,
    quantity: item.quantity,
    /* selected 가 없던 시절에 담아 둔 항목은 골라 둔 것으로 봅니다. */
    selected: item.selected !== false,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(
            parsed
              .map(toCartItem)
              .filter((item): item is CartItem => item !== null)
          );
        }
      }
    } catch {
      // 저장된 값을 읽지 못하면 빈 장바구니로 시작합니다.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // 저장 공간이 없을 때는 무시합니다.
    }
  }, [items, ready]);

  const addItem = useCallback((item: Omit<CartItem, 'key' | 'selected'>) => {
    const key = makeKey(item.productId, item.options);
    setItems((prev) => {
      const found = prev.find((existing) => existing.key === key);
      if (found) {
        /* 방금 담았으니 골라 둔 상태로 되돌립니다. (전에 체크를 풀어 뒀더라도) */
        return prev.map((existing) =>
          existing.key === key
            ? {
                ...existing,
                quantity: existing.quantity + item.quantity,
                selected: true,
              }
            : existing
        );
      }
      return [...prev, { ...item, key, selected: true }];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    const next = Math.max(1, Math.min(99, quantity));
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, quantity: next } : item))
    );
  }, []);

  /**
   * 주문에 들어간 상품만 골라 뺍니다.
   * ★ clear() 로 통째로 비우지 않는 이유 — 손님이 결제창에 가 있는 동안
   *   다른 창에서 상품을 더 담았을 수 있습니다. 그건 주문에 없으니 남겨야 합니다.
   */
  const removeMany = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    const drop = new Set(keys);
    setItems((prev) => prev.filter((item) => !drop.has(item.key)));
  }, []);

  const setSelected = useCallback((key: string, selected: boolean) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, selected } : item))
    );
  }, []);

  /*
   * ★★ 바뀐 것이 하나도 없으면 prev 를 그대로 돌려줍니다.
   *   새 배열을 만들면 저장이 다시 돌고 화면이 다시 그려집니다.
   *   이 함수는 화면이 값을 받아올 때마다 불리므로, 그러면 끝없이 돕니다.
   */
  const acceptPrices = useCallback(
    (updates: { key: string; price: number; extraPrice: number }[]) => {
      if (updates.length === 0) return;
      const byKey = new Map(updates.map((update) => [update.key, update]));
      setItems((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          const update = byKey.get(item.key);
          if (!update) return item;
          if (item.price === update.price && item.extraPrice === update.extraPrice) {
            return item;
          }
          changed = true;
          return { ...item, price: update.price, extraPrice: update.extraPrice };
        });
        return changed ? next : prev;
      });
    },
    []
  );

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    /*
     * ★ 담긴 개수는 고른 것과 상관없이 전부 셉니다. 헤더의 장바구니 숫자입니다.
     * ★ 합계는 여기서 내지 않습니다. 담을 때 가격은 옛 값일 수 있어서,
     *   금액은 화면이 서버에 물어본 값(useCartLive)으로만 냅니다.
     */
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      items,
      count,
      ready,
      addItem,
      removeItem,
      removeMany,
      updateQuantity,
      setSelected,
      acceptPrices,
      clear,
    };
  }, [
    items,
    ready,
    addItem,
    removeItem,
    removeMany,
    updateQuantity,
    setSelected,
    acceptPrices,
    clear,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart는 CartProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}
