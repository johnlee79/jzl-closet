'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { bulkStatusAction } from '@/app/admin/order-actions';
import { courierName } from '@/lib/couriers';
import {
  ORDER_STATUSES,
  ORDER_STATUS_META,
  needsAttention,
  statusBadgeClass,
  statusLabel,
} from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import { paymentMethodLabel } from '@/lib/site-config';
import type { Order } from '@/lib/types';

type Message = { tone: 'ok' | 'error'; text: string } | null;

function itemSummary(order: Order): string {
  const live = order.items.filter((item) => item.itemStatus === 'normal');
  if (live.length === 0) return '(전체 취소)';
  const first = live[0];
  const rest = live.length - 1;
  return `${first.productName}${first.optionKey ? ` (${first.optionKey})` : ''}${
    rest > 0 ? ` 외 ${rest}건` : ''
  }`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderTable({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>('paid');
  const [message, setMessage] = useState<Message>(null);

  const allChecked = orders.length > 0 && selected.length === orders.length;

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );

  const toggleAll = () =>
    setSelected(allChecked ? [] : orders.map((order) => order.id));

  const applyBulk = () => {
    if (selected.length === 0) {
      setMessage({ tone: 'error', text: '주문을 먼저 선택해 주세요.' });
      return;
    }
    if (
      !window.confirm(
        `선택한 ${selected.length}건을 "${statusLabel(bulkStatus)}" 으로 바꿀까요?`
      )
    ) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await bulkStatusAction(selected, bulkStatus, '목록에서 일괄 변경');
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({
        tone: 'ok',
        text: `${result.data.done}건을 바꿨습니다.${
          result.data.failed > 0 ? ` (실패 ${result.data.failed}건)` : ''
        }`,
      });
      setSelected([]);
      router.refresh();
    });
  };

  /** 지금 필터를 그대로 들고 CSV 주소를 만듭니다. */
  const exportHref = (format: 'courier' | 'full'): string => {
    const query = new URLSearchParams();
    for (const key of ['status', 'q', 'from', 'to', 'receipt', 'method']) {
      const value = params.get(key);
      if (value) query.set(key, value);
    }
    query.set('format', format);
    if (selected.length > 0) query.set('ids', selected.join(','));
    return `/api/admin/export/orders?${query.toString()}`;
  };

  return (
    <div>
      {/* ── 일괄 처리 ─────────────────────────────────── */}
      <div className="admin-card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <span className="admin-label">
            선택 {selected.length}건 / 이 페이지 {orders.length}건
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value)}
              aria-label="바꿀 상태"
              className="admin-input w-[160px]"
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_META[status].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyBulk}
              disabled={pending || selected.length === 0}
              className="admin-btn-primary"
            >
              {pending ? '처리 중…' : '상태 일괄 변경'}
            </button>
          </div>
        </div>

        <div className="ml-auto">
          <span className="admin-label">
            CSV 내보내기 {selected.length > 0 ? `(선택 ${selected.length}건)` : '(현재 필터)'}
          </span>
          <div className="flex flex-wrap gap-2">
            <a href={exportHref('courier')} download className="admin-btn">
              택배사 일괄등록 양식
            </a>
            <a href={exportHref('full')} download className="admin-btn">
              전체 항목
            </a>
          </div>
        </div>
      </div>

      {message ? (
        <p
          role="status"
          className={`mb-4 rounded-md px-3 py-2 text-[14px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {/* ── 표 ────────────────────────────────────────── */}
      <div className="admin-card overflow-x-auto">
        {orders.length === 0 ? (
          <p className="px-4 py-16 text-center text-[14px] text-slate-500">
            조건에 맞는 주문이 없습니다.
          </p>
        ) : (
          <table className="w-full min-w-[1180px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[13px] text-slate-600">
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="이 페이지 전체 선택"
                    className="h-4 w-4"
                  />
                </th>
                <th scope="col" className="px-3 py-2 font-medium">주문번호</th>
                <th scope="col" className="px-3 py-2 font-medium">주문일시</th>
                <th scope="col" className="px-3 py-2 font-medium">주문자</th>
                <th scope="col" className="px-3 py-2 font-medium">상품</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">결제금액</th>
                <th scope="col" className="px-3 py-2 font-medium">결제수단</th>
                <th scope="col" className="px-3 py-2 font-medium">현금영수증</th>
                <th scope="col" className="px-3 py-2 font-medium">상태</th>
                <th scope="col" className="px-3 py-2 font-medium">송장</th>
                <th scope="col" className="px-3 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  /*
                    ★ 손봐야 하는 주문(검토필요·승인확인실패·취소요청)은 붉게 칠합니다. (4-A)
                      돈이 걸린 건이라 목록에서 그냥 지나치면 안 됩니다.
                  */
                  className={`border-b border-slate-100 last:border-b-0 ${
                    needsAttention(order.status)
                      ? 'bg-red-50/60'
                      : order.status === 'pending_payment'
                        ? 'bg-amber-50/40'
                        : ''
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.includes(order.id)}
                      onChange={() => toggle(order.id)}
                      aria-label={`${order.orderNo} 선택`}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {order.orderNo}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">
                    {order.ordererName}
                    <span className="block text-[12px] text-slate-500">
                      {order.ordererPhone}
                    </span>
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-slate-700">
                    {itemSummary(order)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                    {formatPrice(order.totalAmount)}원
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {paymentMethodLabel(order.paymentMethod)}
                    {order.paymentMethod === 'bank_transfer' && order.depositorName ? (
                      <span className="block text-[12px] text-slate-500">
                        {order.depositorName}
                      </span>
                    ) : null}
                  </td>
                  {/*
                    현금영수증 (4-A)
                    ★ 신청은 들어왔는데 아직 발급하지 않은 건을 눈에 띄게 합니다.
                      PG 가 발급해 주지 않아 운영자가 홈택스에서 직접 처리해야 합니다.
                  */}
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px]">
                    {order.cashReceiptType === 'none' ? (
                      <span className="text-slate-400">—</span>
                    ) : order.cashReceiptIssued ? (
                      <span className="admin-badge bg-green-100 text-green-800">발급완료</span>
                    ) : (
                      <span className="admin-badge bg-amber-100 text-amber-800">발급대기</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className={`admin-badge ${statusBadgeClass(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-slate-600">
                    {order.trackingNo ? (
                      <>
                        {courierName(order.courier)}
                        <span className="block text-slate-500">{order.trackingNo}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link href={`/admin/orders/${order.id}`} className="admin-btn">
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
