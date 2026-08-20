import HeldLinkList from '@/components/admin/HeldLinkList';
import { getHeldLinks } from '@/lib/referrals';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '의심 건 검토' };

export default async function AdminReferralReviewPage() {
  const configured = isSupabaseConfigured();
  const items = configured ? await getHeldLinks() : [];

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <h1 className="text-[22px] font-semibold text-slate-900">의심 건 검토</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
        초대한 사람과 같은 기기·회선에서 가입했거나, 같은 추천인이 데려온 다른 회원과
        기기·회선이 겹치는 건입니다. 실적에 아직 넣지 않았습니다.
      </p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[15px] text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정해 주세요.
        </div>
      ) : null}

      <section className="admin-card mt-5 p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">
          보류 중 ({items.length}건)
        </h2>
        <HeldLinkList items={items} />
      </section>

      <div className="admin-card mt-5 p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">판단 기준</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[14px] leading-relaxed text-slate-600">
          <li>
            <strong>가족·지인</strong> — 같은 집에서 같은 공유기를 쓰면 회선이 같게 나옵니다.
            기기가 다르면 대체로 정상입니다.
          </li>
          <li>
            <strong>매장에서 가입</strong> — 옆에서 가입을 도와 드린 경우입니다. 기기까지
            같아도 정상일 수 있습니다.
          </li>
          <li>
            <strong>본인 계정 추가</strong> — 같은 기기·같은 회선이면서, 같은 추천인 밑에
            비슷한 시각에 여러 건이 쌓였다면 의심해 볼 만합니다.
          </li>
        </ul>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
          인정하면 그 자리에서 실적에 반영되고, 그동안 못 받은 목표 보상이 있으면 함께
          처리됩니다.
        </p>
      </div>
    </div>
  );
}
