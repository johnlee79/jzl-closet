import type { Metadata } from 'next';
import Link from 'next/link';
import { store } from '@/lib/store';

export const metadata: Metadata = {
  title: '배송·교환·반품 안내',
  description: `${store.name}의 배송, 교환, 반품 절차 안내입니다. 출고 일정과 교환·반품 가능 기간, 불가 사유를 확인하세요.`,
  alternates: { canonical: '/guide' },
  openGraph: {
    title: `배송·교환·반품 안내 | ${store.name}`,
    description: '배송 일정과 교환·반품 절차를 안내드립니다.',
    url: '/guide',
  },
};

const sections = [
  {
    id: 'delivery',
    title: '배송 안내',
    items: [
      '주문 접수와 결제 확인이 완료된 후 1~3영업일 이내에 출고됩니다.',
      '출고 후 도착까지는 지역에 따라 1~3일이 더 소요됩니다. 도서·산간 지역은 추가 기간이 필요할 수 있습니다.',
      '주문이 몰리는 기간과 명절 전후에는 출고가 지연될 수 있으며, 지연이 예상되는 경우 문자로 미리 안내드립니다.',
      '배송비와 무료 배송 기준은 주문 접수 시 함께 안내드립니다.',
      '각인 등 주문 제작이 포함된 상품은 제작 기간 3~5영업일이 추가됩니다.',
    ],
  },
  {
    id: 'exchange',
    title: '교환 및 반품',
    items: [
      '상품 수령일로부터 7일 이내에 고객센터로 연락 주시면 교환 또는 반품을 접수해 드립니다.',
      '상품 하자나 오배송의 경우 왕복 배송비는 판매자가 부담합니다.',
      '단순 변심의 경우 왕복 배송비는 구매자가 부담하며, 상품과 구성품이 처음 상태 그대로여야 합니다.',
      '접수 없이 임의로 상품을 발송하시면 확인이 어려워 처리가 지연될 수 있습니다. 반드시 먼저 연락해 주세요.',
      '반품 확인 후 환불은 영업일 기준 3일 이내에 처리됩니다.',
    ],
  },
  {
    id: 'restriction',
    title: '교환·반품이 어려운 경우',
    items: [
      '구매자의 사용 또는 일부 소비로 상품의 가치가 뚜렷하게 감소한 경우',
      '시간이 지나 재판매가 어려울 정도로 상품의 상태가 변한 경우',
      '이니셜 각인 등 구매자의 요청에 따라 개별 제작이 이루어진 경우',
      '구성품(더스트백, 보증 카드, 부속 스트랩 등)이 누락되거나 훼손된 경우',
      '택이나 라벨을 제거한 경우, 착용 흔적이나 향취가 남은 경우',
    ],
  },
  {
    id: 'note',
    title: '상품 특성 안내',
    items: [
      '천연 가죽은 부위마다 결과 색이 조금씩 다르며, 이는 소재의 특성이지 하자가 아닙니다.',
      '모니터 환경에 따라 실제 색상과 화면의 색상에 차이가 있을 수 있습니다.',
      '수치는 재는 방법에 따라 1~2cm 내외의 오차가 있을 수 있습니다.',
      '울과 리넨 소재는 초기 착용 시 잔털이나 구김이 생길 수 있습니다.',
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[720px]">
        <p className="border border-stone px-4 py-3 text-[13px] leading-relaxed text-muted">
          본 문서는 초안이며 운영 전 검토가 필요합니다.
        </p>
        <p className="label-xs mt-8">GUIDE</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          배송·교환·반품 안내
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          아래 내용은 국내 전자상거래 일반 기준을 따릅니다. 개별 상품에 다른 조건이 적용될
          때는 상품 상세 페이지에 별도로 표기합니다.
        </p>
      </header>

      <div className="mt-14 flex flex-col gap-16">
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`${section.id}-heading`}>
            <h2
              id={`${section.id}-heading`}
              className="border-t border-stone pt-6 font-serif text-[20px] text-ink md:text-[24px]"
            >
              {section.title}
            </h2>
            <ul className="mt-6 flex max-w-[820px] flex-col gap-3">
              {section.items.map((item) => (
                <li key={item} className="flex gap-3 text-[15px] leading-[1.9] text-ink">
                  <span aria-hidden="true" className="text-stone">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section aria-labelledby="contact-heading" className="section border-t border-stone">
        <h2
          id="contact-heading"
          className="font-serif text-[20px] text-ink md:text-[24px]"
        >
          문의처
        </h2>
        <p className="mt-4 text-[15px] leading-[1.9] text-ink">
          {store.business.company} · 고객센터 {store.phone}
          <br />
          평일 10:00 — 17:00 (점심 12:30 — 13:30, 주말·공휴일 휴무)
          <br />
          {store.business.address}
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
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
