import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import { courierName } from '@/lib/couriers';
import { statusLabel } from '@/lib/order-status';
import { paymentMethodLabel } from '@/lib/site-config';
import { getOrders } from '@/lib/orders';
import type { Order } from '@/lib/types';

/**
 * 주문 CSV 내보내기. (관리자 > 주문 관리)
 *
 * ★ 라이브러리를 추가하지 않고 문자열로 직접 만듭니다.
 *   맨 앞에 UTF-8 BOM 을 붙여야 엑셀에서 한글이 깨지지 않습니다.
 *
 * 두 가지 양식
 *   ?format=courier (기본) — 택배사 일괄등록 양식
 *     주문번호 · 받는분 · 연락처 · 우편번호 · 주소 · 상품명 · 수량 · 배송메모
 *   ?format=full — 정산·보관용 전체 항목
 *
 * 범위
 *   ?ids=a,b,c  선택한 주문만
 *   그 밖에는 목록 화면과 같은 필터(status·q·from·to·receipt·method)를 그대로 적용합니다.
 */
export const dynamic = 'force-dynamic';

const COURIER_HEADERS = [
  '주문번호',
  '받는분',
  '연락처',
  '우편번호',
  '주소',
  '상품명',
  '수량',
  '배송메모',
];

const FULL_HEADERS = [
  '주문번호',
  '주문일시',
  '상태',
  '주문자',
  '주문자연락처',
  '이메일',
  '받는분',
  '받는분연락처',
  '우편번호',
  '주소',
  '상세주소',
  '배송메모',
  '상품명',
  '수량',
  '상품합계',
  '배송비',
  '도서산간',
  '결제금액',
  '입금자명',
  '결제수단',
  '현금영수증',
  '현금영수증발급',
  'KSNET거래번호',
  '승인번호',
  '승인금액',
  '거래일시',
  '택배사',
  '송장번호',
  '관리자메모',
];

/** CSV 한 칸. 큰따옴표·콤마·줄바꿈이 있으면 감싸고 따옴표를 두 번 씁니다. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // = + - @ 로 시작하면 엑셀이 수식으로 읽습니다. 앞에 작은따옴표를 붙여 막습니다.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /["\n,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** 살아 있는 품목만 "이름 (옵션) x수량" 형태로 잇습니다. */
function itemsSummary(order: Order): string {
  return order.items
    .filter((item) => item.itemStatus === 'normal')
    .map(
      (item) =>
        `${item.productName}${item.optionKey ? ` (${item.optionKey})` : ''} x${item.quantity}`
    )
    .join(' / ');
}

function totalQuantity(order: Order): number {
  return order.items
    .filter((item) => item.itemStatus === 'normal')
    .reduce((sum, item) => sum + item.quantity, 0);
}

function cashReceiptLabel(order: Order): string {
  if (order.cashReceiptType === 'personal') return `소득공제 ${order.cashReceiptNo}`;
  if (order.cashReceiptType === 'business') return `지출증빙 ${order.cashReceiptNo}`;
  return '';
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toISOString().slice(0, 19).replace('T', ' ');
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const format = params.get('format') === 'full' ? 'full' : 'courier';
  const idParam = (params.get('ids') ?? '').trim();
  const selected = idParam ? new Set(idParam.split(',').filter(Boolean)) : null;

  // 선택 항목이 없으면 현재 필터 결과를 그대로 내보냅니다.
  const receiptParam = params.get('receipt');
  // ★ 주소로 들어오는 값이라 아는 값만 통과시킵니다.
  const cashReceipt: 'todo' | 'requested' | undefined =
    receiptParam === 'todo' ? 'todo' : receiptParam === 'requested' ? 'requested' : undefined;

  const { orders } = await getOrders({
    status: params.get('status') ?? undefined,
    search: params.get('q') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    cashReceipt,
    paymentMethod: params.get('method') ?? undefined,
    // 내보내기는 페이지를 나누지 않습니다. 지나치게 커지지 않도록 상한만 둡니다.
    limit: 2000,
  });

  const rows = selected ? orders.filter((order) => selected.has(order.id)) : orders;

  const lines: string[] = [];

  if (format === 'courier') {
    lines.push(COURIER_HEADERS.map(cell).join(','));
    for (const order of rows) {
      lines.push(
        [
          order.orderNo,
          order.receiverName,
          order.receiverPhone,
          order.postcode,
          `${order.address1} ${order.address2}`.trim(),
          itemsSummary(order),
          totalQuantity(order),
          order.deliveryMemo,
        ]
          .map(cell)
          .join(',')
      );
    }
  } else {
    lines.push(FULL_HEADERS.map(cell).join(','));
    for (const order of rows) {
      lines.push(
        [
          order.orderNo,
          formatDate(order.createdAt),
          statusLabel(order.status),
          order.ordererName,
          order.ordererPhone,
          order.ordererEmail,
          order.receiverName,
          order.receiverPhone,
          order.postcode,
          order.address1,
          order.address2,
          order.deliveryMemo,
          itemsSummary(order),
          totalQuantity(order),
          order.itemsTotal,
          order.shippingFee,
          order.extraShippingFee,
          order.totalAmount,
          order.depositorName,
          paymentMethodLabel(order.paymentMethod),
          cashReceiptLabel(order),
          order.cashReceiptType === 'none' ? '' : order.cashReceiptIssued ? '발급완료' : '발급대기',
          order.pgTid ?? '',
          order.pgAuthNo,
          order.pgAmount ?? '',
          order.pgTradeAt,
          courierName(order.courier),
          order.trackingNo,
          order.adminMemo,
        ]
          .map(cell)
          .join(',')
      );
    }
  }

  // 엑셀은 CRLF 를 기대합니다.
  const csv = `﻿${lines.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);
  const name = format === 'courier' ? 'delivery' : 'orders';

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="jzl-${name}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
