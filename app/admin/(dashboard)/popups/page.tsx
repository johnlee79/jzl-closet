import PopupManager from '@/components/admin/PopupManager';
import { getAllPopups } from '@/lib/popups';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '팝업 관리' };

export default async function AdminPopupsPage() {
  const configured = isSupabaseConfigured();
  const popups = configured ? await getAllPopups() : [];

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <h1 className="text-[24px] font-semibold text-slate-900">팝업 관리</h1>
      <p className="mt-1 text-[15px] text-slate-600">전체 {popups.length}건</p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[16px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : null}

      <div className="mt-5">
        <PopupManager popups={popups} />
      </div>

      <p className="mt-6 text-[14px] leading-relaxed text-slate-500">
        popups 테이블이 없다는 안내가 나오면 Supabase SQL Editor 에서{' '}
        <code>supabase/schema-3a.sql</code> 을 실행해 주세요.
      </p>
    </div>
  );
}
