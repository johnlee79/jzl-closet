import { notFound } from 'next/navigation';
import InquiryDetailView from '@/components/InquiryDetailView';
import { getActiveMember } from '@/lib/auth';
import { getInquiryOfUser } from '@/lib/inquiries';

export const metadata = { title: '문의 상세' };

export default async function MypageInquiryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const member = await getActiveMember();
  if (!member) return null;

  // ★ 본인 문의가 아니면 404 입니다.
  const inquiry = await getInquiryOfUser(member.user.id, params.id);
  if (!inquiry) notFound();

  return <InquiryDetailView inquiry={inquiry} backHref="/mypage/inquiries" />;
}
