import Link from 'next/link';
import BulkTrackingPanel from '@/components/admin/BulkTrackingPanel';

/**
 * 송장 일괄등록 전용 화면.
 *
 * ★ 원래 주문 목록 안에 접혀 있어 찾기 어려웠습니다. 사이드바에서 바로 오도록 뺐습니다.
 *   주문 목록에도 그대로 남아 있으니 익숙한 자리에서 쓰셔도 됩니다.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '송장 일괄등록' };

export default function AdminBulkTrackingPage() {
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold text-slate-900">송장 일괄등록</h1>
          <p className="mt-1 text-[15px] text-slate-600">
            공급처가 회신한 송장을 붙여넣으면 주문번호로 찾아 한 번에 넣습니다.
          </p>
        </div>
        <Link href="/admin/orders" className="admin-btn" prefetch={false}>
          주문 목록으로
        </Link>
      </div>

      <div className="mt-5">
        <BulkTrackingPanel defaultOpen />
      </div>
    </div>
  );
}
