import { getActiveMember } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { getPointHistory } from '@/lib/points';
import { formatPrice } from '@/lib/product-utils';
import { getPointSettings } from '@/lib/settings';
import { pointReasonLabel } from '@/lib/site-config';

export const metadata = { title: '포인트' };

export default async function MypagePointsPage() {
  const member = await getActiveMember();
  if (!member) return null;

  const [history, settings] = await Promise.all([
    getPointHistory(member.user.id),
    getPointSettings(),
  ]);

  return (
    <section aria-labelledby="points-heading">
      <h2 id="points-heading" className="font-serif text-[22px] text-ink">
        포인트
      </h2>

      {/* 현재 잔액 */}
      <div className="mt-6 border border-stone p-6 md:p-8">
        <p className="text-[14px] tracking-[0.14em] text-muted">보유 포인트</p>
        <p className="mt-3 text-[36px] font-semibold leading-none tabular-nums text-ink md:text-[44px]">
          {formatPrice(member.profile.pointBalance)}
          <span className="ml-2 font-sans text-[17px]">원</span>
        </p>
        {member.profile.pointExpiringSoon > 0 ? (
          <p className="mt-4 text-[16px] leading-relaxed text-wine">
            30일 내 소멸 예정 {formatPrice(member.profile.pointExpiringSoon)}P
          </p>
        ) : null}

        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          {settings.minUse > 0
            ? `${formatPrice(settings.minUse)}원 이상부터 주문할 때 사용하실 수 있습니다.`
            : '주문할 때 바로 사용하실 수 있습니다.'}
          {/* ★ 주문서와 같은 말을 해야 합니다. 한쪽만 고치면 두 화면이 서로 다른 말을 합니다. */}
          {settings.useUnit > 1
            ? ` ${formatPrice(settings.useUnit)}원 단위로 사용하실 수 있으며, 남는 포인트는 그대로 남아 다음 주문에 쓰실 수 있습니다.`
            : ''}
          {settings.maxUseRate < 100
            ? ` 상품금액의 ${settings.maxUseRate}%까지 쓸 수 있습니다.`
            : ''}
          {settings.expireMonths > 0
            ? ` 적립일로부터 ${settings.expireMonths}개월이 지나면 소멸되며, 사용하실 때는 먼저 소멸되는 포인트부터 빠져나갑니다.`
            : ''}
        </p>
      </div>

      {/* 내역 */}
      <div className="mt-12">
        <h3 className="border-b border-stone pb-4 font-serif text-[19px] text-ink">
          적립·사용 내역
        </h3>

        {history.length === 0 ? (
          <p className="py-14 text-[17px] leading-relaxed text-ink">
            아직 포인트 내역이 없습니다.
          </p>
        ) : (
          <ul>
            {history.map((entry) => (
              <li key={entry.id} className="border-b border-stone py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[16px] text-ink">
                    {pointReasonLabel(entry.reason)}
                    {entry.memo ? (
                      <span className="ml-2 text-[14px] text-muted">{entry.memo}</span>
                    ) : null}
                  </span>
                  <span
                    className={`text-[17px] font-medium tabular-nums ${
                      entry.amount > 0 ? 'text-ink' : 'text-wine'
                    }`}
                  >
                    {entry.amount > 0 ? '+' : '−'}
                    {formatPrice(Math.abs(entry.amount))}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[14px] text-muted">
                    {formatDateTime(entry.createdAt)}
                  </span>
                  <span className="text-[14px] text-muted">
                    잔액 {formatPrice(entry.balance)}원
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
