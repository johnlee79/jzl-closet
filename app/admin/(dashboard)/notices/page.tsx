import NoticeManager from '@/components/admin/NoticeManager';
import { getAllNotices } from '@/lib/notices';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '공지 관리' };

export default async function AdminNoticesPage() {
  const configured = isSupabaseConfigured();
  const notices = configured ? await getAllNotices() : [];

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <h1 className="text-[22px] font-semibold text-slate-900">공지 관리</h1>
      <p className="mt-1 text-[14px] text-slate-600">전체 {notices.length}건</p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[15px] leading-relaxed text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정한 뒤 서버를 다시
          시작해 주세요.
        </div>
      ) : null}

      <div className="mt-5">
        <NoticeManager notices={notices} />
      </div>

      <p className="mt-6 text-[13px] leading-relaxed text-slate-500">
        notices 테이블이 없다는 안내가 나오면 Supabase SQL Editor 에서{' '}
        <code>supabase/schema-3a.sql</code> 을 실행해 주세요.
      </p>
    </div>
  );
}
