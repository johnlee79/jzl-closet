import type { Metadata } from 'next';
import { store } from '@/lib/store';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: `${store.name} 개인정보처리방침입니다. 수집 항목과 이용 목적, 보유 기간, 이용자의 권리와 문의처를 안내합니다.`,
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: `개인정보처리방침 | ${store.name}`,
    description: '개인정보 수집 항목과 이용 목적, 보유 기간을 안내합니다.',
    url: '/privacy',
  },
};

const sections = [
  {
    title: '1. 개인정보의 수집 항목 및 방법',
    body: `${store.business.company}(이하 "회사")는 주문 문의 접수와 배송을 위해 필요한 최소한의 정보를 수집합니다. 수집 항목은 주문자 성함, 연락처, 배송지 주소, 주문 요청 사항이며, 이용자가 전화 또는 문자로 주문 내역을 전달하는 과정에서 수집됩니다. 본 사이트는 회원가입 기능을 제공하지 않으며 별도의 계정 정보를 저장하지 않습니다.`,
  },
  {
    title: '2. 개인정보의 이용 목적',
    body: '수집한 개인정보는 주문 접수 확인, 재고 및 배송 일정 안내, 상품 배송, 교환·반품 처리, 고객 문의 응대의 목적으로만 이용합니다. 명시한 목적 외의 용도로는 이용하지 않으며, 목적이 변경될 경우 사전에 동의를 받습니다.',
  },
  {
    title: '3. 개인정보의 보유 및 이용 기간',
    body: '회사는 이용 목적이 달성된 후 지체 없이 해당 정보를 파기합니다. 다만 전자상거래 등에서의 소비자보호에 관한 법률 등 관계 법령에 따라 계약 및 청약철회 등에 관한 기록은 5년, 대금 결제 및 재화 등의 공급에 관한 기록은 5년, 소비자의 불만 또는 분쟁 처리에 관한 기록은 3년간 보관합니다.',
  },
  {
    title: '4. 개인정보의 제3자 제공',
    body: '회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 상품 배송을 위해 배송업체에 수령인 성함, 연락처, 주소에 한하여 전달하며, 법령에 따라 수사기관의 적법한 요구가 있는 경우에는 예외로 합니다.',
  },
  {
    title: '5. 개인정보 처리의 위탁',
    body: '회사는 배송 업무를 배송업체에 위탁하고 있으며, 위탁 계약 시 개인정보가 안전하게 관리될 수 있도록 필요한 사항을 규정합니다. 위탁 업체가 변경될 경우 본 방침을 통해 공개합니다.',
  },
  {
    title: '6. 이용자의 권리와 행사 방법',
    body: '이용자는 언제든지 자신의 개인정보에 대한 열람, 정정, 삭제, 처리 정지를 요구할 수 있습니다. 고객센터로 연락 주시면 본인 확인 절차를 거쳐 지체 없이 처리해 드립니다.',
  },
  {
    title: '7. 브라우저 저장소 이용에 관한 안내',
    body: '본 사이트는 장바구니 기능을 위해 이용자 브라우저의 로컬 스토리지에 담은 상품 정보를 저장합니다. 이 정보는 이용자의 기기에만 저장되며 회사 서버로 전송되지 않습니다. 브라우저 설정에서 저장된 데이터를 삭제하시면 장바구니 내역도 함께 삭제됩니다.',
  },
  {
    title: '8. 개인정보의 안전성 확보 조치',
    body: '회사는 개인정보를 취급하는 인원을 최소한으로 제한하고, 수집한 정보를 업무 목적 외로 열람하지 않도록 관리합니다. 종이로 출력된 주문 정보는 이용 목적 달성 후 파쇄하여 폐기합니다.',
  },
  {
    title: '9. 개인정보 보호책임자',
    body: `개인정보와 관련한 문의는 아래로 연락 주시기 바랍니다.\n개인정보 보호책임자: ${store.business.ceo}\n연락처: ${store.business.phone}\n주소: ${store.business.address}`,
  },
  {
    title: '10. 방침의 변경',
    body: '본 방침의 내용에 추가, 삭제 또는 수정이 있을 경우 시행 7일 전부터 사이트를 통해 공지합니다.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[720px]">
        <p className="border border-stone px-4 py-3 text-[13px] leading-relaxed text-muted">
          본 문서는 초안이며 운영 전 검토가 필요합니다.
        </p>
        <p className="label-xs mt-8">PRIVACY</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          개인정보처리방침
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          {store.name}은 이용자의 개인정보를 소중히 다루며, 관련 법령에 따라 아래와 같이
          처리합니다.
        </p>
      </header>

      <div className="mt-14 flex max-w-[860px] flex-col gap-12">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="border-t border-stone pt-6 font-serif text-[18px] text-ink md:text-[20px]">
              {section.title}
            </h2>
            <p className="mt-4 whitespace-pre-line text-[16px] leading-[2] text-ink md:text-[17px]">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
