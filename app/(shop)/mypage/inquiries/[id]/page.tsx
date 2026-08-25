import { notFound } from 'next/navigation';
import InquiryDetailView from '@/components/InquiryDetailView';
import { requireMember } from '@/lib/auth';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';
import { getInquiryOfUser } from '@/lib/inquiries';

export const metadata = { title: '문의 상세' };

export default async function MypageInquiryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  /*
   * ★ 비로그인이면 로그인 화면으로 보냅니다. (로그인 뒤 여기로 돌아옵니다)
   *   로그인은 했지만 쇼핑몰 회원이 아니면 안내 화면을 그립니다.
   *   예전에는 둘 다 null 이라 본문이 통째로 빈 화면이 나왔습니다.
   */
  const member = await requireMember('/mypage/inquiries');
  if (!member) return <MemberOnlyNotice />;

  // ★ 본인 문의가 아니면 404 입니다.
  const inquiry = await getInquiryOfUser(member.user.id, params.id);
  if (!inquiry) notFound();

  return <InquiryDetailView inquiry={inquiry} backHref="/mypage/inquiries" />;
}
