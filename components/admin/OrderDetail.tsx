'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  cancelItemAction,
  setAutoCancelExcludedAction,
  setMemoAction,
  setTrackingAction,
  updateAddressAction,
  updateStatusAction,
} from '@/app/admin/order-actions';
import { COURIERS, courierName, trackingUrl } from '@/lib/couriers';
import {
  ORDER_STATUSES,
  ORDER_STATUS_META,
  canEditAddress,
  statusBadgeClass,
  statusLabel,
} from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import type { Order } from '@/lib/types';

type Message = { tone: 'ok' | 'error'; text: string } | null;

function formatDateTime(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('ko-KR');
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2 text-[14px]">
      <dt className="w-[104px] shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-900">{children}</dd>
    </div>
  );
}

export default function OrderDetail({ order }: { order: Order }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  const [status, setStatus] = useState(order.status);
  const [statusMemo, setStatusMemo] = useState('');
  const [courier, setCourier] = useState(order.courier);
  const [trackingNo, setTrackingNo] = useState(order.trackingNo);
  const [memo, setMemo] = useState(order.adminMemo);
  /** 자동취소 제외 — 공급처에 발송 요청이 나간 주문을 잠급니다. */
  const [autoCancelExcluded, setAutoCancelExcluded] = useState(order.autoCancelExcluded);

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
            <h1 className="font-mono text-[20px] font-semibold text-slate-900">
              {order.orderNo}
            </h1>
            <span className={`admin-badge ${statusBadgeClass(order.status)}`}>
              {statusLabel(order.status)}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
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
          className={`rounded-md px-3 py-2 text-[14px] ${
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
            <h2 className="text-[16px] font-semibold text-slate-900">
              주문 상품 {liveItems.length}건
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[13px] text-slate-600">
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
                            <span className="block text-[12px] text-slate-500">
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
                            <span className="text-[13px] text-red-600">취소됨</span>
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

            <dl className="mt-4 ml-auto flex w-full max-w-[320px] flex-col gap-2 border-t border-slate-200 pt-4 text-[14px]">
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
              <div className="flex justify-between border-t border-slate-200 pt-2 text-[16px] font-semibold">
                <dt>결제금액</dt>
                <dd className="tabular-nums">{formatPrice(order.totalAmount)}원</dd>
              </div>
            </dl>

            <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
              부분 취소를 하면 총액을 다시 계산하고 재고를 되돌립니다. 실제 환불(계좌
              이체)은 직접 처리해 주세요.
            </p>
          </section>

          {/* ── 주문자 · 배송지 · 결제 ─────────────────── */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="admin-card p-4 md:p-5">
              <h2 className="text-[16px] font-semibold text-slate-900">주문자</h2>
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
              <h2 className="text-[16px] font-semibold text-slate-900">결제</h2>
              <dl className="mt-3 divide-y divide-slate-100">
                <Row label="수단">
                  {order.paymentMethod === 'bank_transfer'
                    ? '무통장입금'
                    : order.paymentMethod}
                </Row>
                <Row label="입금자명">{order.depositorName || '—'}</Row>
                <Row label="입금 확인">
                  {order.paidAt ? formatDateTime(order.paidAt) : '아직 확인 전'}
                </Row>
                <Row label="현금영수증">
                  {order.cashReceiptType === 'none'
                    ? '신청 안 함'
                    : `${order.cashReceiptType === 'personal' ? '소득공제' : '지출증빙'} · ${order.cashReceiptNo}`}
                </Row>
                {order.pgTid ? <Row label="PG 거래번호">{order.pgTid}</Row> : null}
              </dl>
              {order.cashReceiptType !== 'none' ? (
                <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
                  현금영수증은 자동 발급되지 않습니다. 입금 확인 후 홈택스에서 위 정보로
                  직접 발급해 주세요.
                </p>
              ) : null}
            </section>
          </div>

          {/* ── 배송지 ─────────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold text-slate-900">배송지</h2>
              {editable ? (
                <button
                  type="button"
                  onClick={() => setAddressOpen((prev) => !prev)}
                  className="admin-btn"
                >
                  {addressOpen ? '닫기' : '배송지 수정'}
                </button>
              ) : (
                <span className="text-[12px] text-slate-500">
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
            <h2 className="text-[16px] font-semibold text-slate-900">처리 이력</h2>
            {order.history.length === 0 ? (
              <p className="mt-3 text-[13px] text-slate-500">기록이 없습니다.</p>
            ) : (
              <ol className="mt-4 flex flex-col gap-4 border-l-2 border-slate-200 pl-5">
                {order.history.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-300"
                    />
                    <p className="text-[14px] text-slate-900">
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
                      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
                        {entry.memo}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[12px] text-slate-400">
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
            <h2 className="text-[16px] font-semibold text-slate-900">상태 변경</h2>
            <div className="mt-3">
              <label className="admin-label" htmlFor="status-select">상태</label>
              <select
                id="status-select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="admin-input"
              >
                {ORDER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {ORDER_STATUS_META[value].label}
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
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                취소·반품으로 바꾸면 남아 있는 상품의 재고가 자동으로 되돌아갑니다.
              </p>
            ) : null}
          </section>

          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[16px] font-semibold text-slate-900">송장 등록</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
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
            <h2 className="text-[16px] font-semibold text-slate-900">미입금 자동취소</h2>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[14px] text-slate-800">
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
                <span className="mt-1 block text-[12px] leading-relaxed text-slate-500">
                  공급처에 이미 발송 요청을 넘긴 주문에 체크하세요. 송장번호가 들어간
                  주문은 체크하지 않아도 자동으로 제외됩니다.
                </span>
              </span>
            </label>

            {order.trackingNo ? (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
                송장번호가 있어 이미 자동취소 대상에서 빠져 있습니다.
              </p>
            ) : null}
          </section>

          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[16px] font-semibold text-slate-900">관리자 메모</h2>
            <p className="mt-1 text-[12px] text-slate-500">손님에게는 보이지 않습니다.</p>
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
