import type { Metadata } from 'next';
import Link from 'next/link';
import CartPanel from '@/components/CartPanel';
import CopyBlocks from '@/components/CopyBlocks';
import { resolveCopy } from '@/lib/copy';
import { getCachedCopy, getCachedStore } from '@/lib/settings';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: '장바구니 · 주문 문의',
    description: `${store.name} 장바구니와 주문 문의 안내입니다. 담은 상품을 복사해 고객센터 ${store.phone}으로 보내주시면 접수됩니다.`,
    alternates: { canonical: '/order' },
    robots: { index: false, follow: true },
    openGraph: {
      title: `장바구니 · 주문 문의 | ${store.name}`,
      description: '담은 상품을 확인하고 주문 내역을 복사해 문의하실 수 있습니다.',
      url: '/order',
    },
  };
}

export default async function OrderPage() {
  const [copy, store] = await Promise.all([getCachedCopy(), getCachedStore()]);
  const steps = resolveCopy(copy.orderSteps, store);
  const notes = resolveCopy(copy.order, store);

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">CART &amp; ORDER</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          장바구니 · 주문 문의
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          온라인 결제 대신 문의 접수 방식으로 운영합니다. 담으신 상품을 복사해 고객센터로
          보내주시면 재고와 배송 일정을 확인한 뒤 결제 방법을 문자로 안내드립니다.
        </p>
      </header>

      <section aria-label="장바구니" className="mt-12">
        <CartPanel />
      </section>

      <section aria-labelledby="step-heading" className="section border-t border-stone">
        <p className="label-xs">HOW TO ORDER</p>
        <h2
          id="step-heading"
          className="mt-3 font-serif text-[22px] leading-snug text-ink md:text-[28px]"
        >
          주문 절차
        </h2>
        <ol className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((step, index) => (
            <li key={index} className="border-t border-stone pt-6">
              <p className="font-display text-[30px] font-light tracking-[0.1em] text-ink">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-3 font-serif text-[19px] text-ink">{step.heading}</h3>
              <div
                className="detail-body mt-3 text-[15px] leading-[1.9] text-ink"
                dangerouslySetInnerHTML={{ __html: step.html }}
              />
            </li>
          ))}
        </ol>

        <div className="mt-12 border border-stone p-6 md:p-8">
          <CopyBlocks
            blocks={notes}
            headingLevel={3}
            headingClassName="font-serif text-[19px] text-ink"
            bodyClassName="detail-body mt-4 text-[15px] leading-[1.9] text-ink"
            className="flex flex-col gap-8"
          />

          <div className="mt-8 flex flex-wrap gap-4">
            <a href={`tel:${store.phone}`} className="btn-primary">
              고객센터 {store.phone}
            </a>
            <Link href="/guide" className="btn-secondary">
              배송·교환·반품 안내
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
