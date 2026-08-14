import type { Metadata } from 'next';
import InquiryLookup from '@/components/InquiryLookup';

/** ★ 개인정보가 나오는 화면이라 검색에 잡히면 안 됩니다. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '문의 조회',
  robots: { index: false, follow: false, nocache: true },
};

export default function InquiryLookupPage() {
  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">INQUIRY LOOKUP</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          문의 조회
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          비회원으로 남기신 문의의 답변을 확인하실 수 있습니다.
        </p>
      </header>

      <InquiryLookup />
    </div>
  );
}
