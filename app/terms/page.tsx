import type { Metadata } from 'next';
import { store } from '@/lib/store';

export const metadata: Metadata = {
  title: '이용약관',
  description: `${store.name} 이용약관입니다. 서비스 이용 조건, 주문과 계약 성립, 청약철회 및 환불에 관한 사항을 안내합니다.`,
  alternates: { canonical: '/terms' },
  openGraph: {
    title: `이용약관 | ${store.name}`,
    description: '서비스 이용 조건과 주문·환불에 관한 약관입니다.',
    url: '/terms',
  },
};

const articles = [
  {
    title: '제1조 (목적)',
    body: `본 약관은 ${store.business.company}(이하 "회사")가 운영하는 온라인 사이트 ${store.name}(이하 "몰")에서 제공하는 서비스의 이용 조건과 절차, 회사와 이용자의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.`,
  },
  {
    title: '제2조 (용어의 정의)',
    body: '"몰"이란 회사가 재화 또는 용역을 이용자에게 제공하기 위해 컴퓨터 등 정보통신설비를 이용하여 설정한 가상의 영업장을 말합니다. "이용자"란 몰에 접속하여 본 약관에 따라 몰이 제공하는 서비스를 받는 자를 말합니다.',
  },
  {
    title: '제3조 (약관의 명시와 개정)',
    body: '회사는 본 약관의 내용을 이용자가 쉽게 확인할 수 있도록 몰의 화면에 게시합니다. 회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용일자와 개정 사유를 명시하여 적용일자 7일 전부터 공지합니다. 이용자에게 불리한 개정의 경우 30일 전부터 공지합니다.',
  },
  {
    title: '제4조 (서비스의 제공 및 변경)',
    body: '회사는 재화 또는 용역에 대한 정보 제공 및 구매 문의 접수, 구매 계약이 체결된 재화의 배송 업무를 수행합니다. 회사는 재화의 품절 또는 기술적 사양의 변경 등의 사유가 발생한 경우 제공할 재화의 내용을 변경할 수 있으며, 이 경우 변경 내용과 사유를 이용자에게 통지합니다.',
  },
  {
    title: '제5조 (주문 및 계약의 성립)',
    body: '본 몰은 별도의 온라인 결제 기능을 제공하지 않으며, 이용자가 장바구니에 담은 내역을 고객센터로 전달함으로써 주문 문의가 접수됩니다. 계약은 회사가 재고와 배송 가능 여부를 확인하고 이용자에게 접수 확인을 통지한 시점에 성립합니다.',
  },
  {
    title: '제6조 (지급 방법)',
    body: '회사는 주문 확인 후 이용자에게 개별적으로 지급 방법을 안내합니다. 회사는 몰의 화면에 계좌 정보를 상시 게시하지 않으며, 안내되지 않은 경로로 대금 지급을 요구하지 않습니다.',
  },
  {
    title: '제7조 (배송)',
    body: '회사는 이용자와 재화의 공급 시기에 관하여 별도의 약정이 없는 이상, 이용자가 대금을 지급한 날부터 영업일 기준 3일 이내에 재화의 배송에 필요한 조치를 취합니다. 배송 수단과 배송비 부담 주체는 주문 접수 시 안내합니다.',
  },
  {
    title: '제8조 (청약철회 등)',
    body: '이용자는 재화를 공급받은 날부터 7일 이내에 청약철회를 할 수 있습니다. 다만 이용자에게 책임 있는 사유로 재화가 멸실 또는 훼손된 경우, 이용자의 사용 또는 일부 소비로 재화의 가치가 현저히 감소한 경우, 이용자의 주문에 따라 개별적으로 생산된 재화의 경우에는 청약철회가 제한될 수 있습니다.',
  },
  {
    title: '제9조 (환불)',
    body: '회사는 이용자로부터 재화를 반환받은 날부터 영업일 기준 3일 이내에 대금을 환급합니다. 대금 환급이 지연되는 경우 회사는 그 사유를 이용자에게 안내합니다.',
  },
  {
    title: '제10조 (개인정보 보호)',
    body: '회사는 이용자의 개인정보를 관련 법령이 정하는 바에 따라 수집·이용하며, 자세한 사항은 개인정보처리방침에서 정합니다.',
  },
  {
    title: '제11조 (회사의 의무)',
    body: '회사는 법령과 본 약관이 금지하는 행위를 하지 않으며, 계속적이고 안정적으로 재화를 공급하는 데 최선을 다합니다. 회사는 이용자가 제기한 의견이나 불만이 정당하다고 인정될 경우 이를 신속히 처리합니다.',
  },
  {
    title: '제12조 (분쟁 해결)',
    body: '회사는 이용자가 제기하는 정당한 의견이나 불만을 반영하고 그 피해를 보상 처리하기 위해 노력합니다. 회사와 이용자 간에 발생한 분쟁에 관한 소송은 관련 법령이 정하는 절차에 따릅니다.',
  },
];

export default function TermsPage() {
  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[720px]">
        <p className="border border-stone px-4 py-3 text-[12px] leading-relaxed text-muted">
          본 문서는 초안이며 운영 전 검토가 필요합니다.
        </p>
        <p className="label-xs mt-8">TERMS</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          이용약관
        </h1>
        <p className="mt-4 text-[13px] leading-[1.9] text-muted md:text-[14px]">
          {store.business.company}가 운영하는 {store.name}의 서비스 이용에 관한 사항을
          정합니다.
        </p>
      </header>

      <div className="mt-14 flex max-w-[860px] flex-col gap-12">
        {articles.map((article) => (
          <section key={article.title}>
            <h2 className="border-t border-stone pt-6 font-serif text-[18px] text-ink md:text-[20px]">
              {article.title}
            </h2>
            <p className="mt-4 text-[13px] leading-[2] text-muted md:text-[14px]">
              {article.body}
            </p>
          </section>
        ))}

        <section>
          <h2 className="border-t border-stone pt-6 font-serif text-[18px] text-ink md:text-[20px]">
            부칙
          </h2>
          <p className="mt-4 text-[13px] leading-[2] text-muted md:text-[14px]">
            본 약관은 게시한 날부터 시행합니다. 사업자 정보는 아래와 같습니다.
            <br />
            상호 {store.business.company} · 대표자 {store.business.ceo} · 사업자등록번호{' '}
            {store.business.regNumber} · 통신판매업신고번호 {store.business.mailOrder}
            <br />
            주소 {store.business.address} · 고객센터 {store.business.phone}
          </p>
        </section>
      </div>
    </div>
  );
}
