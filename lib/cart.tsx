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
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  ready: boolean;
  addItem: (item: Omit<CartItem, 'key'>) => void;
  removeItem: (key: string) => void;
  /** 여러 개를 한 번에 뺍니다. 주문한 상품만 골라 뺄 때 씁니다. */
  removeMany: (keys: string[]) => void;
  updateQuantity: (key: string, quantity: number) => void;
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

  const addItem = useCallback((item: Omit<CartItem, 'key'>) => {
    const key = makeKey(item.productId, item.options);
    setItems((prev) => {
      const found = prev.find((existing) => existing.key === key);
      if (found) {
        return prev.map((existing) =>
          existing.key === key
            ? { ...existing, quantity: existing.quantity + item.quantity }
            : existing
        );
      }
      return [...prev, { ...item, key }];
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

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { items, count, total, ready, addItem, removeItem, removeMany, updateQuantity, clear };
  }, [items, ready, addItem, removeItem, removeMany, updateQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart는 CartProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}
