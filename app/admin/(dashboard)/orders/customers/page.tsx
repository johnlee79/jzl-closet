import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { getOrdererSummaries } from '@/lib/orders';
import { formatPrice } from '@/lib/product-utils';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * 주문자 목록.
 *
 * ★ 회원 목록은 가입한 사람만 보여 줍니다.
 *   JZL CLOSET 은 비회원 주문을 그대로 받으므로 "누가 얼마나 샀는지" 는
 *   주문 쪽에서 묶어야 전부 보입니다.
 * ★ 취소·반품·결제실패는 구매금액에서 뺐습니다. (통계와 같은 기준)
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '주문자 목록' };

export default async function AdminOrderCustomersPage() {
  const rows = isSupabaseConfigured() ? await getOrdererSummaries() : [];

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-900">주문자 목록</h1>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
            회원·비회원을 모두 묶어 구매금액이 큰 순서로 보여 줍니다. 취소·반품·결제실패
            건은 금액에서 뺐습니다.
          </p>
        </div>
        <Link href="/admin/orders" className="admin-btn">
          주문 목록으로
        </Link>
      </div>

      <div className="admin-card mt-5 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-[15px] leading-relaxed text-slate-500">
            아직 주문이 없습니다.
          </p>
        ) : (
          <table className="w-full min-w-[760px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[14px] text-slate-600">
                <th scope="col" className="px-3 py-2 font-medium">주문자</th>
                <th scope="col" className="px-3 py-2 font-medium">연락처</th>
                <th scope="col" className="px-3 py-2 font-medium">구분</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">주문</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">취소</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">구매금액</th>
                <th scope="col" className="px-3 py-2 font-medium">최근 주문</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                    {row.userId ? (
                      <Link
                        href={`/admin/members/${row.userId}`}
                        className="text-blue-700 hover:underline"
                      >
                        {row.name || '(이름 없음)'}
                      </Link>
                    ) : (
                      row.name || '(이름 없음)'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {row.phone || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={`admin-badge ${
                        row.userId
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.userId ? '회원' : '비회원'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {row.orderCount}건
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-500">
                    {row.cancelledCount > 0 ? `${row.cancelledCount}건` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                    {formatPrice(row.totalAmount)}원
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {formatDate(row.lastOrderedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
        회원 주문은 회원 계정으로, 비회원 주문은 이름과 연락처로 묶었습니다. 같은 분이라도
        연락처를 다르게 넣으면 따로 잡힙니다.
      </p>
    </div>
  );
}
