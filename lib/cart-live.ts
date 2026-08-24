'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { refreshCartAction, type CartRefreshResult } from '@/app/(shop)/checkout/actions';
import { useCart } from '@/lib/cart';
import type { CartLineState } from '@/lib/orders';

/**
 * 장바구니의 "지금" 값을 서버에서 받아 옵니다.
 * 장바구니 화면과 주문서가 함께 씁니다.
 *
 * ★★ 왜 필요한가
 *   장바구니는 손님 브라우저에만 있고, 담을 때의 가격이 숫자로 박혀 있습니다.
 *   세일가가 바뀌어도 화면은 옛 금액을 그대로 보여 주는데, 주문을 만드는 순간
 *   서버가 새로 매긴 금액이 청구됩니다. 손님이 본 적 없는 금액이 결제되는 것입니다.
 *   그래서 화면이 열릴 때 물어보고 그 값으로 다시 그립니다.
 *
 * ★★ 지키는 세 가지
 *   1) 값이 오른 상품은 알림만으로 넘기지 않습니다. 손님이 확인을 눌러야 넘어갑니다.
 *      (내린 경우는 알려만 줍니다. 손해 보는 쪽이 아니라 확인을 요구할 이유가 없습니다)
 *   2) 못 사게 된 상품을 장바구니에서 빼지 않습니다. 담긴 채로 두고 주문에서만 뺍니다.
 *   3) 서버가 답을 못 주면 옛 값으로 그리되 주문으로 넘어가지 못하게 막습니다.
 *      값을 모르는 채로 결제로 보내면 안 됩니다.
 */

/** 화면이 한 줄을 그리는 데 필요한 것 전부 */
export type CartLineView = CartLineState & {
  /** 장바구니 줄을 가리키는 값 */
  key: string;
  quantity: number;
  /** 손님이 골랐고 지금 살 수도 있는지 — 이것만 주문에 들어갑니다 */
  orderable: boolean;
};

export type PriceChange = {
  key: string;
  name: string;
  /** 손님이 이 화면에 들어왔을 때 보고 있던 값 */
  before: number;
  /** 지금 값 */
  after: number;
};

export type BlockedLine = { key: string; name: string; reason: string };

export type CartLive = {
  /** loading 아직 못 받음 · ok 받음 · failed 못 받아서 옛 값으로 그리는 중 */
  status: 'loading' | 'ok' | 'failed';
  lines: CartLineView[];
  itemsTotal: number;
  shippingFee: number;
  extraShippingFee: number;
  remote: boolean;
  /** 값이 오른 상품 — 확인해야 넘어갑니다 */
  raised: PriceChange[];
  /** 값이 내린 상품 — 알려만 줍니다 */
  lowered: PriceChange[];
  /** 지금 살 수 없는 상품 */
  blocked: BlockedLine[];
  /** 주문에 들어갈 줄 수 */
  orderableCount: number;
  /** 오른 값을 손님이 확인했다고 표시합니다 */
  acknowledge: () => void;
  /** 주문으로 넘어가도 되는지 */
  canOrder: boolean;
  /** 넘어갈 수 없는 이유. canOrder 면 빈 문자열입니다. */
  blockReason: string;
};

export function useCartLive(postcode = ''): CartLive {
  const { items, acceptPrices } = useCart();
  const [result, setResult] = useState<CartRefreshResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'failed'>('loading');

  /**
   * 손님이 이 화면에서 마지막으로 본 가격.
   *
   * ★★ 왜 장바구니에 적힌 값을 그대로 비교하지 않는가
   *   값을 받아오면 장바구니에 적힌 가격을 새 값으로 갈아 끼웁니다.
   *   그러면 비교 기준이 사라져서 "내렸습니다" 안내가 뜨자마자 스스로 없어집니다.
   *   그래서 화면에 들어온 순간의 값을 여기 따로 붙잡아 둡니다.
   */
  const seen = useRef(new Map<string, number>());
  for (const item of items) {
    if (!seen.current.has(item.key)) seen.current.set(item.key, item.price);
  }

  /* 확인 버튼을 눌렀을 때 다시 그리게 하는 값 (seen 이 ref 라 스스로는 못 알립니다) */
  const [ackTick, setAckTick] = useState(0);

  /* ── 서버에 물어보기 ────────────────────────────────
   * 담긴 것·수량·고른 것·우편번호 중 하나라도 바뀌면 다시 물어봅니다. */
  const signature = useMemo(
    () =>
      items
        .map(
          (item) =>
            `${item.productId}|${item.optionKey}|${item.quantity}|${item.selected ? 1 : 0}`
        )
        .join('~'),
    [items]
  );

  useEffect(() => {
    if (items.length === 0) {
      setResult({
        lines: [],
        itemsTotal: 0,
        shippingFee: 0,
        extraShippingFee: 0,
        remote: false,
      });
      setStatus('ok');
      return;
    }

    let alive = true;
    void (async () => {
      try {
        const next = await refreshCartAction(
          items.map((item) => ({
            productSlug: item.productId,
            optionKey: item.optionKey,
            quantity: item.quantity,
            selected: item.selected,
          })),
          postcode
        );
        if (!alive) return;
        setResult(next);
        setStatus('ok');
      } catch {
        /*
         * ★ 여기서 옛 값을 지우지 않습니다. 화면이 텅 비면 손님이 담아 둔 것을
         *   잃은 줄 압니다. 옛 값으로 그리되 주문 버튼을 잠급니다.
         */
        if (!alive) return;
        setStatus('failed');
      }
    })();

    return () => {
      alive = false;
    };
    // items 는 signature 가 대신합니다. (내용이 같으면 다시 물어볼 이유가 없습니다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, postcode]);

  /* ── 받은 값을 장바구니 줄에 맞춰 놓기 ──────────────
   * ★ 순서(index)로 맞추지 않습니다. 답을 기다리는 사이에 손님이 상품을 빼면
   *   순서가 밀려서 엉뚱한 상품의 가격을 그리게 됩니다.
   *   상품주소+옵션은 장바구니 안에서 겹치지 않으므로 그것으로 찾습니다. */
  const byKey = useMemo(() => {
    const map = new Map<string, CartLineState>();
    if (!result) return map;
    const lookup = new Map(
      result.lines.map((line) => [`${line.productSlug}|${line.optionKey}`, line])
    );
    for (const item of items) {
      const line = lookup.get(`${item.productId}|${item.optionKey}`);
      if (line) map.set(item.key, line);
    }
    return map;
  }, [result, items]);

  /* ── 값이 내렸거나 그대로면 조용히 받아 적습니다 ────
   * ★ 오른 것은 손님이 확인을 누르기 전까지 적지 않습니다.
   *   적어 버리면 다음에 들어왔을 때 아무 일도 없었던 것처럼 보입니다. */
  useEffect(() => {
    if (status !== 'ok') return;
    const updates: { key: string; price: number; extraPrice: number }[] = [];
    for (const item of items) {
      const line = byKey.get(item.key);
      if (!line || !line.ok) continue;
      const before = seen.current.get(item.key);
      if (before !== undefined && line.unitPrice > before) continue;
      updates.push({
        key: item.key,
        price: line.unitPrice,
        extraPrice: line.extraPrice,
      });
    }
    acceptPrices(updates);
  }, [status, byKey, items, acceptPrices]);

  /* ── 화면에 그릴 줄 ─────────────────────────────── */
  const lines: CartLineView[] = items.map((item) => {
    const line = byKey.get(item.key);
    if (!line) {
      /*
       * 서버가 이 줄의 값을 알려 주지 않았습니다. 담을 때 값으로 그립니다.
       *
       * ★★ 그런데 그렇게 되는 경우가 둘입니다. 반드시 갈라야 합니다.
       *
       *   status !== 'ok' — 아직 답을 못 받았거나 받지 못했습니다.
       *     이때는 주문 버튼이 이미 잠겨 있으므로 그냥 그리면 됩니다.
       *
       *   status === 'ok' — 답은 왔는데 이 줄이 빠졌습니다.
       *     서버가 한 번에 확인하는 줄 수(50)를 넘긴 경우입니다.
       *     이 줄을 "주문 가능" 으로 두면, 화면 합계에는 안 들어가면서
       *     주문에는 들어갑니다. 손님이 본 적 없는 금액이 결제됩니다.
       *     고쳐 둔 문제가 51번째 줄부터 그대로 되살아납니다.
       *     그래서 확인하지 못한 줄은 이번 주문에서 뺍니다.
       *     장바구니에서 지우지는 않습니다. 품절과 같은 방식입니다.
       */
      const unchecked = status === 'ok';
      return {
        productSlug: item.productId,
        optionKey: item.optionKey,
        ok: !unchecked,
        reason: unchecked
          ? '한 번에 확인할 수 있는 상품 수를 넘겼습니다. 담긴 상품을 줄여 주세요.'
          : '',
        productName: item.name,
        brandLabel: item.brand,
        thumbnailUrl: item.thumbnail,
        unitPrice: item.price,
        extraPrice: item.extraPrice,
        stock: null,
        freeShipping: false,
        key: item.key,
        quantity: item.quantity,
        orderable: item.selected && !unchecked,
      };
    }
    return {
      ...line,
      /* 상품명·사진이 바뀌었어도 담을 때 것으로 대신할 수 있게 비면 채웁니다. */
      productName: line.productName || item.name,
      thumbnailUrl: line.thumbnailUrl || item.thumbnail,
      brandLabel: line.brandLabel || item.brand,
      key: item.key,
      quantity: item.quantity,
      orderable: item.selected && line.ok,
    };
  });

  /* ── 달라진 것 추리기 ───────────────────────────── */
  const raised: PriceChange[] = [];
  const lowered: PriceChange[] = [];
  const blocked: BlockedLine[] = [];

  if (status === 'ok') {
    for (const view of lines) {
      /*
       * ★ 못 사는 줄은 화면에 그린 값(view)으로 판단합니다.
       *   예전에는 서버 응답(byKey)에서 다시 찾았는데, 확인하지 못한 줄은
       *   서버 응답 자체가 없어서 조용히 넘어갔습니다. 주문에서는 빠지는데
       *   손님에게는 아무 말도 하지 않는 상태가 됩니다.
       */
      if (!view.ok) {
        blocked.push({ key: view.key, name: view.productName, reason: view.reason });
        continue;
      }

      /* 값 비교는 서버가 알려 준 값이 있어야 할 수 있습니다. */
      const line = byKey.get(view.key);
      if (!line) continue;

      /* ★ 체크를 풀어 둔 상품은 주문에 안 들어가므로 확인을 요구하지 않습니다. */
      const item = items.find((entry) => entry.key === view.key);
      if (!item?.selected) continue;

      const before = seen.current.get(view.key);
      if (before === undefined || before === line.unitPrice) continue;

      const change = {
        key: view.key,
        name: view.productName,
        before,
        after: line.unitPrice,
      };
      if (line.unitPrice > before) raised.push(change);
      else lowered.push(change);
    }
  }

  const acknowledge = useCallback(() => {
    const updates: { key: string; price: number; extraPrice: number }[] = [];
    for (const item of items) {
      const line = byKey.get(item.key);
      if (!line || !line.ok) continue;
      /* 확인한 값을 기준으로 삼습니다. 이제 이 가격이 "손님이 본 값" 입니다. */
      seen.current.set(item.key, line.unitPrice);
      updates.push({
        key: item.key,
        price: line.unitPrice,
        extraPrice: line.extraPrice,
      });
    }
    acceptPrices(updates);
    setAckTick((tick) => tick + 1);
  }, [items, byKey, acceptPrices]);

  /* ackTick 은 확인 버튼을 누른 뒤 다시 그리게 하는 용도로만 씁니다. */
  void ackTick;

  /* ── 금액 ───────────────────────────────────────
   * ★ 값을 못 받았으면 담을 때 금액으로 그립니다. 어차피 주문은 막혀 있습니다. */
  const fallbackTotal = items
    .filter((item) => item.selected)
    .reduce((sum, item) => sum + item.price * item.quantity, 0);

  const usable = status === 'ok' && result !== null;
  const itemsTotal = usable ? result.itemsTotal : fallbackTotal;
  const shippingFee = usable ? result.shippingFee : 0;
  const extraShippingFee = usable ? result.extraShippingFee : 0;
  const remote = usable ? result.remote : false;

  const orderableCount = lines.filter((view) => view.orderable).length;

  /* ── 주문으로 넘어가도 되는지 ───────────────────── */
  let blockReason = '';
  if (status === 'loading') {
    blockReason = '가격을 확인하고 있습니다.';
  } else if (status === 'failed') {
    blockReason = '가격을 확인하지 못했습니다. 새로고침해 주세요.';
  } else if (raised.length > 0) {
    blockReason = '값이 오른 상품을 확인해 주세요.';
  } else if (orderableCount === 0) {
    blockReason = '주문할 수 있는 상품이 없습니다.';
  }

  return {
    status,
    lines,
    itemsTotal,
    shippingFee,
    extraShippingFee,
    remote,
    raised,
    lowered,
    blocked,
    orderableCount,
    acknowledge,
    canOrder: blockReason === '',
    blockReason,
  };
}
