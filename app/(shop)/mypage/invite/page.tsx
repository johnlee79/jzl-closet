import { headers } from 'next/headers';
import Link from 'next/link';
import InviteLinkBox from '@/components/InviteLinkBox';
import SafeImage from '@/components/SafeImage';
import { getActiveMember } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { formatPrice } from '@/lib/product-utils';
import {
  deviceKeyOf,
  evaluateGoals,
  getInviteScreen,
  ipHashOf,
  rememberInviterDevice,
  type Achievement,
  type GoalProgress,
  type InviteEntry,
} from '@/lib/referrals';
import { getCachedReferral } from '@/lib/settings';

export const metadata = { title: '친구 초대' };

/**
 * 마이페이지 → 친구 초대.
 *
 * ★ 방문·가입만으로는 포인트가 나가지 않습니다.
 *   숫자를 세어 보여 주기만 하고, 보상은 아래 "진행 중인 목표"를 채웠을 때만 나갑니다.
 *   화면 문구도 그렇게 읽히도록 적었습니다. 기대를 잘못 심으면 문의가 늘어납니다.
 *
 * ★ 초대 내역의 이름은 서버에서 이미 가려서 옵니다. (김O수)
 *   원본 이름은 이 화면까지 오지 않습니다.
 */

const STATE_LABEL: Record<InviteEntry['state'], string> = {
  purchased: '구매 완료',
  signed_up: '가입 완료',
  visited: '방문',
  held: '확인 중',
};

function ProgressBar({ current, target }: { current: number; target: number }) {
  const filled = Math.min(current, target);
  const ratio = target > 0 ? Math.min(100, Math.round((filled / target) * 100)) : 0;

  return (
    <div className="mt-4">
      {/*
        ★ 눈으로 보는 막대와 별개로 숫자를 함께 적습니다.
          막대만 있으면 화면을 못 보는 손님에게 아무것도 전달되지 않습니다.
      */}
      <div
        role="progressbar"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${target}명 중 ${filled}명`}
        className="h-2 w-full bg-stone"
      >
        <div className="h-full bg-ink" style={{ width: `${ratio}%` }} />
      </div>
      <p className="mt-2 text-[14px] text-ink">
        {filled} / {target}
      </p>
    </div>
  );
}

/** 달성한 목표의 처리 상태를 손님 말로 바꿔 줍니다. */
function achievementNote(item: Achievement): string {
  if (item.rewardType === 'point') {
    if (item.status === 'paid') return `${formatPrice(item.rewardPoints)}P 지급 완료`;
    if (item.status === 'held') return '지급 보류 — 확인 후 처리해 드립니다';
    if (item.status === 'rejected') return '지급 취소';
    return '지급 준비 중';
  }
  if (item.status === 'shipped') return '발송 완료';
  if (item.status === 'rejected') return '발송 취소';
  if (item.status === 'held') return '확인 중';
  return '발송 준비 중';
}

function GoalCard({ item }: { item: GoalProgress }) {
  const { goal } = item;
  const left = Math.max(0, item.target - item.current);
  const done = left === 0;

  return (
    <li className="border border-stone p-6 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        {goal.gift?.imageUrl ? (
          <div className="w-full shrink-0 md:w-[180px]">
            {/* 무엇을 받는지 눈으로 보게 하는 것이 이 사진의 목적입니다. */}
            <SafeImage
              src={goal.gift.imageUrl}
              alt={goal.gift.name}
              label={goal.gift.name}
              width={360}
              height={270}
              fit="cover"
              className="aspect-[4/3] w-full"
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="text-[16px] leading-relaxed text-ink md:text-[17px]">
            {goal.name}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            친구 {goal.targetCount}명이{' '}
            {goal.criteria === 'signup' ? '가입하면' : '첫 주문을 마치면'}{' '}
            {goal.rewardType === 'point'
              ? `${formatPrice(goal.rewardPoints)}P 를 드립니다`
              : `${goal.gift?.name ?? '사은품'}을 드립니다`}
            {goal.isRepeatable ? ' (달성할 때마다 계속)' : ''}
          </p>

          {goal.gift?.description ? (
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              {goal.gift.description}
            </p>
          ) : null}
          {goal.gift?.linkUrl ? (
            <Link
              href={goal.gift.linkUrl}
              className="link-wine mt-2 inline-block text-[14px]"
            >
              사은품 자세히 보기
            </Link>
          ) : null}

          <ProgressBar current={item.current} target={item.target} />

          <p className="mt-2 text-[14px] leading-relaxed text-ink">
            {done
              ? '목표를 채우셨습니다. 처리 상태를 아래에서 확인해 주세요.'
              : `${left}명 더 모으면 받으실 수 있어요`}
          </p>

          {item.achievements.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-1 border-t border-stone pt-4">
              {item.achievements.map((achievement) => (
                <li key={achievement.id} className="text-[14px] text-muted">
                  <span className="text-ink">달성 완료</span>{' '}
                  {formatDate(achievement.createdAt)} · {achievementNote(achievement)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default async function MypageInvitePage() {
  const member = await getActiveMember();
  if (!member) return null;

  const settings = await getCachedReferral();

  /*
   * ★ 이 화면을 연 기기·회선을 적어 둡니다. (해시만, 원본은 저장하지 않습니다)
   *   나중에 "초대한 사람과 가입한 사람이 같은 기기인가"를 볼 때 씁니다.
   *   링크를 복사하러 들어오는 자리라 기록해 두기 가장 자연스러운 시점입니다.
   */
  const head = headers();
  await rememberInviterDevice(member.user.id, ipHashOf(head), deviceKeyOf(head));

  /*
   * ★ 목표를 다시 한 번 확인합니다.
   *   보통은 친구가 가입하거나 첫 주문을 마칠 때 그 자리에서 확인합니다.
   *   그런데 관리자가 목표를 나중에 만들면, 이미 조건을 채워 둔 회원은
   *   아무도 확인해 주지 않아 계속 못 받게 됩니다.
   *   화면을 열 때 한 번 더 보면 그 구멍이 막힙니다.
   *   같은 회차를 두 번 만들지 못하도록 DB 에 유일 인덱스가 걸려 있어
   *   여러 번 불려도 중복 지급되지 않습니다.
   */
  await evaluateGoals(member.user.id);

  const screen = await getInviteScreen(member.user.id);

  if (!settings.enabled || !screen) {
    return (
      <section aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="font-serif text-[20px] text-ink">
          친구 초대
        </h2>
        <p className="mt-6 text-[15px] leading-relaxed text-muted">
          지금은 친구 초대를 운영하고 있지 않습니다.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="invite-heading" className="flex flex-col gap-12">
      <div>
        <h2 id="invite-heading" className="font-serif text-[20px] text-ink">
          친구 초대
        </h2>
        {settings.inviteNotice ? (
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {settings.inviteNotice}
          </p>
        ) : null}
      </div>

      <div className="border border-stone p-6 md:p-8">
        <InviteLinkBox code={screen.code} shareLine={settings.shareLine} />
      </div>

      {/* ── 현재까지 ────────────────────────────────── */}
      <div>
        <h3 className="font-serif text-[18px] text-ink">현재까지</h3>
        <dl className="mt-4 grid grid-cols-3 gap-4 border border-stone p-6">
          {[
            { label: '방문', value: screen.visitCount },
            { label: '가입', value: screen.signupCount },
            { label: '구매', value: screen.purchaseCount },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-[13px] tracking-[0.14em] text-muted">{item.label}</dt>
              <dd className="mt-2 font-display text-[28px] leading-none text-ink">
                {item.value}
                <span className="ml-1 font-sans text-[14px]">명</span>
              </dd>
            </div>
          ))}
        </dl>
        {/* ★ 오해를 미리 막습니다. 방문·가입 자체로는 아무것도 지급하지 않습니다. */}
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          방문과 가입만으로는 포인트가 지급되지 않습니다. 아래 목표를 채우셨을 때 보상을
          드립니다.
        </p>
      </div>

      {/* ── 진행 중인 목표 ──────────────────────────── */}
      <div>
        <h3 className="font-serif text-[18px] text-ink">진행 중인 목표</h3>
        {screen.goals.length === 0 ? (
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            지금 진행 중인 목표가 없습니다. 새 목표가 열리면 이곳에 보여 드립니다.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-5">
            {screen.goals.map((item) => (
              <GoalCard key={item.goal.id} item={item} />
            ))}
          </ul>
        )}
      </div>

      {/* ── 초대 내역 ──────────────────────────────── */}
      <div>
        <h3 className="font-serif text-[18px] text-ink">초대 내역</h3>
        {screen.entries.length === 0 ? (
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            아직 초대 내역이 없습니다. 위 링크를 친구에게 보내 보세요.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col">
            {screen.entries.map((entry, index) => (
              <li
                key={`${entry.date}-${index}`}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-stone py-4 text-[15px]"
              >
                <span className="text-ink">{entry.maskedName}</span>
                <span className="text-muted">{STATE_LABEL[entry.state]}</span>
                <span className="text-[14px] text-muted">{formatDate(entry.date)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          친구의 이름은 개인정보 보호를 위해 일부만 보여 드립니다.
        </p>
      </div>
    </section>
  );
}
