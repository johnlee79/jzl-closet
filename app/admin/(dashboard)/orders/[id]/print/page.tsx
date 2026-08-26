import Link from 'next/link';
import { notFound } from 'next/navigation';
import PrintButton from '@/components/admin/PrintButton';
import { courierName } from '@/lib/couriers';
import { statusLabel } from '@/lib/order-status';
import { getOrderById } from '@/lib/orders';
import { formatPrice } from '@/lib/product-utils';
import { getCachedStore } from '@/lib/settings';
import { paymentMethodLabel } from '@/lib/site-config';

/**
 * 주문서 인쇄용 화면.
 * 사이드바와 버튼은 print:hidden 으로 숨기고 본문만 인쇄됩니다.
 * (사이드바 숨김 규칙은 components/admin/AdminShell.tsx 에 있습니다)
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '주문서 인쇄' };

export default async function OrderPrintPage({ params }: { params: { id: string } }) {
  const [order, store] = await Promise.all([getOrderById(params.id), getCachedStore()]);
  if (!order) notFound();

  const liveItems = order.items.filter((item) => item.itemStatus === 'normal');

  return (
    <div className="mx-auto w-full max-w-[800px]">
      <div className="mb-5 flex flex-wrap gap-2 print:hidden">
        <PrintButton />
        <Link href={`/admin/orders/${order.id}`} className="admin-btn" prefetch={false}>
          주문 상세로 돌아가기
        </Link>
      </div>

      <article className="rounded-lg border border-slate-300 bg-white p-8 text-[15px] leading-relaxed text-slate-900 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-[20px] font-semibold tracking-[0.2em]">{store.name}</p>
            <p className="mt-1 text-[14px] text-slate-600">거래명세 · 주문서</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[18px] font-semibold">{order.orderNo}</p>
            <p className="mt-1 text-[14px] text-slate-600">
              {order.createdAt ? new Date(order.createdAt).toLocaleString('ko-KR') : ''}
            </p>
            <p className="mt-0.5 text-[14px]">{statusLabel(order.status)}</p>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <section>
            <h2 className="border-b border-slate-300 pb-1 text-[15px] font-semibold">
              주문자
            </h2>
            <p className="mt-2">{order.ordererName}</p>
            <p>{order.ordererPhone}</p>
            {order.ordererEmail ? <p>{order.ordererEmail}</p> : null}
          </section>

          <section>
            <h2 className="border-b border-slate-300 pb-1 text-[15px] font-semibold">
              받는 분
            </h2>
            <p className="mt-2">{order.receiverName}</p>
            <p>{order.receiverPhone}</p>
            <p className="mt-1">
              ({order.postcode}) {order.address1} {order.address2}
            </p>
            {order.deliveryMemo ? (
              <p className="mt-1 text-slate-600">메모: {order.deliveryMemo}</p>
            ) : null}
          </section>
        </div>

        <table className="mt-6 w-full border-collapse text-[15px]">
          <thead>
            <tr className="border-y border-slate-300 text-left">
              <th scope="col" className="py-2 font-medium">상품</th>
              <th scope="col" className="py-2 font-medium">옵션</th>
              <th scope="col" className="py-2 text-right font-medium">단가</th>
              <th scope="col" className="py-2 text-right font-medium">수량</th>
              <th scope="col" className="py-2 text-right font-medium">금액</th>
            </tr>
          </thead>
          <tbody>
            {liveItems.map((item) => (
              <tr key={item.id} className="border-b border-slate-200">
                <td className="py-2">{item.productName}</td>
                <td className="py-2 text-slate-600">{item.optionKey || '—'}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatPrice(item.unitPrice)}
                </td>
                <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatPrice(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 flex w-full max-w-[280px] flex-col gap-1">
          <div className="flex justify-between">
            <dt>상품 합계</dt>
            <dd className="tabular-nums">{formatPrice(order.itemsTotal)}원</dd>
          </div>
          <div className="flex justify-between">
            <dt>배송비</dt>
            <dd className="tabular-nums">{formatPrice(order.shippingFee)}원</dd>
          </div>
          {order.extraShippingFee > 0 ? (
            <div className="flex justify-between">
              <dt>도서산간 추가</dt>
              <dd className="tabular-nums">{formatPrice(order.extraShippingFee)}원</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-slate-900 pt-1 text-[17px] font-semibold">
            <dt>합계</dt>
            <dd className="tabular-nums">{formatPrice(order.totalAmount)}원</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-slate-300 pt-4 text-[14px] text-slate-600">
          <p>
            결제수단{' '}
            {paymentMethodLabel(order.paymentMethod)}
            {order.depositorName ? ` · 입금자명 ${order.depositorName}` : ''}
          </p>
          {order.trackingNo ? (
            <p className="mt-1">
              배송 {courierName(order.courier)} · 송장 {order.trackingNo}
            </p>
          ) : null}
          {order.cashReceiptType !== 'none' ? (
            <p className="mt-1">
              현금영수증{' '}
              {order.cashReceiptType === 'personal' ? '소득공제' : '지출증빙'} ·{' '}
              {order.cashReceiptNo}
            </p>
          ) : null}
          <p className="mt-3">
            {store.business.company} · 대표 {store.business.ceo} · 사업자등록번호{' '}
            {store.business.regNumber}
          </p>
          <p>
            {store.business.address} · 고객센터 {store.phone}
          </p>
        </div>
      </article>
    </div>
  );
}
