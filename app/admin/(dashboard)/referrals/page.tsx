import Link from 'next/link';
import ReferralSettingsForm from '@/components/admin/ReferralSettingsForm';
import { kstDaysAgo, kstToday } from '@/lib/orders';
import { getReferralStats, getReferrerSummaries } from '@/lib/referrals';
import { getReferralSettings } from '@/lib/settings';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: '추천 관리' };

type SearchParams = {
  q?: string;
  sort?: string;
  from?: string;
  to?: string;
};

const SORTS = [
  { key: 'purchase', label: '구매순' },
  { key: 'signup', label: '가입순' },
  { key: 'visit', label: '방문순' },
] as const;

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const configured = isSupabaseConfigured();

  const search = (searchParams.q ?? '').trim();
  const sort = SORTS.some((item) => item.key === searchParams.sort)
    ? (searchParams.sort as 'purchase' | 'signup' | 'visit')
    : 'purchase';

  // 기본 기간은 최근 30일 (한국시간 날짜)
  const from = searchParams.from || kstDaysAgo(29);
  const to = searchParams.to || kstToday();

  const [summaries, stats, settings] = await Promise.all([
    configured ? getReferrerSummaries(search, sort) : Promise.resolve([]),
    configured
      ? getReferralStats(from, to)
      : Promise.resolve({
          visits: 0,
          signups: 0,
          purchases: 0,
          signupRate: 0,
          purchaseRate: 0,
          heldCount: 0,
          paidPoints: 0,
        }),
    getReferralSettings(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <h1 className="text-[22px] font-semibold text-slate-900">추천 관리</h1>
      <p className="mt-1 text-[14px] text-slate-600">
        추천인별 실적과 기간별 전환율을 봅니다. 목표·사은품은 왼쪽 메뉴에서 만듭니다.
      </p>

      {!configured ? (
        <div className="admin-card mt-5 border-amber-300 bg-amber-50 p-4 text-[15px] text-amber-900">
          Supabase 연결 정보가 없습니다. <code>.env.local</code> 을 설정해 주세요.
        </div>
      ) : null}

      {/* ── 통계 ────────────────────────────────────── */}
      <section className="admin-card mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-slate-900">
            기간별 추천 통계
          </h2>
          <form method="get" className="flex flex-wrap items-center gap-2">
            {search ? <input type="hidden" name="q" value={search} /> : null}
            <input type="hidden" name="sort" value={sort} />
            <input type="date" name="from" defaultValue={from} className="admin-input" />
            <span className="text-[14px] text-slate-500">—</span>
            <input type="date" name="to" defaultValue={to} className="admin-input" />
            <button type="submit" className="admin-btn">
              조회
            </button>
          </form>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: '방문', value: `${stats.visits}명` },
            { label: '가입', value: `${stats.signups}명` },
            { label: '첫 구매', value: `${stats.purchases}명` },
            { label: '지급 포인트', value: `${stats.paidPoints.toLocaleString('ko-KR')}P` },
          ].map((item) => (
            <div key={item.label} className="border border-slate-200 p-4">
              <dt className="text-[13px] text-slate-500">{item.label}</dt>
              <dd className="mt-1 text-[22px] font-semibold text-slate-900">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-[14px] text-slate-600">
          전환율 — 방문 → 가입 {stats.signupRate}% · 가입 → 첫 구매 {stats.purchaseRate}%
        </p>

        {stats.heldCount > 0 ? (
          <p className="mt-3 text-[14px] text-amber-700">
            같은 기기·회선으로 보여 확인이 필요한 건이 {stats.heldCount}건 있습니다.{' '}
            <Link href="/admin/referrals/review" className="underline">
              검토하러 가기
            </Link>
          </p>
        ) : null}
      </section>

      {/* ── 설정 ────────────────────────────────────── */}
      <section className="admin-card mt-5 p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">추천 설정</h2>
        <ReferralSettingsForm settings={settings} />
      </section>

      {/* ── 추천인별 현황 ───────────────────────────── */}
      <section className="admin-card mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-slate-900">추천인별 현황</h2>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="이름 · 이메일 · 코드로 검색"
              className="admin-input"
            />
            <select name="sort" defaultValue={sort} className="admin-input">
              {SORTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <button type="submit" className="admin-btn">
              검색
            </button>
          </form>
        </div>

        {summaries.length === 0 ? (
          <p className="mt-6 text-[15px] text-slate-600">
            {search
              ? '조건에 맞는 추천인이 없습니다.'
              : '아직 실적이 있는 추천인이 없습니다. 검색하면 전체 회원에서 찾을 수 있습니다.'}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-slate-200 text-[14px] text-slate-500">
                  <th className="px-3 py-2">회원</th>
                  <th className="px-3 py-2">코드</th>
                  <th className="px-3 py-2 text-right">방문</th>
                  <th className="px-3 py-2 text-right">가입</th>
                  <th className="px-3 py-2 text-right">첫 구매</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-2.5">
                      <span className="text-slate-900">{row.name || '이름 없음'}</span>
                      <span className="ml-2 text-[13px] text-slate-500">{row.email}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700">{row.code}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">
                      {row.visitCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700">
                      {row.signupCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                      {row.purchaseCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-[13px] leading-relaxed text-slate-500">
        추천 테이블이 없다는 안내가 나오면 Supabase SQL Editor 에서{' '}
        <code>supabase/schema-3f.sql</code> 을 실행한 뒤{' '}
        <code>supabase/rls-3f.sql</code> 을 실행해 주세요.
      </p>
    </div>
  );
}
