import { notFound } from 'next/navigation';
import InquiryDetail from '@/components/admin/InquiryDetail';
import { getInquiryById } from '@/lib/inquiries';
import { getOrderById } from '@/lib/orders';
import { getTemplates } from '@/lib/products';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const inquiry = await getInquiryById(params.id);
  return { title: inquiry ? `문의 ${inquiry.inquiryNo}` : '문의 상세' };
}

export default async function AdminInquiryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const inquiry = await getInquiryById(params.id);
  if (!inquiry) notFound();

  const [order, templates] = await Promise.all([
    inquiry.orderId ? getOrderById(inquiry.orderId) : Promise.resolve(null),
    getTemplates(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <InquiryDetail inquiry={inquiry} order={order} templates={templates} />
    </div>
  );
}
