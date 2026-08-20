import { formatPrice } from '@/lib/product-utils';
import type { SalesSettings, ShippingSettings, StoreSettings } from '@/lib/site-config';

/**
 * 상품 상세의 [판매정보] 탭.
 *
 * ★ 전 상품 공통입니다. 상품마다 따로 적지 않습니다.
 * ★ 판매자 정보와 배송비·반품 주소는 설정에 이미 있는 값을 그대로 가져옵니다.
 *   같은 내용을 두 군데 적어 두면 한쪽만 고쳐져 어긋납니다.
 */

function Block({ title, body }: { title: string; body: string }) {
  if (!body.trim()) return null;
  return (
    <div className="border-b border-stone py-7">
      <h3 className="text-[16px] font-medium text-ink">{title}</h3>
      <p className="mt-3 whitespace-pre-line text-[16px] leading-[1.9] text-muted">
        {body}
      </p>
    </div>
  );
}

/** 배송비 안내를 직접 적지 않았으면 배송 설정으로 문장을 만듭니다. */
function shippingSentence(sales: SalesSettings, shipping: ShippingSettings): string {
  if (sales.shippingNote.trim()) return sales.shippingNote;

  const lines = [
    shipping.baseFee > 0
      ? `기본 배송비 ${formatPrice(shipping.baseFee)}원`
      : '전 상품 무료배송',
  ];
  if (shipping.freeThreshold > 0) {
    lines.push(`${formatPrice(shipping.freeThreshold)}원 이상 구매하시면 배송비가 없습니다.`);
  }
  if (shipping.islandFee > 0) {
    lines.push(
      `제주·도서산간 지역은 ${formatPrice(shipping.islandFee)}원이 추가됩니다.`
    );
  }
  return lines.join('\n');
}

export default function SalesInfo({
  sales,
  shipping,
  store,
}: {
  sales: SalesSettings;
  shipping: ShippingSettings;
  store: StoreSettings;
}) {
  const returnAddress = sales.returnAddress.trim() || shipping.returnAddress;

  return (
    <section aria-labelledby="sales-title" className="section">
      <p className="label-xs">SALES INFO</p>
      <h2
        id="sales-title"
        className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
      >
        판매정보
      </h2>

      <div className="mt-10 max-w-[820px] border-t border-stone">
        <Block title="배송비" body={shippingSentence(sales, shipping)} />
        <Block title="배송 기간" body={sales.deliveryPeriod} />
        <Block title="교환·반품 조건" body={sales.exchangePolicy} />
        <Block title="교환·반품 비용" body={sales.exchangeCost} />
        <Block title="교환·반품이 불가한 경우" body={sales.notAllowed} />
        <Block title="반품 주소" body={returnAddress} />
        <Block title="A/S 안내" body={sales.asInfo} />

        <div className="py-7">
          <h3 className="text-[16px] font-medium text-ink">판매자 정보</h3>
          <dl className="mt-3 flex flex-col gap-2 text-[16px] leading-relaxed">
            <div className="flex gap-4">
              <dt className="w-[110px] shrink-0 text-muted">상호</dt>
              <dd className="text-ink">{store.business.company}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-[110px] shrink-0 text-muted">대표자</dt>
              <dd className="text-ink">{store.business.ceo}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-[110px] shrink-0 text-muted">사업자등록번호</dt>
              <dd className="text-ink">{store.business.regNumber}</dd>
            </div>
            {store.business.mailOrder ? (
              <div className="flex gap-4">
                <dt className="w-[110px] shrink-0 text-muted">통신판매업신고</dt>
                <dd className="text-ink">{store.business.mailOrder}</dd>
              </div>
            ) : null}
            <div className="flex gap-4">
              <dt className="w-[110px] shrink-0 text-muted">사업장 주소</dt>
              <dd className="text-ink">{store.business.address}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-[110px] shrink-0 text-muted">연락처</dt>
              <dd className="text-ink">{store.phone}</dd>
            </div>
            {store.email ? (
              <div className="flex gap-4">
                <dt className="w-[110px] shrink-0 text-muted">이메일</dt>
                <dd className="text-ink">{store.email}</dd>
              </div>
            ) : null}
            <div className="flex gap-4">
              <dt className="w-[110px] shrink-0 text-muted">운영시간</dt>
              <dd className="text-ink">{store.hours}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
