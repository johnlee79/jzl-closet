import { notFound } from 'next/navigation';
import OrderDetail from '@/components/admin/OrderDetail';
import { getOrderById } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const order = await getOrderById(params.id);
  return { title: order ? `주문 ${order.orderNo}` : '주문 상세' };
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const order = await getOrderById(params.id);
  if (!order) notFound();

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <OrderDetail order={order} />
    </div>
  );
}
