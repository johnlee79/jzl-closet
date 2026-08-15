import RewardManager from '@/components/admin/RewardManager';
import { getAchievements, getLastShippingOf, type Achievement } from '@/lib/referrals';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '보상 처리' };

/** 아직 끝나지 않은 것 */
const OPEN = new Set(['pending', 'preparing', 'held']);

export default async function AdminReferralRewardsPage() {
  const configured = isSupabaseConfigured();
  const all = configured ? await getAchievements('all') : [];

  const open = all.filter((item) => OPEN.has(item.status));
  const closed = all.filter((item) => !OPEN.has(item.status));

  /*
   * ★ 사은품 받는 분 정보를 마지막 배송지로 미리 채웁니다.
   *   DB 에 미리 써 두지 않고 화면에서만 채웁니다.
   *   관리자가 확인하고 저장을 눌렀을 때 비로소 남는 편이,
   *   나중에 "누가 이 주소를 넣었나"를 따라가기 쉽습니다.
   *
   * ★ 아직 비어 있는 건만 읽습니다. 이미 적어 둔 주소를 덮어쓰지 않습니다.
   */
  const needsAddress = open.filter(
    (item) => item.rewardType === 'gift' && !item.shipName && !item.shipAddress1
  );

  const filled = new Map<string, Achievement>();
  await Promise.all(
    needsAddress.map(async (item) => {
      const last = await getLastShippingOf(item.userId);
      if (!last) return;
      filled.set(item.id, {
        ...item,
        shipName: last.shipName,
        shipPhone: last.shipPhone,
        shipPostcode: last.shipPostcode,
        shipAddress1: last.shipAddress1,
        shipAddress2: last.shipAddress2,
      });
    })
  );

  const openItems = open.map((item) => filled.get(item.id) ?? item);

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <h1 className="text-[20px] font-semibold text-slate-900">보상 처리</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        포인트는 달성 즉시 자동으로 나갑니다. 여기 남아 있는 포인트 건은 월 한도를 넘어
        보류된 것들입니다. 사은품은 자동으로 나가지 않으니 이 화면에서 보내 주세요.
      </p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[14px] text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정해 주세요.
        </div>
      ) : null}

      <section className="admin-card mt-5 p-5">
        <h2 className="text-[15px] font-semibold text-slate-900">
          처리할 건 ({openItems.length}건)
        </h2>
        <RewardManager items={openItems} />
      </section>

      <section className="admin-card mt-5 p-5">
        <h2 className="text-[15px] font-semibold text-slate-900">
          처리 완료 ({closed.length}건)
        </h2>
        <RewardManager items={closed} />
      </section>
    </div>
  );
}
