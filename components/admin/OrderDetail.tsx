'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  acceptCancelAction,
  cancelItemAction,
  completeCancelAction,
  confirmPaymentAction,
  type ShortageLine,
  setAutoCancelExcludedAction,
  setCashReceiptIssuedAction,
  setMemoAction,
  setTrackingAction,
  updateAddressAction,
  updateStatusAction,
} from '@/app/admin/order-actions';
import CopyValue from '@/components/admin/CopyValue';
import type { PaymentLog } from '@/lib/payment-logs';
import { COURIERS, courierName, trackingUrl } from '@/lib/couriers';
import {
  ORDER_STATUSES,
  ORDER_STATUS_META,
  canEditAddress,
  statusBadgeClass,
  statusLabel,
} from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import { paymentMethodDetail } from '@/lib/site-config';
import type { Order } from '@/lib/types';

type Message = { tone: 'ok' | 'error'; text: string } | null;

function formatDateTime(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('ko-KR');
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2 text-[16px]">
      <dt className="w-[104px] shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-900">{children}</dd>
    </div>
  );
}

export default function OrderDetail({
  order,
  paymentLogs = [],
}: {
  order: Order;
  /** 승인 조회 이력 (4-B) — KSNET 거래내역과 대조할 때 씁니다 */
  paymentLogs?: PaymentLog[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  /**
   * 결제완료로 확정했는데 재고가 모자랐던 내역. (4-B)
   * ★ 막지 않고 진행하므로, 화면에 남겨 두지 않으면 아무도 모르고 지나갑니다.
   *   토스트처럼 사라지게 하지 않고 자리에 남깁니다.
   */
  const [shortages, setShortages] = useState<ShortageLine[]>([]);

  const [status, setStatus] = useState(order.status);
  const [statusMemo, setStatusMemo] = useState('');
  const [courier, setCourier] = useState(order.courier);
  const [trackingNo, setTrackingNo] = useState(order.trackingNo);
  const [memo, setMemo] = useState(order.adminMemo);
  /*
   * ★ 저장된 송장을 봅니다. 입력칸에 방금 친 값이 아닙니다.
   *   치기만 하고 [송장 저장] 을 누르지 않은 상태에서 배송중을 고를 수 있게 하면
   *   상태만 바뀌고 송장은 저장되지 않은 주문이 생깁니다.
   */
  const hasTracking = Boolean(order.trackingNo.trim());
  /** 자동취소 제외 — 공급처에 발송 요청이 나간 주문을 잠급니다. */
  const [autoCancelExcluded, setAutoCancelExcluded] = useState(order.autoCancelExcluded);
  /** 취소 처리 메모 — 대행사 접수번호 등을 남깁니다. (4-A) */
  const [cancelMemo, setCancelMemo] = useState(order.cancelMemo);
  /** 현금영수증 발급 완료 표시 (4-A) */
  const [receiptIssued, setReceiptIssued] = useState(order.cashReceiptIssued);

  const [addressOpen, setAddressOpen] = useState(false);
  const [address, setAddress] = useState({
    receiverName: order.receiverName,
    receiverPhone: order.receiverPhone,
    postcode: order.postcode,
    address1: order.address1,
    address2: order.address2,
    deliveryMemo: order.deliveryMemo,
  });

  const editable = canEditAddress(order.status);
  /** 무통장입금인지 — 입금자명·현금영수증은 이때만 보여 줍니다. (4-A) */
  const isBank = order.paymentMethod === 'bank_transfer';
  /** 취소 요청을 접수했지만 아직 환불하지 않은 상태 (4-A) */
  const cancelPending = order.status === 'cancel_requested';
  /**
   * 사람이 확인해야 하는 주문인지. (4-B)
   * ★ 승인확인실패 = "모름", 검토필요 = "승인은 났는데 값이 안 맞음".
   *   둘 다 자동으로 결론 내지 않고 사람에게 넘긴 상태입니다.
   */
  const needsCheck = order.status === 'payment_unconfirmed' || order.status === 'payment_review';
  const liveItems = order.items.filter((item) => item.itemStatus === 'normal');
  const tracking = trackingUrl(order.courier, order.trackingNo);

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    okText: string
  ) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? '처리하지 못했습니다.' });
        return;
      }
      setMessage({ tone: 'ok', text: okText });
      router.refresh();
    });
  };

  /**
   * 결제완료·결제실패 확정.
   * ★ run() 을 쓰지 않는 이유 — 그 도우미는 성공하면 메시지만 띄우고 끝납니다.
   *   여기서는 돌려받은 재고 부족 내역을 화면에 남겨야 합니다.
   */
  const confirmPayment = (decision: 'paid' | 'failed', okText: string) => {
    setMessage(null);
    setShortages([]);
    startTransition(async () => {
      const result = await confirmPaymentAction(order.id, decision);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? '처리하지 못했습니다.' });
        return;
      }
      const found = result.data?.shortages ?? [];
      setShortages(found);
      setMessage({
        tone: found.length > 0 ? 'error' : 'ok',
        text:
          found.length > 0
            ? `${okText} 다만 재고가 모자랍니다. 아래를 확인해 주세요.`
            : okText,
      });
      router.refresh();
    });
  };

  const cancelItem = (itemId: string, name: string) => {
    if (!window.confirm(`"${name}" 을(를) 취소 처리할까요? 재고가 되돌아갑니다.`)) return;
    run(() => cancelItemAction(order.id, itemId), '부분 취소를 처리했습니다.');
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── 머리 ──────────────────────────────────────── */}
      <div className="admin-card flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-[24px] font-semibold text-slate-900">
              {order.orderNo}
            </h1>
            <span className={`admin-badge ${statusBadgeClass(order.status)}`}>
              {statusLabel(order.status)}
            </span>
          </div>
          <p className="mt-1 text-[15px] text-slate-500">
            {formatDateTime(order.createdAt)} 접수
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/orders/${order.id}/print`} className="admin-btn">
            주문서 인쇄
          </Link>
          <Link href="/admin/orders" className="admin-btn">
            목록으로
          </Link>
        </div>
      </div>

      {message ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[16px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          {/* ── 상품 목록 ──────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">
              주문 상품 {liveItems.length}건
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[16px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[15px] text-slate-600">
                    <th scope="col" className="px-3 py-2 font-medium">상품</th>
                    <th scope="col" className="px-3 py-2 font-medium">옵션</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">단가</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">수량</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">합계</th>
                    <th scope="col" className="px-3 py-2 font-medium">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => {
                    const cancelled = item.itemStatus === 'cancelled';
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-100 last:border-b-0 ${
                          cancelled ? 'bg-red-50/40 text-slate-400 line-through' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/products/${item.productSlug}`}
                            target="_blank"
                            className={cancelled ? '' : 'text-blue-700 hover:underline'}
                          >
                            {item.productName}
                          </Link>
                          {item.brandLabel ? (
                            <span className="block text-[14px] text-slate-500">
                              {item.brandLabel}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {item.optionKey || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {formatPrice(item.unitPrice)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                          {formatPrice(item.lineTotal)}
                        </td>
                        <td className="px-3 py-2.5">
                          {cancelled ? (
                            <span className="text-[15px] text-red-600">취소됨</span>
                          ) : (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => cancelItem(item.id, item.productName)}
                              className="admin-btn-danger"
                            >
                              부분 취소
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <dl className="mt-4 ml-auto flex w-full max-w-[320px] flex-col gap-2 border-t border-slate-200 pt-4 text-[16px]">
              <div className="flex justify-between">
                <dt className="text-slate-500">상품 합계</dt>
                <dd className="tabular-nums text-slate-900">
                  {formatPrice(order.itemsTotal)}원
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">배송비</dt>
                <dd className="tabular-nums text-slate-900">
                  {formatPrice(order.shippingFee)}원
                </dd>
              </div>
              {order.extraShippingFee > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-slate-500">도서산간 추가</dt>
                  <dd className="tabular-nums text-slate-900">
                    {formatPrice(order.extraShippingFee)}원
                  </dd>
                </div>
              ) : null}
              {order.discount > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-slate-500">할인</dt>
                  <dd className="tabular-nums text-slate-900">
                    − {formatPrice(order.discount)}원
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-[18px] font-semibold">
                <dt>결제금액</dt>
                <dd className="tabular-nums">{formatPrice(order.totalAmount)}원</dd>
              </div>
            </dl>

            <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
              부분 취소를 하면 총액을 다시 계산하고 재고를 되돌립니다. 실제 환불(계좌
              이체)은 직접 처리해 주세요.
            </p>
          </section>

          {/* ── 주문자 · 배송지 · 결제 ─────────────────── */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="admin-card p-4 md:p-5">
              <h2 className="text-[18px] font-semibold text-slate-900">주문자</h2>
              <dl className="mt-3 divide-y divide-slate-100">
                <Row label="이름">{order.ordererName}</Row>
                <Row label="연락처">
                  <a href={`tel:${order.ordererPhone}`} className="text-blue-700">
                    {order.ordererPhone}
                  </a>
                </Row>
                <Row label="이메일">{order.ordererEmail || '—'}</Row>
              </dl>
            </section>

            <section className="admin-card p-4 md:p-5">
              <h2 className="text-[18px] font-semibold text-slate-900">결제</h2>
              <dl className="mt-3 divide-y divide-slate-100">
                {/* ★ 카드사명까지 — 정산·분쟁 때 어느 카드사인지 바로 알아야 합니다. */}
                <Row label="수단">
                  {paymentMethodDetail(order.paymentMethod, order.pgMessage)}
                </Row>
                {isBank ? <Row label="입금자명">{order.depositorName || '—'}</Row> : null}
                <Row label="결제 확인">
                  {order.paidAt ? formatDateTime(order.paidAt) : '아직 확인 전'}
                </Row>
                {order.pgAmount !== null ? (
                  <Row label="승인 금액">
                    <span
                      className={
                        order.pgAmount === order.totalAmount
                          ? 'tabular-nums'
                          : 'font-semibold tabular-nums text-red-700'
                      }
                    >
                      {formatPrice(order.pgAmount)}원
                      {order.pgAmount === order.totalAmount ? '' : ' — 주문 금액과 다릅니다'}
                    </span>
                  </Row>
                ) : null}
                {order.pgTradeAt ? (
                  <Row label="거래일시">
                    <span className="font-mono tabular-nums">{order.pgTradeAt}</span>
                  </Row>
                ) : null}
                {order.pgInstallment !== null ? (
                  <Row label="할부">
                    {order.pgInstallment === 0 ? '일시불' : `${order.pgInstallment}개월`}
                  </Row>
                ) : null}
                {order.pgIssuerCode || order.pgAcquirerCode ? (
                  <Row label="발급·매입">
                    {order.pgIssuerCode || '—'} / {order.pgAcquirerCode || '—'}
                  </Row>
                ) : null}
                {order.pgMessage ? (
                  <Row label="응답 메시지">
                    {order.pgMessage}
                    {order.pgResultCode ? ` (${order.pgResultCode})` : ''}
                  </Row>
                ) : null}
              </dl>

              {/*
                ★ KSNET 거래번호 · 승인번호 · 결제 Key (4-A)
                  취소를 대행사에 요청할 때 반드시 필요한 값입니다.
                  취소요청 상태에서는 크게 보여 줍니다. 눈으로 옮겨 적다 틀리면
                  접수가 며칠 밀립니다. 그래서 복사 버튼을 둡니다.

                ★★ 결제 Key 를 여기로 올렸습니다. (2026-08-25)
                  전에는 "확인 필요"(승인확인실패·검토필요) 상자 안에만 있어서,
                  결제가 잘 끝난 주문에서는 아예 보이지 않았습니다.
                  결제가 잘 된 주문일수록 근거를 볼 수 없는 셈이었습니다.

                  이 값이 필요한 자리는 문제가 난 뒤만이 아닙니다.
                    · 무슨 일이 생겼을 때 "결제 Key 가 남아 있는지" 를 가장 먼저 봅니다.
                      없으면 결제창이 우리 서버로 돌아오지 않았다는 뜻입니다.
                    · 결제완료 주문이라도 KSNET 에 문의할 일이 생깁니다.
                      승인 재조회는 이 값으로만 됩니다. 주문번호로는 못 묻습니다.

                ★ 값이 비어 있으면 그 줄만 빠집니다. 빈칸을 보여 주지 않습니다.
                ★ 승인 조회 이력은 지금처럼 "확인 필요" 에만 둡니다.
                  그건 대조하는 동안에만 쓰는 것이라 평소에는 자리만 차지합니다.
              */}
              {order.pgTid || order.pgAuthNo || order.pgCommConId ? (
                <div
                  className={`mt-4 flex flex-col gap-3 rounded-md p-3 ${
                    cancelPending ? 'bg-amber-50' : 'bg-slate-50'
                  }`}
                >
                  {cancelPending ? (
                    <p className="text-[15px] font-medium leading-relaxed text-amber-900">
                      취소 접수 중입니다. 아래 번호를 대행사에 알려 주세요.
                    </p>
                  ) : null}
                  {order.pgTid ? (
                    <CopyValue
                      label="KSNET 거래번호 (trno)"
                      value={order.pgTid}
                      large={cancelPending}
                    />
                  ) : null}
                  {order.pgAuthNo ? (
                    <CopyValue label="승인번호" value={order.pgAuthNo} large={cancelPending} />
                  ) : null}
                  {order.pgCommConId ? (
                    <CopyValue label="결제 Key (reCommConId)" value={order.pgCommConId} />
                  ) : null}
                </div>
              ) : null}

              {/*
                ★★ 사람이 확인해야 하는 주문 (4-B)
                  승인확인실패·검토필요는 "돈이 오갔는지 우리가 모르는" 상태입니다.
                  KSNET 거래내역(ksta.ksnet.co.kr)과 직접 대조해야 하고,
                  그러려면 결제 Key·거래번호·조회 이력이 한자리에 있어야 합니다.
              */}
              {needsCheck ? (
                <div className="mt-4 rounded-md bg-amber-50 p-3">
                  <p className="text-[15px] font-medium leading-relaxed text-amber-900">
                    사람이 확인해야 하는 주문입니다.
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed text-amber-900">
                    {order.status === 'payment_review'
                      ? '승인은 났는데 금액이나 주문번호가 우리 기록과 다릅니다. 자동으로 완료 처리하지 않았습니다.'
                      : '승인 여부를 확인하지 못했습니다. 결제되지 않았다고 단정할 수 없습니다.'}
                  </p>

                  {/*
                    ★ 결제 Key·거래번호는 바로 위 상자로 옮겼습니다. (2026-08-25)
                      이제 결제완료 주문에서도 보이므로 여기서 또 보여 줄 이유가 없습니다.
                      같은 값을 한 화면에 두 번 두면 어느 쪽이 맞는지 헷갈립니다.
                      대조할 때 필요한 주문번호만 남깁니다.
                  */}
                  <div className="mt-3 flex flex-col gap-3">
                    <CopyValue label="주문번호" value={order.orderNo} />
                    <p className="text-[14px] leading-relaxed text-amber-900">
                      결제 Key와 거래번호는 위 결제 정보 상자에 있습니다.
                    </p>
                  </div>

                  {/* ── 조회 이력 ── */}
                  <div className="mt-4">
                    <span className="admin-label">승인 조회 이력</span>
                    {paymentLogs.length === 0 ? (
                      <p className="text-[15px] text-slate-600">기록이 없습니다.</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {paymentLogs.map((log) => (
                          <li
                            key={log.id}
                            className="flex flex-wrap gap-x-3 text-[14px] leading-relaxed text-slate-700"
                          >
                            <span className="tabular-nums text-slate-500">
                              {formatDateTime(log.createdAt)}
                            </span>
                            <span className="font-medium">{log.kind}</span>
                            {log.authyn ? <span>승인 {log.authyn}</span> : null}
                            {log.trno ? <span>trno {log.trno}</span> : null}
                            {log.note ? <span className="text-slate-500">{log.note}</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* ── 확정 ── */}
                  <div className="mt-4 border-t border-amber-200 pt-3">
                    <p className="text-[14px] leading-relaxed text-amber-900">
                      ★ KSNET 거래내역에서 확인한 뒤 눌러 주세요. 이 버튼은 우리 기록만
                      바꿉니다. 실제 승인·취소는 일어나지 않습니다.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              '승인이 확인되었습니까?\n\n결제완료로 바꿉니다. 재고는 그대로 잡아 둡니다.'
                            )
                          ) {
                            return;
                          }
                          confirmPayment('paid', '결제완료로 확정했습니다.');
                        }}
                        className="admin-btn-primary"
                      >
                        결제완료로 확정
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              '결제되지 않은 것이 확인되었습니까?\n\n결제실패로 바꿉니다. 재고가 아직 안 돌아왔으면 지금 되돌립니다.'
                            )
                          ) {
                            return;
                          }
                          confirmPayment('failed', '결제실패로 확정했습니다.');
                        }}
                        className="admin-btn"
                      >
                        결제실패로 확정
                      </button>
                    </div>
                    {order.stockReleasedAt ? (
                      <p className="mt-2 text-[14px] text-slate-600">
                        재고는 이미 되돌렸습니다 ({formatDateTime(order.stockReleasedAt)})
                      </p>
                    ) : (
                      <p className="mt-2 text-[14px] text-slate-600">재고는 아직 잡아 둔 상태입니다.</p>
                    )}

                    {/*
                      ★★ 재고가 모자랐다면 자리에 남깁니다.
                        막지 않고 진행했기 때문에, 여기서 안 보여 주면 아무도 모릅니다.
                        보낼 물건이 없는 주문을 준비 중으로 넘기게 됩니다.
                    */}
                    {shortages.length > 0 ? (
                      <div
                        role="alert"
                        className="mt-3 rounded-md border border-red-200 bg-red-50 p-3"
                      >
                        <p className="text-[15px] font-semibold text-red-800">
                          재고가 모자랍니다 — 결제완료 처리는 그대로 진행했습니다
                        </p>
                        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed text-red-800">
                          {shortages.map((x) => (
                            <li key={`${x.productName}-${x.optionKey}`}>
                              <strong>{x.productName}</strong>
                              {x.optionKey ? ` (${x.optionKey})` : ''} — {x.wanted}개 필요,{' '}
                              <strong className="tabular-nums">{x.available}개</strong>만 있었습니다
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-[14px] leading-relaxed text-red-800">
                          자동정리가 재고를 되돌린 사이에 그 물건이 팔린 것으로 보입니다.
                          손님 돈은 이미 승인된 상태라 주문을 되돌릴 수 없습니다.
                          공급처에 확보가 되는지 먼저 확인해 주세요. 같은 내용을 텔레그램으로도
                          보냈습니다.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* ── 현금영수증 (무통장입금만) ─────────────── */}
              {isBank ? (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <span className="admin-label">현금영수증</span>
                  {order.cashReceiptType === 'none' ? (
                    <p className="text-[16px] text-slate-500">신청 안 함</p>
                  ) : (
                    <>
                      <div className="mt-1">
                        <CopyValue
                          label={
                            order.cashReceiptType === 'personal'
                              ? '소득공제 · 휴대폰번호'
                              : '지출증빙 · 사업자번호'
                          }
                          value={order.cashReceiptNo}
                        />
                      </div>

                      <label className="mt-3 flex cursor-pointer items-start gap-2 text-[16px] text-slate-800">
                        <input
                          type="checkbox"
                          checked={receiptIssued}
                          disabled={pending}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setReceiptIssued(next);
                            run(
                              () => setCashReceiptIssuedAction(order.id, next),
                              next
                                ? '현금영수증 발급 완료로 표시했습니다.'
                                : '발급 완료 표시를 해제했습니다.'
                            );
                          }}
                          className="mt-0.5 h-4 w-4"
                        />
                        <span>
                          홈택스에서 발급을 마쳤습니다
                          {order.cashReceiptIssuedAt ? (
                            <span className="mt-0.5 block text-[14px] text-slate-500">
                              {formatDateTime(order.cashReceiptIssuedAt)} 표시
                            </span>
                          ) : null}
                        </span>
                      </label>

                      <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-600">
                        현금영수증은 PG 에서 자동 발급되지 않습니다. 입금 확인 후 홈택스에서
                        위 정보로 직접 발급한 뒤 체크해 주세요.
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </section>
          </div>

          {/* ── 배송지 ─────────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[18px] font-semibold text-slate-900">배송지</h2>
              {editable ? (
                <button
                  type="button"
                  onClick={() => setAddressOpen((prev) => !prev)}
                  className="admin-btn"
                >
                  {addressOpen ? '닫기' : '배송지 수정'}
                </button>
              ) : (
                <span className="text-[14px] text-slate-500">
                  출고 후에는 수정할 수 없습니다
                </span>
              )}
            </div>

            {addressOpen ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  run(
                    () => updateAddressAction(order.id, address),
                    '배송지를 수정했습니다.'
                  );
                  setAddressOpen(false);
                }}
                className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
              >
                <div>
                  <label className="admin-label" htmlFor="addr-name">받는 분</label>
                  <input
                    id="addr-name"
                    type="text"
                    value={address.receiverName}
                    onChange={(event) =>
                      setAddress((prev) => ({ ...prev, receiverName: event.target.value }))
                    }
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label" htmlFor="addr-phone">연락처</label>
                  <input
                    id="addr-phone"
                    type="tel"
                    value={address.receiverPhone}
                    onChange={(event) =>
                      setAddress((prev) => ({ ...prev, receiverPhone: event.target.value }))
                    }
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label" htmlFor="addr-post">우편번호</label>
                  <input
                    id="addr-post"
                    type="text"
                    value={address.postcode}
                    onChange={(event) =>
                      setAddress((prev) => ({ ...prev, postcode: event.target.value }))
                    }
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label" htmlFor="addr-2">상세주소</label>
                  <input
                    id="addr-2"
                    type="text"
                    value={address.address2}
                    onChange={(event) =>
                      setAddress((prev) => ({ ...prev, address2: event.target.value }))
                    }
                    className="admin-input"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="admin-label" htmlFor="addr-1">주소</label>
                  <input
                    id="addr-1"
                    type="text"
                    value={address.address1}
                    onChange={(event) =>
                      setAddress((prev) => ({ ...prev, address1: event.target.value }))
                    }
                    className="admin-input"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="admin-label" htmlFor="addr-memo">배송 메모</label>
                  <input
                    id="addr-memo"
                    type="text"
                    value={address.deliveryMemo}
                    onChange={(event) =>
                      setAddress((prev) => ({ ...prev, deliveryMemo: event.target.value }))
                    }
                    className="admin-input"
                  />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" disabled={pending} className="admin-btn-primary">
                    {pending ? '저장 중…' : '배송지 저장'}
                  </button>
                </div>
              </form>
            ) : (
              <dl className="mt-3 divide-y divide-slate-100">
                <Row label="받는 분">
                  {order.receiverName} · {order.receiverPhone}
                </Row>
                <Row label="주소">
                  ({order.postcode}) {order.address1} {order.address2}
                </Row>
                <Row label="배송 메모">{order.deliveryMemo || '—'}</Row>
              </dl>
            )}
          </section>

          {/* ── 상태 이력 ──────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">처리 이력</h2>
            {order.history.length === 0 ? (
              <p className="mt-3 text-[15px] text-slate-500">기록이 없습니다.</p>
            ) : (
              <ol className="mt-4 flex flex-col gap-4 border-l-2 border-slate-200 pl-5">
                {order.history.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-300"
                    />
                    <p className="text-[16px] text-slate-900">
                      {entry.fromStatus && entry.fromStatus !== entry.toStatus ? (
                        <>
                          {statusLabel(entry.fromStatus)} →{' '}
                          <strong>{statusLabel(entry.toStatus)}</strong>
                        </>
                      ) : (
                        statusLabel(entry.toStatus)
                      )}
                    </p>
                    {entry.memo ? (
                      <p className="mt-0.5 text-[15px] leading-relaxed text-slate-600">
                        {entry.memo}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[14px] text-slate-400">
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* ── 오른쪽: 상태 · 송장 · 메모 ─────────────────── */}
        <aside className="flex flex-col gap-5">
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">상태 변경</h2>
            <div className="mt-3">
              <label className="admin-label" htmlFor="status-select">상태</label>
              <select
                id="status-select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="admin-input"
              >
                {/*
                  ★★ 송장이 없으면 배송중을 고를 수 없습니다.
                    배송중이라고 해 놓고 조회할 송장이 없으면 손님이 바로 문의합니다.
                    "배송중이라는데 어디까지 왔나요" 에 답할 수가 없습니다.
                  ★ 아래 [송장 등록] 에 번호를 넣으면 상태가 알아서 배송중으로 바뀝니다.
                    그래서 이 순서를 건너뛸 이유가 없습니다.
                  ★ 실제로 막는 것은 서버입니다. (lib/orders.ts 의 updateOrderStatus)
                    여기서는 왜 못 고르는지 미리 보여 주기만 합니다.
                */}
                {ORDER_STATUSES.map((value) => (
                  <option
                    key={value}
                    value={value}
                    disabled={value === 'shipping' && !hasTracking}
                  >
                    {ORDER_STATUS_META[value].label}
                    {value === 'shipping' && !hasTracking ? ' (송장 입력 후 가능)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <label className="admin-label" htmlFor="status-memo">메모 (선택)</label>
              <textarea
                id="status-memo"
                value={statusMemo}
                onChange={(event) => setStatusMemo(event.target.value)}
                rows={2}
                placeholder="예: 입금 확인 완료"
                className="admin-input leading-relaxed"
              />
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => updateStatusAction(order.id, status, statusMemo),
                  '상태를 바꿨습니다.'
                )
              }
              className="admin-btn-primary mt-3 w-full"
            >
              {pending ? '처리 중…' : '상태 저장'}
            </button>
            {status === 'cancelled' || status === 'returned' ? (
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                취소·반품으로 바꾸면 남아 있는 상품의 재고가 자동으로 되돌아갑니다.
              </p>
            ) : null}
          </section>

          {/* ── 취소 처리 (4-A) ─────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">취소 처리</h2>

            {/*
              ★★ 여기 버튼으로는 실제 환불이 되지 않습니다.
                KSNET 이 가맹점에 취소 권한을 주지 않습니다.
                환불은 대행사를 통해 사람이 처리하고 며칠이 걸립니다.
                이 안내를 지우면 "취소 눌렀는데 왜 돈이 안 들어오냐" 는
                분쟁이 반드시 납니다.

              ★★ 기간은 KSNET 에 확인한 값입니다. (2026-08-24 답변)
                이 상점은 즉결이라 당일 취소라도 승인취소가 아니라 언제나
                "입금 후 취소" 로 진행됩니다. 그래서 빨리 눌러도 더 빨라지지 않습니다.
                손님에게 "오늘 취소하면 바로 들어온다" 고 말하면 안 됩니다.
                손님 화면(주문 상태 안내)·약관 제9조 ④항과 같은 말을 해야 합니다.
            */}
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[14px] leading-relaxed text-amber-900">
              <strong>이 버튼으로 실제 환불이 되지 않습니다.</strong> KSNET 은 가맹점에
              취소 권한을 주지 않아, 취소는 대행사를 통해 사람이 처리합니다. 접수 →
              대행사 연락 → 환불 확인 → [취소 완료] 순서로 진행해 주세요.
            </p>
            <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-700">
              카드 취소는 <strong>대금 반환 후 카드사에서 영업일 기준 2~3일</strong>이
              걸립니다. 이 상점은 즉결이라 당일 취소라도 승인취소가 아니라 항상 입금 후
              취소로 진행되므로, 빨리 접수한다고 더 빨라지지 않습니다. 손님께는 같은
              기간으로 안내해 주세요.
            </p>

            <div className="mt-3">
              <label className="admin-label" htmlFor="cancel-memo">
                취소 메모 (대행사 접수번호 등)
              </label>
              <textarea
                id="cancel-memo"
                value={cancelMemo}
                onChange={(event) => setCancelMemo(event.target.value)}
                rows={2}
                placeholder="예: 대행사 접수 2026-08-20, 담당 홍길동"
                className="admin-input leading-relaxed"
              />
            </div>

            {order.status === 'cancelled' ? (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700">
                취소가 완료된 주문입니다.
                {order.cancelDoneAt ? ` (${formatDateTime(order.cancelDoneAt)})` : ''}
                {order.cancelMemo ? (
                  <span className="mt-1 block text-[14px] text-slate-500">
                    메모: {order.cancelMemo}
                  </span>
                ) : null}
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={pending || cancelPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        '취소 요청으로 접수할까요?\n\n실제 환불은 되지 않습니다. 재고도 아직 되돌아가지 않습니다.\n대행사에 연락해 주세요.'
                      )
                    ) {
                      return;
                    }
                    run(
                      () => acceptCancelAction(order.id, cancelMemo),
                      '취소 요청으로 접수했습니다. 대행사에 연락해 주세요.'
                    );
                  }}
                  className="admin-btn w-full"
                >
                  {cancelPending ? '이미 접수됨' : '취소 요청 접수'}
                </button>

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        '환불이 실제로 끝났습니까?\n\n[취소 완료] 를 누르면 재고와 사용 포인트가 되돌아갑니다.\n환불 전에 누르면 되돌리기 번거롭습니다.'
                      )
                    ) {
                      return;
                    }
                    run(
                      () => completeCancelAction(order.id, cancelMemo),
                      '취소 완료로 처리했습니다. 재고와 포인트를 되돌렸습니다.'
                    );
                  }}
                  className="admin-btn-danger w-full"
                >
                  취소 완료 (환불 끝남)
                </button>
              </div>
            )}

            {order.cancelRequestedAt ? (
              <p className="mt-2 text-[14px] text-slate-500">
                취소 요청 접수 {formatDateTime(order.cancelRequestedAt)}
              </p>
            ) : null}
          </section>

          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">송장 등록</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
              송장을 저장하면 상태가 자동으로 <strong>배송중</strong>으로 바뀌고, 손님의
              주문 조회 화면에 배송 조회 링크가 생깁니다.
            </p>
            <div className="mt-3">
              <label className="admin-label" htmlFor="courier">택배사</label>
              <select
                id="courier"
                value={courier}
                onChange={(event) => setCourier(event.target.value)}
                className="admin-input"
              >
                <option value="">선택하세요</option>
                {COURIERS.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <label className="admin-label" htmlFor="tracking">송장번호</label>
              <input
                id="tracking"
                type="text"
                value={trackingNo}
                onChange={(event) => setTrackingNo(event.target.value)}
                placeholder="숫자만 입력"
                className="admin-input tabular-nums"
              />
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => setTrackingAction(order.id, courier, trackingNo),
                  '송장을 저장했습니다.'
                )
              }
              className="admin-btn-primary mt-3 w-full"
            >
              {pending ? '저장 중…' : '송장 저장'}
            </button>

            {tracking ? (
              <a
                href={tracking}
                target="_blank"
                rel="noreferrer"
                className="admin-btn mt-2 w-full"
              >
                {courierName(order.courier)} 배송 조회 ↗
              </a>
            ) : null}
          </section>

          {/* ── 자동취소 제외 ───────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">미입금 자동취소</h2>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[16px] text-slate-800">
              <input
                type="checkbox"
                checked={autoCancelExcluded}
                disabled={pending}
                onChange={(event) => {
                  const next = event.target.checked;
                  setAutoCancelExcluded(next);
                  run(
                    () => setAutoCancelExcludedAction(order.id, next),
                    next
                      ? '이 주문은 자동취소되지 않습니다.'
                      : '자동취소 대상으로 되돌렸습니다.'
                  );
                }}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                이 주문은 자동취소하지 않기
                <span className="mt-1 block text-[14px] leading-relaxed text-slate-500">
                  공급처에 이미 발송 요청을 넘긴 주문에 체크하세요. 송장번호가 들어간
                  주문은 체크하지 않아도 자동으로 제외됩니다.
                </span>
              </span>
            </label>

            {order.trackingNo ? (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-600">
                송장번호가 있어 이미 자동취소 대상에서 빠져 있습니다.
              </p>
            ) : null}
          </section>

          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">관리자 메모</h2>
            <p className="mt-1 text-[14px] text-slate-500">손님에게는 보이지 않습니다.</p>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={5}
              className="admin-input mt-3 leading-relaxed"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setMemoAction(order.id, memo), '메모를 저장했습니다.')}
              className="admin-btn mt-2 w-full"
            >
              메모 저장
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
