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
  price: number;
  thumbnail: string;
  options: Record<string, string>;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  ready: boolean;
  addItem: (item: Omit<CartItem, 'key'>) => void;
  removeItem: (key: string) => void;
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

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.key === 'string' &&
    typeof item.productId === 'string' &&
    typeof item.name === 'string' &&
    typeof item.price === 'number' &&
    typeof item.quantity === 'number'
  );
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
          setItems(parsed.filter(isCartItem));
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

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { items, count, total, ready, addItem, removeItem, updateQuantity, clear };
  }, [items, ready, addItem, removeItem, updateQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart는 CartProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}
