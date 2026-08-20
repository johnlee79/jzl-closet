import type { Metadata } from 'next';
import Link from 'next/link';
import CopyBlocks from '@/components/CopyBlocks';
import { resolveCopy } from '@/lib/copy';
import { formatPrice } from '@/lib/product-utils';
import {
  getCachedCopy,
  getCachedShipping,
  getCachedStore,
  getOgImage,
} from '@/lib/settings';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: '배송·교환·반품 안내',
    description: `${store.name}의 배송, 교환, 반품 절차 안내입니다. 출고 일정과 교환·반품 가능 기간, 불가 사유를 확인하세요.`,
    alternates: { canonical: '/guide' },
    openGraph: {
      title: `배송·교환·반품 안내 | ${store.name}`,
      description: '배송 일정과 교환·반품 절차를 안내드립니다.',
      url: '/guide',
      images: [await getOgImage()],
    },
  };
}

export default async function GuidePage() {
  const [copy, store, shipping] = await Promise.all([
    getCachedCopy(),
    getCachedStore(),
    getCachedShipping(),
  ]);
  const blocks = resolveCopy(copy.guide, store);

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[720px] md:max-w-[900px]">
        <p className="label-xs">GUIDE</p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          배송·교환·반품 안내
        </h1>
        <p className="mt-4 text-[17px] leading-[1.9] text-ink md:text-[18px]">
          아래 내용은 국내 전자상거래 일반 기준을 따릅니다. 개별 상품에 다른 조건이 적용될
          때는 상품 상세 페이지에 별도로 표기합니다.
        </p>
      </header>

      {/* 관리자 > 설정 > 배송·반품 에서 고친 값이 그대로 나옵니다. */}
      <section aria-labelledby="fee-heading" className="mt-12">
        <h2
          id="fee-heading"
          className="border-t border-stone pt-6 font-serif text-[22px] text-ink md:text-[26px]"
        >
          배송비
        </h2>
        <dl className="mt-6 flex max-w-[820px] flex-col gap-3 text-[16px] leading-[1.9] text-ink">
          <div className="flex gap-4">
            <dt className="w-40 shrink-0 text-muted">기본 배송비</dt>
            <dd>
              {shipping.baseFee > 0 ? `${formatPrice(shipping.baseFee)}원` : '무료'}
            </dd>
          </div>
          {shipping.freeThreshold > 0 ? (
            <div className="flex gap-4">
              <dt className="w-40 shrink-0 text-muted">무료배송 기준</dt>
              <dd>{formatPrice(shipping.freeThreshold)}원 이상 구매 시 무료</dd>
            </div>
          ) : null}
          {shipping.islandFee > 0 ? (
            <div className="flex gap-4">
              <dt className="w-40 shrink-0 text-muted">제주·도서산간</dt>
              <dd>{formatPrice(shipping.islandFee)}원 추가</dd>
            </div>
          ) : null}
          {shipping.leadTime ? (
            <div className="flex gap-4">
              <dt className="w-40 shrink-0 text-muted">배송 소요일</dt>
              <dd>{shipping.leadTime}</dd>
            </div>
          ) : null}
          {shipping.returnAddress ? (
            <div className="flex gap-4">
              <dt className="w-40 shrink-0 text-muted">반품 주소</dt>
              <dd>{shipping.returnAddress}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <div className="mt-14">
        <CopyBlocks
          blocks={blocks}
          headingClassName="border-t border-stone pt-6 font-serif text-[22px] text-ink md:text-[26px]"
          bodyClassName="detail-body mt-6 max-w-[820px] text-[16px] leading-[1.9] text-ink"
          className="flex flex-col gap-16"
        />
      </div>

      <section className="section border-t border-stone">
        <div className="btn-row">
          <Link href="/order" className="btn-primary">
            주문 문의하기
          </Link>
          <Link href="/terms" className="btn-secondary">
            이용약관 보기
          </Link>
        </div>
      </section>
    </div>
  );
}
