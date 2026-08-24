'use client';

import Link from 'next/link';
import CartChangeNotice from '@/components/CartChangeNotice';
import CopyOrderButton from '@/components/CopyOrderButton';
import KakaoChatButton from '@/components/KakaoChatButton';
import RecentlyViewed from '@/components/RecentlyViewed';
import SignupPointBadge from '@/components/SignupPointBadge';
import SafeImage from '@/components/SafeImage';
import { useSite } from '@/components/SiteProvider';
import { useCart } from '@/lib/cart';
import { useCartLive } from '@/lib/cart-live';
import { useMember } from '@/lib/member';
import type { ResolvedBlock } from '@/lib/copy';
import { formatPrice } from '@/lib/product-utils';
import { EARN_PAYOUT_NOTE, expectedPurchasePoints } from '@/lib/site-config';

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
   *
   * ★ 서버에서 쿠키를 읽으면 정적 생성이 깨지므로 브라우저에서 물어봅니다.
   * ★★ null 이면 아직 모릅니다. 모르는 동안에는 배지를 그리지 않습니다.
   *   예전에는 "일단 비회원" 으로 그렸다가 답이 오면 지웠습니다. 그래서
   *   로그인한 분이 "가입하고 3,000P 받기" 를 봤다가 사라지는 걸 겪었습니다.
   */
  const member = useMember();
  /** 비회원이라는 것을 확인했을 때만 켭니다. 모르는 동안에는 꺼져 있습니다. */
  const showSignupBadge = member !== null && !member.loggedIn;
  /*
   * ★ 위에 배지가 있으면 간격을 좁힙니다.
   *   아직 모르는 동안에는 배지가 없으므로 회원과 같은 간격을 씁니다.
   */
  const orderButtonTop = showSignupBadge ? 'mt-4' : 'mt-8';

  const { items, count, ready, removeItem, updateQuantity, setSelected, clear } = useCart();
  // 브랜드명·고객센터 번호·배송비는 관리자 설정 값을 씁니다.
  const { store, shipping, points } = useSite();

  /*
   * ★★ 금액은 전부 여기서 나옵니다. 담을 때 적어 둔 값으로 계산하지 않습니다.
   *   배송비도 서버가 낸 값을 그대로 씁니다. 예전에는 이 화면이 직접 어림잡았는데
   *   상품별 무료배송 설정을 화면이 몰라서 실제 청구액과 어긋났습니다.
   */
  const live = useCartLive();
  const total = live.itemsTotal;
  const shippingFee = live.shippingFee;

  // 배송비를 뺀 상품금액 기준으로 계산합니다. (서버 지급 기준과 같습니다)
  const expectedEarn = expectedPurchasePoints(total, points);

  const freeShippingLeft =
    shipping.freeThreshold > 0 ? Math.max(0, shipping.freeThreshold - total) : 0;

  /** 주문에 실제로 들어갈 개수 (줄 수가 아니라 수량 합계) */
  const orderableQuantity = live.lines
    .filter((line) => line.orderable)
    .reduce((sum, line) => sum + line.quantity, 0);

  /** 주문에 들어갈 줄만 골라 옮겨 적습니다. 못 사는 것은 뺍니다. */
  const orderText = [
    `[${store.name} 주문 문의]`,
    '',
    ...live.lines
      .filter((line) => line.orderable)
      .map((line) => {
        const item = items.find((entry) => entry.key === line.key);
        const options =
          Object.entries(item?.options ?? {})
            .map(([name, value]) => `${name}: ${value}`)
            .join(' / ') || line.optionKey;
        const extra =
          line.extraPrice !== 0
            ? ` (옵션 ${line.extraPrice > 0 ? '+' : '−'}${formatPrice(Math.abs(line.extraPrice))}원)`
            : '';
        return `· ${line.productName} (${line.brandLabel})${options ? ` — ${options}` : ''}${extra} — ${line.quantity}개 — ${formatPrice(line.unitPrice * line.quantity)}원`;
      }),
    '',
    `합계: ${formatPrice(total)}원 (총 ${orderableQuantity}개)`,
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
        {/* 담아 두신 뒤 값이 바뀌었거나 못 사게 된 상품을 알립니다. */}
        <CartChangeNotice live={live} />

        <ul className="border-t border-stone">
          {items.map((item, index) => {
            const line = live.lines[index];
            /* 살 수 없는 줄 — 흐리게 그리고 체크를 풀어 둡니다. 지우지는 않습니다. */
            const unavailable = Boolean(line && !line.ok);
            const name = line?.productName || item.name;
            const brand = line?.brandLabel || item.brand;
            const unitPrice = line?.unitPrice ?? item.price;
            const extraPrice = line?.extraPrice ?? item.extraPrice;

            return (
              <li
                key={item.key}
                className="flex gap-3 border-b border-stone py-6 md:gap-4"
              >
                {/*
                  ★ 주문에 넣을지 고르는 칸입니다.
                    살 수 없는 상품은 꺼진 채로 두어 손님이 켤 수 없게 합니다.
                    체크가 풀려 있어도 장바구니에서 사라지지는 않습니다.
                */}
                <div className="flex shrink-0 items-start pt-1">
                  <input
                    type="checkbox"
                    checked={item.selected && !unavailable}
                    disabled={unavailable}
                    onChange={(event) => setSelected(item.key, event.target.checked)}
                    aria-label={`${name} 주문에 포함`}
                    className="h-5 w-5 accent-[#6A2E3C] disabled:opacity-40"
                  />
                </div>

                <div
                  className={`flex min-w-0 flex-1 gap-4 md:gap-6 ${
                    unavailable ? 'opacity-45' : ''
                  }`}
                >
                  <Link
                    href={`/products/${item.productId}`}
                    className="h-[104px] w-[80px] shrink-0 overflow-hidden bg-stone md:h-[130px] md:w-[100px]"
                  >
                    <SafeImage
                      src={line?.thumbnailUrl || item.thumbnail}
                      alt={`${brand} ${name} 장바구니 썸네일`}
                      label={name}
                      width={200}
                      height={260}
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-[14px] tracking-[0.16em] text-muted">{brand}</p>
                    <Link
                      href={`/products/${item.productId}`}
                      className="mt-1 text-[18px] font-medium leading-snug text-ink"
                    >
                      {name}
                    </Link>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                      {Object.entries(item.options)
                        .map(([optionName, value]) => `${optionName} · ${value}`)
                        .join(' / ') ||
                        item.optionKey ||
                        '옵션 없음'}
                      {extraPrice !== 0 ? (
                        <span className="ml-1.5 text-ink">
                          (옵션 {extraPrice > 0 ? '+' : '−'}
                          {formatPrice(Math.abs(extraPrice))}원)
                        </span>
                      ) : null}
                    </p>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                      <div className="flex items-center border border-stone">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.key, item.quantity - 1)}
                          aria-label={`${name} 수량 줄이기`}
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
                          aria-label={`${name} 수량 늘리기`}
                          className="flex h-11 w-11 items-center justify-center transition-colors duration-200 hover:bg-stone"
                        >
                          <svg width="11" height="11" viewBox="0 0 11 11" stroke="#14141A" aria-hidden="true">
                            <path d="M0 5.5h11M5.5 0v11" />
                          </svg>
                        </button>
                      </div>

                      <span className="text-[17px] font-medium text-ink">
                        {formatPrice(unitPrice * item.quantity)}원
                      </span>
                    </div>
                  </div>
                </div>

                {/* 살 수 없는 이유와 삭제는 흐리게 하지 않습니다. 읽고 눌러야 하는 것입니다. */}
                <div className="flex shrink-0 flex-col items-end justify-between">
                  {unavailable ? (
                    <span className="whitespace-nowrap text-[14px] font-medium text-wine">
                      {line?.reason}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    className="tap-target text-[15px] text-muted underline underline-offset-4"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
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
              <dt className="text-muted">주문할 상품</dt>
              {/*
                ★ 담긴 개수가 아니라 주문에 들어갈 개수입니다. 아래 금액과 짝이 맞아야 합니다.
                ★ 둘 다 "개" 로 셉니다. 한쪽은 건, 한쪽은 개로 세면 2개짜리 한 줄이
                  "1건 (담긴 것 2개)" 로 나와 무엇이 빠졌다는 말처럼 읽힙니다.
              */}
              <dd className="text-ink">
                {orderableQuantity}개
                {orderableQuantity < count ? (
                  <span className="ml-1.5 text-[14px] text-muted">
                    (담긴 것 {count}개)
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">상품 합계</dt>
              <dd className="text-ink">{formatPrice(total)}원</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">배송비</dt>
              {/* ★ 주문할 것이 없으면 "무료" 가 아니라 "—" 입니다. 낼 배송비 자체가 없습니다. */}
              <dd className="text-ink">
                {live.status !== 'ok'
                  ? '확인 중'
                  : live.orderableCount === 0
                    ? '—'
                    : shippingFee === 0
                      ? '무료'
                      : `${formatPrice(shippingFee)}원`}
              </dd>
            </div>
          </dl>

          {/*
            ★ 예상 적립 — 적립률 × 상품금액을 화면에서 계산합니다.
            ★ 지급 시점은 줄을 바꿔 아래에 둡니다.
              한 줄에 이어 붙이면 좁은 요약 상자에서 괄호 한가운데가 끊겨
              "…적립 예정 (배송완" / "료 시점에 지급)" 처럼 읽힙니다.
              어차피 두 줄이 될 자리라면 뜻이 끊기는 곳에서 끊습니다.
            ★ 금액은 줄바꿈으로 쪼개지지 않게 붙여 둡니다.
          */}
          {expectedEarn > 0 ? (
            <p className="mt-4 text-[15px] leading-relaxed text-wine">
              이번 주문으로{' '}
              <strong className="whitespace-nowrap font-semibold">
                {formatPrice(expectedEarn)}P
              </strong>{' '}
              적립 예정
              <span className="mt-0.5 block text-[13px] text-muted">
                {EARN_PAYOUT_NOTE}
              </span>
            </p>
          ) : null}

          {/* ★ 주문할 것이 하나도 없을 때는 안내하지 않습니다.
              "0원인데 5만원을 더 담으라" 는 말이 되어 위 배송비 줄과 어긋납니다.
            ★ 본문 색(ink)으로 올립니다. muted 는 캡션·라벨 자리의 색인데
              이 줄은 손님이 읽고 행동하기를 바라는 문장입니다. */}
          {freeShippingLeft > 0 && live.orderableCount > 0 ? (
            <p className="mt-4 text-[15px] leading-relaxed text-ink">
              <strong className="whitespace-nowrap font-semibold">
                {formatPrice(freeShippingLeft)}원
              </strong>{' '}
              더 담으시면 배송비가{' '}
              {/* ★ "무료" 와 "입니다" 사이에서 줄이 끊기면 "입니다." 만 남습니다. 붙여 둡니다. */}
              <span className="whitespace-nowrap">
                <strong className="font-semibold text-wine">무료</strong>입니다.
              </span>
            </p>
          ) : null}

          <div className="mt-6 flex items-baseline justify-between border-t border-stone pt-6">
            <span className="text-[14px] tracking-[0.14em] text-muted">합계</span>
            <span className="font-display text-[30px] font-medium tracking-wide text-ink">
              {formatPrice(total + shippingFee)}
              <span className="ml-1 font-sans text-[16px]">원</span>
            </span>
          </div>

          {/*
            ★ 전환이 가장 잘 일어나는 자리입니다. 비회원에게만 보여 줍니다.
            ★★ 로그인 여부를 알기 전에는 그리지 않습니다. 회원에게 잠깐이라도
              보이면 안 됩니다. 비회원에게는 답이 온 뒤 나타나면서 아래가
              조금 밀리는데, 틀린 것을 보여 주는 것보다 낫습니다.
          */}
          {showSignupBadge ? (
            <div className="mt-8 flex justify-center">
              <SignupPointBadge href="/signup?next=/checkout" />
            </div>
          ) : null}

          {/*
            ★★ 값을 확인하기 전에는 주문서로 보내지 않습니다.
              값을 모르는 채로 결제까지 가면 손님이 본 적 없는 금액이 청구됩니다.
              막는 경우는 세 가지입니다 — 아직 확인 중 · 확인 실패 ·
              값이 오른 상품을 손님이 아직 확인하지 않음.
            ★ 링크가 아니라 버튼으로 둡니다. 링크는 잠글 수가 없어서
              눌리지 않는 척만 하고 실제로는 넘어갑니다.
          */}
          {live.canOrder ? (
            <Link
              href="/checkout"
              className={`btn-primary w-full ${orderButtonTop}`}
            >
              주문하기
            </Link>
          ) : (
            <>
              <button
                type="button"
                disabled
                className={`btn-primary w-full ${orderButtonTop}`}
              >
                주문하기
              </button>
              <p
                role="status"
                className="mt-3 text-center text-[14px] leading-relaxed text-wine"
              >
                {live.blockReason}
              </p>
            </>
          )}

          {/*
            ★ 결제 수단 안내는 관리자 문구 한 곳(copy.cartPayment)에서만 옵니다. (3-L)
              예전에는 이 문단이 코드에 박혀 있었고, /order 아래쪽 '결제 안내' 에도
              같은 말이 또 있었습니다. 한쪽만 고치면 같은 화면에서 서로 다른 말을
              하게 됩니다. 카드결제를 붙이는 날 반드시 사고가 나는 자리였습니다.
          */}
          {payNote?.html ? (
            <div
              id="payment-notice"
              className="detail-body mt-3 scroll-mt-24 text-[14px] leading-relaxed text-muted"
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
                id="cart-copy-note"
                className="detail-body mt-3 scroll-mt-24 text-[14px] leading-relaxed text-muted"
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
