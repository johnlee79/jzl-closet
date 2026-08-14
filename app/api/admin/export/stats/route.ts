import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { statusLabel } from '@/lib/order-status';
import { kstDaysAgo, kstToday } from '@/lib/orders';
import { getProductStats, getSalesStats } from '@/lib/stats';

/**
 * 통계 CSV 내보내기. (관리자 > 통계)
 * ★ 라이브러리 없이 문자열로 만들고 UTF-8 BOM 을 붙여 엑셀에서 한글이 깨지지 않게 합니다.
 * 한 파일에 일자별 매출 · 상품 · 카테고리 · 브랜드를 구역으로 나눠 담습니다.
 */
export const dynamic = 'force-dynamic';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // = + - @ 로 시작하면 엑셀이 수식으로 읽습니다. 앞에 작은따옴표를 붙여 막습니다.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /["\n,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function row(...values: unknown[]): string {
  return values.map(cell).join(',');
}

export async function GET(request: NextRequest) {
  if (!(await verifySessionToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const from = params.get('from') || kstDaysAgo(6);
  const to = params.get('to') || kstToday();

  const [sales, products] = await Promise.all([
    getSalesStats(from, to),
    getProductStats(from, to),
  ]);

  const lines: string[] = [];

  lines.push(row('JZL CLOSET 통계'));
  lines.push(row('기간', `${from} ~ ${to}`));
  lines.push(row('※ 취소·반품·결제실패 주문과 부분취소 품목은 매출에서 제외했습니다.'));
  lines.push('');

  lines.push(row('[매출 요약]'));
  lines.push(row('총 매출', sales.totalSales));
  lines.push(row('주문 건수', sales.orderCount));
  lines.push(row('평균 객단가', sales.averageOrder));
  lines.push(row('취소·반품 금액', sales.cancelledAmount));
  lines.push(row('취소·반품 건수', sales.cancelledCount));
  lines.push('');

  lines.push(row('[일자별 매출]'));
  lines.push(row('날짜', '매출', '주문건수'));
  for (const entry of sales.daily) {
    lines.push(row(entry.day, entry.amount, entry.count));
  }
  lines.push('');

  lines.push(row('[상태별 주문 건수]'));
  lines.push(row('상태', '건수'));
  for (const [status, count] of Object.entries(sales.byStatus)) {
    lines.push(row(statusLabel(status), count));
  }
  lines.push('');

  lines.push(row('[판매 수량 상위]'));
  lines.push(row('순위', '상품명', 'slug', '판매수량', '매출액'));
  products.top.forEach((entry, index) => {
    lines.push(row(index + 1, entry.name, entry.slug, entry.quantity, entry.amount));
  });
  lines.push('');

  lines.push(row('[카테고리별 매출]'));
  lines.push(row('카테고리', '매출'));
  for (const entry of products.byCategory) {
    lines.push(row(entry.label, entry.amount));
  }
  lines.push('');

  lines.push(row('[브랜드별 매출]'));
  lines.push(row('브랜드', '매출'));
  for (const entry of products.byBrand) {
    lines.push(row(entry.label, entry.amount));
  }

  // 엑셀은 CRLF 를 기대합니다.
  const csv = `﻿${lines.join('\r\n')}\r\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="jzl-stats-${from}_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
