'use client';

import Link from 'next/link';
import CopyOrderButton from '@/components/CopyOrderButton';
import SafeImage from '@/components/SafeImage';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/products';
import { store } from '@/lib/store';

export default function CartPanel() {
  const { items, total, count, ready, removeItem, updateQuantity, clear } = useCart();

  const orderText = [
    `[${store.name} 주문 문의]`,
    '',
    ...items.map((item) => {
      const options = Object.entries(item.options)
        .map(([name, value]) => `${name}: ${value}`)
        .join(' / ');
      return `· ${item.name} (${item.brand})${options ? ` — ${options}` : ''} — ${item.quantity}개 — ${formatPrice(item.price * item.quantity)}원`;
    }),
    '',
    `합계: ${formatPrice(total)}원 (총 ${count}개)`,
    '',
    '받는 분 성함:',
    '연락처:',
    '배송지 주소:',
    '요청사항:',
  ].join('\n');

  if (!ready) {
    return (
      <p className="border-t border-stone py-16 text-[16px] text-ink">
        장바구니를 불러오는 중입니다.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border-t border-stone py-16">
        <p className="text-[16px] leading-relaxed text-ink">장바구니가 비어 있습니다.</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">
          마음에 드는 상품을 담아두시면 이 브라우저에 저장되어 다음 방문에도 남아 있습니다.
        </p>
        <Link href="/products" className="btn-primary mt-8">
          전체 상품 보기
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px] lg:gap-16">
      <div>
        <ul className="border-t border-stone">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex gap-4 border-b border-stone py-6 md:gap-6"
            >
              <Link
                href={`/products/${item.productId}`}
                className="h-[104px] w-[80px] shrink-0 overflow-hidden bg-stone md:h-[130px] md:w-[100px]"
              >
                <SafeImage
                  src={item.thumbnail}
                  alt={`${item.brand} ${item.name} 장바구니 썸네일`}
                  label={item.name}
                  width={200}
                  height={260}
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <p className="text-[13px] tracking-[0.16em] text-muted">{item.brand}</p>
                <Link
                  href={`/products/${item.productId}`}
                  className="mt-1 font-serif text-[17px] leading-snug text-ink"
                >
                  {item.name}
                </Link>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  {Object.entries(item.options)
                    .map(([name, value]) => `${name} · ${value}`)
                    .join(' / ') || '옵션 없음'}
                </p>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                  <div className="flex items-center border border-stone">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                      aria-label={`${item.name} 수량 줄이기`}
                      className="flex h-11 w-11 items-center justify-center transition-colors duration-200 hover:bg-stone"
                    >
                      <svg width="11" height="1" viewBox="0 0 11 1" stroke="#14141A" aria-hidden="true">
                        <path d="M0 0.5h11" />
                      </svg>
                    </button>
                    <span className="w-10 text-center text-[15px] tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                      aria-label={`${item.name} 수량 늘리기`}
                      className="flex h-11 w-11 items-center justify-center transition-colors duration-200 hover:bg-stone"
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11" stroke="#14141A" aria-hidden="true">
                        <path d="M0 5.5h11M5.5 0v11" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-[16px] font-medium text-ink">
                      {formatPrice(item.price * item.quantity)}원
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="tap-target text-[14px] text-muted underline underline-offset-4"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={clear}
          className="tap-target mt-6 text-[14px] text-muted underline underline-offset-4"
        >
          장바구니 비우기
        </button>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="border border-stone p-6 md:p-8">
          <h2 className="font-serif text-[18px] text-ink">주문 요약</h2>
          <dl className="mt-6 flex flex-col gap-3 border-t border-stone pt-6 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-muted">상품 수량</dt>
              <dd className="text-ink">{count}개</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">상품 합계</dt>
              <dd className="text-ink">{formatPrice(total)}원</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">배송비</dt>
              <dd className="text-ink">주문 확인 후 안내</dd>
            </div>
          </dl>

          <div className="mt-6 flex items-baseline justify-between border-t border-stone pt-6">
            <span className="text-[13px] tracking-[0.14em] text-muted">합계</span>
            <span className="font-display text-[28px] font-medium tracking-wide text-ink">
              {formatPrice(total)}
              <span className="ml-1 font-sans text-[15px]">원</span>
            </span>
          </div>

          <div className="mt-8">
            <CopyOrderButton text={orderText} />
          </div>

          <a href={`tel:${store.phone}`} className="btn-primary mt-3 w-full">
            전화로 주문 문의
          </a>

          <p className="mt-6 text-[13px] leading-relaxed text-muted">
            온라인 결제 절차는 제공하지 않습니다. 복사한 주문 내역을 고객센터로 보내주시면
            재고와 배송 일정을 확인한 뒤 결제 방법을 문자로 안내드립니다.
          </p>
        </div>

        <div className="mt-6 border border-stone p-6 md:p-8">
          <h2 className="font-serif text-[18px] text-ink">주문 내역</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            복사가 되지 않을 때는 아래 내용을 직접 선택해 복사해 주세요.
          </p>
          <textarea
            readOnly
            value={orderText}
            rows={10}
            aria-label="복사할 주문 내역"
            className="mt-4 w-full resize-none rounded-none border border-stone bg-transparent p-4 text-[13px] leading-relaxed text-ink outline-none focus:border-ink"
          />
        </div>
      </aside>
    </div>
  );
}
