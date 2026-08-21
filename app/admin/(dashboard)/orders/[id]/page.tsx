import { notFound } from 'next/navigation';
import OrderDetail from '@/components/admin/OrderDetail';
import { getOrderById } from '@/lib/orders';
import { getPaymentLogs } from '@/lib/payment-logs';

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

  /*
   * ★ 승인 조회 이력을 함께 읽습니다. (4-B)
   *   승인확인실패·검토필요 주문은 사람이 KSNET 거래내역과 대조해야 합니다.
   *   "언제 물어봤고 뭐라고 답했는지" 가 그 대조의 출발점입니다.
   */
  const logs = await getPaymentLogs(order.orderNo, 20);

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <OrderDetail order={order} paymentLogs={logs} />
    </div>
  );
}
