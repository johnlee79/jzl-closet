import Link from 'next/link';
import StatsRange from '@/components/admin/StatsRange';
import FeeSettingsForm from '@/components/admin/FeeSettingsForm';
import { resolveRange, type RangeParams } from '@/lib/admin-range';
import { statusBadgeClass, statusLabel } from '@/lib/order-status';
import { emptyProfit, getProfitStats } from '@/lib/profit';
import { formatPrice } from '@/lib/product-utils';
import { getPaymentSettings } from '@/lib/settings';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * ================================================================
 * ** 수익 관리 (2026-08-27)
 * ================================================================
 *
 * 통계 화면(/admin/stats)과 다른 화면입니다. 통계는 그대로 둡니다.
 * 여기는 "얼마 남았는지" 만 봅니다.
 *
 *   순수익 = 매출 − 원가 − 배송비부담 − 카드수수료 − 이체수수료
 *
 * ** 매출 판정은 lib/order-status.ts 의 isSalesStatus() 하나만 씁니다.
 *   통계 화면과 같은 함수입니다. 두 화면의 총 매출이 절대 안 어긋납니다.
 *
 * ** 기간은 lib/admin-range.ts 하나만 씁니다. 통계 화면과 같은 컴포넌트입니다.
 *   기본은 당일입니다. (사장님 지시)
 * ================================================================
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '수익 관리' };

function Card({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'plain' | 'good' | 'bad' | 'warn';
}) {
  const color =
    tone === 'good'
      ? 'text-green-700'
      : tone === 'bad'
        ? 'text-red-700'
        : tone === 'warn'
          ? 'text-amber-700'
          : 'text-slate-900';
  return (
    <div className="admin-card p-5">
      <p className="text-[14px] text-slate-600">{label}</p>
      <p className={`mt-2 text-[22px] font-semibold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-[13px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default async function AdminProfitPage({
  searchParams,
}: {
  searchParams: RangeParams;
}) {
  const configured = isSupabaseConfigured();

  // ** 기본은 당일입니다.
  const { from, to, preset } = resolveRange(searchParams, 'today');

  const [stats, payment] = configured
    ? await Promise.all([getProfitStats(from, to), getPaymentSettings()])
    : [emptyProfit(), await getPaymentSettings()];

  const won = (value: number) => `${formatPrice(value)}원`;

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <h1 className="text-[24px] font-semibold text-slate-900">수익 관리</h1>
      <p className="mt-2 text-[15px] text-slate-600">
        {from} ~ {to} · 한국 시간 기준 · 취소·반품·결제실패 주문은 빠졌습니다.
      </p>

      <div className="mt-6">
        <StatsRange from={from} to={to} preset={preset} basePath="/admin/profit" />
      </div>

      {/*
        ** 원가를 안 넣은 상품이 있으면 크게 알립니다. (사장님 지시)
          원가가 빠진 채로 계산하면 순수익이 실제보다 커 보입니다.
          "잘 남는다" 고 착각하게 만드는 숫자는 없느니만 못합니다.
      */}
      {stats.productsWithoutCost > 0 ? (
        <div className="mt-6 border border-amber-300 bg-amber-50 p-5">
          <p className="text-[17px] font-semibold text-amber-900">
            원가를 아직 안 넣은 상품이 {stats.productsWithoutCost}개 있습니다
            <span className="ml-2 text-[15px] font-normal">
              (전체 {stats.productTotal}개 중)
            </span>
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-amber-900">
            그 상품이 팔린 주문은 <strong>원가가 0으로 계산됩니다.</strong> 아래 순수익이
            실제보다 크게 보입니다. 상품 목록에서 원가를 넣어 주세요.
          </p>
          <Link href="/admin/products" className="admin-btn mt-3 inline-flex">
            상품 목록으로 가서 원가 넣기
          </Link>
        </div>
      ) : null}

      {/* ── 큰 숫자 ─────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card label="총 매출" value={won(stats.sales)} hint={`주문 ${stats.orderCount}건`} />
        <Card label="총 원가" value={won(stats.cost)} tone="bad" />
        <Card
          label="배송비 부담"
          value={won(stats.shippingBurden)}
          tone="bad"
          hint={`주문 1건당 ${formatPrice(stats.shippingBurdenEach)}원 · 손님이 낸 배송비는 매출에 포함`}
        />
        <Card
          label="카드 수수료"
          value={won(stats.cardFee)}
          tone="bad"
          hint={`${stats.cardFeeRate}% · 카드 결제에만`}
        />
        <Card
          label="이체 수수료"
          value={won(stats.transferFee)}
          tone="bad"
          hint={`건당 ${formatPrice(stats.transferFeeEach)}원 · 카드 결제에만`}
        />
        <Card
          label="순수익"
          value={won(stats.profit)}
          tone={stats.profit >= 0 ? 'good' : 'bad'}
          hint={stats.margin === null ? '매출이 없습니다' : `수익률 ${stats.margin}%`}
        />
      </div>

      {/*
        ** 곧 빠질 돈을 미리 알려 줍니다. (사장님 지시)
          취소요청은 아직 환불 전이라 매출로 세지만, 취소완료가 되면 빠집니다.
      */}
      {stats.cancelRequestedCount > 0 ? (
        <p className="mt-3 border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-700">
          위 매출에는 <strong>취소요청 {stats.cancelRequestedCount}건</strong>(
          {won(stats.cancelRequestedAmount)})이 포함되어 있습니다. 취소완료로 바뀌면 빠집니다.
        </p>
      ) : null}

      {/* ── 수수료 설정 ─────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-[18px] font-semibold text-slate-900">수수료</h2>
        <p className="mt-1 text-[14px] text-slate-600">
          바꿔서 저장하면 위 숫자가 바로 다시 계산됩니다. 설정 화면의 「결제·주문」과 같은
          값입니다.
        </p>
        <div className="mt-3">
          <FeeSettingsForm
            initial={{ cardFeeRate: payment.cardFeeRate, transferFee: payment.transferFee }}
          />
        </div>
      </div>

      {/* ── 주문별 마진 ─────────────────────────────────────── */}
      <div className="mt-10">
        <h2 className="text-[18px] font-semibold text-slate-900">
          주문별 마진 <span className="text-[15px] font-normal text-slate-500">
            ({stats.orders.length}건)
          </span>
        </h2>

        {stats.orders.length === 0 ? (
          <p className="admin-card mt-3 p-6 text-[15px] text-slate-600">
            이 기간에 매출로 잡힌 주문이 없습니다.
          </p>
        ) : (
          <div className="admin-card mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-[15px]">
              <thead className="border-b border-slate-200 text-left text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">주문번호</th>
                  <th scope="col" className="px-3 py-2 font-medium">상태</th>
                  <th scope="col" className="px-3 py-2 font-medium">결제수단</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">매출</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">원가</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">배송비</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">카드</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">이체</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">순수익</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">수익률</th>
                </tr>
              </thead>
              <tbody>
                {stats.orders.map((row) => {
                  const rate =
                    row.sales > 0 ? Math.round((row.profit / row.sales) * 1000) / 10 : null;
                  return (
                    <tr key={row.orderNo} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">
                        <span className="text-slate-900">{row.orderNo}</span>
                        {/*
                          ** 원가를 모르는 품목이 낀 주문은 반드시 표시합니다.
                            그 줄의 순수익은 실제보다 큽니다. 믿으면 안 됩니다.
                        */}
                        {row.costMissing ? (
                          <span className="ml-2 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[13px] text-amber-800">
                            원가 없음
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`admin-badge ${statusBadgeClass(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.paymentMethod === 'bank_transfer' ? '무통장입금' : '신용카드'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.sales)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {row.cost > 0 ? `−${formatPrice(row.cost)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {row.shippingBurden > 0 ? `−${formatPrice(row.shippingBurden)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {row.cardFee > 0 ? `−${formatPrice(row.cardFee)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {row.transferFee > 0 ? `−${formatPrice(row.transferFee)}` : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold tabular-nums ${
                          row.profit >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {formatPrice(row.profit)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {rate === null ? '—' : `${rate}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-8 text-[14px] leading-relaxed text-slate-500">
        ★ 취소된 카드 주문의 수수료는 <strong>0으로 잡고 있습니다.</strong> KSNET 이 취소할 때
        수수료를 돌려준다고 가정한 것입니다. 돌려주지 않는다면 그만큼이 손실인데 이 숫자에는
        안 잡힙니다. 확인되면 알려 주세요. (lib/profit.ts 주석에도 적어 두었습니다)
      </p>
    </div>
  );
}
