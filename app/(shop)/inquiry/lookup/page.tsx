import type { Metadata } from 'next';
import InquiryLookup from '@/components/InquiryLookup';

/**
 * ★ 개인정보가 나오는 화면이라 검색에 잡히면 안 됩니다.
 * 조회 폼은 가운데 카드로, 조회 결과는 넓게 보여 줍니다.
 * (그래서 카드 껍데기를 페이지가 아니라 컴포넌트 안에서 씌웁니다)
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '문의 조회',
  robots: { index: false, follow: false, nocache: true },
};

export default function InquiryLookupPage() {
  return <InquiryLookup />;
}
