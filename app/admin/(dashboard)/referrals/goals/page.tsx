import GiftManager from '@/components/admin/GiftManager';
import GoalManager from '@/components/admin/GoalManager';
import { getGifts, getGoals } from '@/lib/referrals';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '목표·사은품' };

export default async function AdminReferralGoalsPage() {
  const configured = isSupabaseConfigured();

  const [goals, gifts] = await Promise.all([
    configured ? getGoals(true) : Promise.resolve([]),
    configured ? getGifts(true) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <h1 className="text-[20px] font-semibold text-slate-900">목표·사은품</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        여기서 만든 목표를 채웠을 때만 보상이 나갑니다. 방문·가입 자체로는 아무것도
        지급되지 않습니다.
      </p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[14px] text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정해 주세요.
        </div>
      ) : null}

      <section className="admin-card mt-5 p-5">
        <h2 className="text-[15px] font-semibold text-slate-900">
          목표 이벤트 ({goals.length}개)
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          여러 개를 동시에 운영할 수 있습니다. 회원 화면에는 진행 중인 목표만 보입니다.
        </p>
        <GoalManager goals={goals} gifts={gifts} />
      </section>

      <section className="admin-card mt-5 p-5">
        <h2 className="text-[15px] font-semibold text-slate-900">
          사은품 ({gifts.length}개)
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          등록해 두면 목표의 보상으로 고를 수 있습니다. 사진은 회원의 초대 화면에 그대로
          보입니다.
        </p>
        <GiftManager gifts={gifts} />
      </section>

      <p className="mt-6 text-[12px] leading-relaxed text-slate-500">
        추천 테이블이 없다는 안내가 나오면 Supabase SQL Editor 에서{' '}
        <code>supabase/schema-3f.sql</code> 을 실행해 주세요.
      </p>
    </div>
  );
}
