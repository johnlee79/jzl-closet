import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/store';
import Link from 'next/link';
import CartPanel from '@/components/CartPanel';
import CopyBlocks from '@/components/CopyBlocks';
import KakaoChatButton from '@/components/KakaoChatButton';
import { resolveCopy } from '@/lib/copy';
import { getCachedCopy, getCachedStore } from '@/lib/settings';

export const revalidate = 60;

/** 문구 첫 블록을 평문으로. 메타데이터에는 태그가 들어가면 안 됩니다. */
function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function generateMetadata(): Promise<Metadata> {
  const [store, copy] = await Promise.all([getCachedStore(), getCachedCopy()]);

  /*
    ★ 제목·설명을 관리자 문구에서 가져옵니다. (3-L)
      코드에 박아 두면 결제 방식이 바뀔 때 이 자리까지 손이 닿지 않습니다.
  */
  const head = resolveCopy(copy.orderHero, store)[0];
  const title = head?.heading.trim() || '장바구니 · 주문';
  const description =
    plain(head?.html ?? '').slice(0, 160) || `${store.name} 장바구니와 주문 안내입니다.`;

  return {
    title,
    description,
    alternates: { canonical: '/order' },
    robots: { index: false, follow: true },
    openGraph: {
      title: `${title} | ${store.name}`,
      description,
      url: '/order',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function OrderPage() {
  const [copy, store] = await Promise.all([getCachedCopy(), getCachedStore()]);
  const head = resolveCopy(copy.orderHero, store)[0];
  const steps = resolveCopy(copy.orderSteps, store);
  const notes = resolveCopy(copy.order, store);

  return (
    <div className="shell py-14 md:py-20">
      {/*
        ★ 제목과 안내 문단을 관리자 문구로 옮겼습니다. (3-L)
          곧 카드결제가 붙는데 "무통장입금" 이 코드에 박혀 있으면 그날 손님에게
          거짓말이 됩니다. 코드를 고치지 않고 관리자에서 바꿀 수 있어야 합니다.
        ★ 영문 라벨 CART & ORDER 는 그대로 둡니다. 섹션을 구분하는 표지입니다.
        ★ '주문 조회' 링크는 문구 본문 안의 <a> 로 들어 있습니다.
          편집기가 링크를 허용하므로 운영자가 주소까지 고칠 수 있습니다.
      */}
      <header className="max-w-[680px]">
        <p className="label-xs">CART &amp; ORDER</p>
        {head?.heading ? (
          <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
            {head.heading}
          </h1>
        ) : null}
        {head?.html ? (
          <div
            className="detail-body mt-4 text-[17px] leading-[1.9] text-ink md:text-[18px]"
            dangerouslySetInnerHTML={{ __html: head.html }}
          />
        ) : null}
      </header>

      <section aria-label="장바구니" className="mt-12">
        <CartPanel
          emptyNote={resolveCopy(copy.cartEmpty, store)[0]}
          payNote={resolveCopy(copy.cartPayment, store)[0]}
          copyNote={resolveCopy(copy.cartCopyNote, store)[0]}
        />
      </section>

      <section aria-labelledby="step-heading" className="section border-t border-stone">
        <p className="label-xs">HOW TO ORDER</p>
        <h2
          id="step-heading"
          className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[30px]"
        >
          주문 절차
        </h2>
        <ol className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((step, index) => (
            <li key={index} className="border-t border-stone pt-6">
              <p className="font-display text-[32px] font-light tracking-[0.1em] text-ink">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-3 font-serif text-[20px] text-ink">{step.heading}</h3>
              <div
                className="detail-body mt-3 text-[16px] leading-[1.9] text-ink"
                dangerouslySetInnerHTML={{ __html: step.html }}
              />
            </li>
          ))}
        </ol>

        <div className="mt-12 border border-stone p-6 md:p-8">
          <CopyBlocks
            blocks={notes}
            headingLevel={3}
            headingClassName="font-serif text-[20px] text-ink"
            bodyClassName="detail-body mt-4 text-[16px] leading-[1.9] text-ink"
            className="flex flex-col gap-8"
          />

          {/* ★ 전화 걸기 버튼을 카카오톡 실시간 문의로 바꿨습니다.
              고객센터 번호는 푸터의 사업자 정보에 그대로 있습니다. */}
          <div className="btn-row mt-8">
            <KakaoChatButton />
            <Link href="/guide" className="btn-secondary">
              배송·교환·반품 안내
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
