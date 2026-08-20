'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CopyOrderButton from '@/components/CopyOrderButton';
import KakaoChatButton from '@/components/KakaoChatButton';
import RecentlyViewed from '@/components/RecentlyViewed';
import SignupPointBadge from '@/components/SignupPointBadge';
import SafeImage from '@/components/SafeImage';
import { useSite } from '@/components/SiteProvider';
import { useCart } from '@/lib/cart';
import type { ResolvedBlock } from '@/lib/copy';
import { formatPrice } from '@/lib/product-utils';
import { expectedPurchasePoints } from '@/lib/site-config';

/**
 * ★ 문구는 서버(/order 페이지)가 읽어 넘겨 줍니다. (3-L)
 *   이 컴포넌트는 클라이언트라 getCachedCopy 를 직접 부를 수 없습니다.
 *   SiteProvider 에 문구를 통째로 실으면 전 페이지의 첫 로딩에 딸려 가므로,
 *   이 화면에서만 쓰는 세 덩어리를 props 로 받습니다.
 */
export default function CartPanel({
  emptyNote,
  payNote,
  copyNote,
}: {
  /** 장바구니가 비었을 때 안내 */
  emptyNote?: ResolvedBlock;
  /** 결제 수단 안내 — 사이트에서 이 문구 하나만 결제 수단을 말합니다 */
  payNote?: ResolvedBlock;
  /** 주문 내역 복사 안내 */
  copyNote?: ResolvedBlock;
}) {
  /**
   * 로그인 여부. 배지를 보여 줄지만 정합니다.
   * ★ 서버에서 쿠키를 읽으면 정적 생성이 깨지므로 브라우저에서 물어봅니다.
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

  const { items, total, count, ready, removeItem, updateQuantity, clear } = useCart();
  // 브랜드명·고객센터 번호·배송비는 관리자 설정 값을 씁니다.
  const { store, shipping, points } = useSite();
  // 배송비를 뺀 상품금액 기준으로 계산합니다. (서버 지급 기준과 같습니다)
  const expectedEarn = expectedPurchasePoints(total, points);

  /**
   * 장바구니에서 보여 주는 배송비는 어림값입니다.
   * 도서산간 추가비는 주소를 받아야 알 수 있어 주문서에서 확정됩니다.
   */
  const freeByThreshold = shipping.freeThreshold > 0 && total >= shipping.freeThreshold;
  const shippingFee = freeByThreshold ? 0 : shipping.baseFee;
  const freeShippingLeft =
    shipping.freeThreshold > 0 ? Math.max(0, shipping.freeThreshold - total) : 0;

  const orderText = [
    `[${store.name} 주문 문의]`,
    '',
    ...items.map((item) => {
      const options =
        Object.entries(item.options)
          .map(([name, value]) => `${name}: ${value}`)
          .join(' / ') || item.optionKey;
      const extra =
        item.extraPrice !== 0
          ? ` (옵션 ${item.extraPrice > 0 ? '+' : '−'}${formatPrice(Math.abs(item.extraPrice))}원)`
          : '';
      return `· ${item.name} (${item.brand})${options ? ` — ${options}` : ''}${extra} — ${item.quantity}개 — ${formatPrice(item.price * item.quantity)}원`;
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
      <p className="border-t border-stone py-16 text-[17px] text-ink">
        장바구니를 불러오는 중입니다.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border-t border-stone py-16">
        {/* 빈 장바구니 안내 — 관리자 문구입니다. (3-L) */}
        {emptyNote?.heading ? (
          <p className="text-[17px] leading-relaxed text-ink">{emptyNote.heading}</p>
        ) : null}
        {emptyNote?.html ? (
          <div
            className="detail-body mt-2 text-[16px] leading-relaxed text-ink"
            dangerouslySetInnerHTML={{ __html: emptyNote.html }}
          />
        ) : null}
        <Link href="/products" className="btn-primary mt-8">
          전체 상품 보기
        </Link>

        {/*
          ★ 빈 장바구니에서 그냥 나가 버리는 걸 막습니다. (3-H C-1)
            "전체 상품 보기" 는 처음부터 다시 고르라는 말이라 손이 잘 안 갑니다.
            아까 보던 것을 그 자리에 다시 꺼내 주면 이어서 고를 수 있습니다.
          ★ 최근 본 기록이 없으면 이 자리는 아예 나오지 않습니다.
        */}
        <RecentlyViewed className="mt-16 border-t border-stone pt-12" />
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
                <p className="text-[14px] tracking-[0.16em] text-muted">{item.brand}</p>
                <Link
                  href={`/products/${item.productId}`}
                  className="mt-1 text-[18px] font-medium leading-snug text-ink"
                >
                  {item.name}
                </Link>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                  {Object.entries(item.options)
                    .map(([name, value]) => `${name} · ${value}`)
                    .join(' / ') ||
                    item.optionKey ||
                    '옵션 없음'}
                  {item.extraPrice !== 0 ? (
                    <span className="ml-1.5 text-ink">
                      (옵션 {item.extraPrice > 0 ? '+' : '−'}
                      {formatPrice(Math.abs(item.extraPrice))}원)
                    </span>
                  ) : null}
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
                    <span className="w-10 text-center text-[16px] tabular-nums">
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
                    <span className="text-[17px] font-medium text-ink">
                      {formatPrice(item.price * item.quantity)}원
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="tap-target text-[15px] text-muted underline underline-offset-4"
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
          className="tap-target mt-6 text-[15px] text-muted underline underline-offset-4"
        >
          장바구니 비우기
        </button>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="border border-stone p-6 md:p-8">
          <h2 className="font-serif text-[19px] text-ink">주문 요약</h2>
          <dl className="mt-6 flex flex-col gap-3 border-t border-stone pt-6 text-[16px]">
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
              <dd className="text-ink">
                {shippingFee === 0 ? '무료' : `${formatPrice(shippingFee)}원`}
              </dd>
            </div>
          </dl>

          {/* ★ 예상 적립 — 적립률 × 상품금액을 화면에서 계산합니다. */}
          {expectedEarn > 0 ? (
            <p className="mt-4 text-[14px] leading-relaxed text-wine">
              이번 주문으로 {formatPrice(expectedEarn)}P 적립 예정
              <span className="ml-1 text-muted">(배송완료 시점에 지급)</span>
            </p>
          ) : null}

          {freeShippingLeft > 0 ? (
            <p className="mt-4 text-[14px] leading-relaxed text-muted">
              {formatPrice(freeShippingLeft)}원 더 담으시면 배송비가 무료입니다.
            </p>
          ) : null}

          <div className="mt-6 flex items-baseline justify-between border-t border-stone pt-6">
            <span className="text-[14px] tracking-[0.14em] text-muted">합계</span>
            <span className="text-[30px] font-semibold tabular-nums tracking-tight text-ink">
              {formatPrice(total + shippingFee)}
              <span className="ml-1 font-sans text-[16px]">원</span>
            </span>
          </div>

          {/* ★ 전환이 가장 잘 일어나는 자리입니다. 비회원에게만 보여 줍니다. */}
          {isMember ? null : (
            <div className="mt-8 flex justify-center">
              <SignupPointBadge href="/signup?next=/checkout" />
            </div>
          )}

          <Link
            href="/checkout"
            className={`btn-primary w-full ${isMember ? 'mt-8' : 'mt-4'}`}
          >
            주문하기
          </Link>

          {/*
            ★ 결제 수단 안내는 관리자 문구 한 곳(copy.cartPayment)에서만 옵니다. (3-L)
              예전에는 이 문단이 코드에 박혀 있었고, /order 아래쪽 '결제 안내' 에도
              같은 말이 또 있었습니다. 한쪽만 고치면 같은 화면에서 서로 다른 말을
              하게 됩니다. 카드결제를 붙이는 날 반드시 사고가 나는 자리였습니다.
          */}
          {payNote?.html ? (
            <div
              className="detail-body mt-3 text-[14px] leading-relaxed text-muted"
              dangerouslySetInnerHTML={{ __html: payNote.html }}
            />
          ) : null}

          <div className="mt-6 border-t border-stone pt-6">
            <CopyOrderButton text={orderText} />
            {/* ★ 전화 걸기 버튼을 카카오톡 실시간 문의로 바꿨습니다.
                설정에 채팅방 주소가 없으면 버튼이 나오지 않으므로,
                아래 안내는 버튼을 가리키지 않고 혼자서도 말이 되게 적습니다. */}
            <KakaoChatButton className="mt-3 w-full" />
            {copyNote?.html ? (
              <div
                className="detail-body mt-3 text-[14px] leading-relaxed text-muted"
                dangerouslySetInnerHTML={{ __html: copyNote.html }}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-6 border border-stone p-6 md:p-8">
          <h2 className="font-serif text-[19px] text-ink">주문 내역</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            복사가 되지 않을 때는 아래 내용을 직접 선택해 복사해 주세요.
          </p>
          <textarea
            readOnly
            value={orderText}
            rows={10}
            aria-label="복사할 주문 내역"
            className="mt-4 w-full resize-none rounded-none border border-stone bg-transparent p-4 text-[14px] leading-relaxed text-ink outline-none focus:border-ink"
          />
        </div>
      </aside>
    </div>
  );
}
