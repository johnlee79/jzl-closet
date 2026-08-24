import type { Metadata } from 'next';
import Link from 'next/link';
import CheckoutForm from '@/components/CheckoutForm';
import { getCurrentProfile, getCurrentUser } from '@/lib/auth';
import {
  getCachedShipping,
  getCachedStore,
  getPaymentSettings,
  getPointSettings,
} from '@/lib/settings';
import { enabledPaymentMethods, hasBankAccount } from '@/lib/site-config';

/**
 * 주문서.
 * ★ 개인정보를 입력하는 화면이라 검색에 잡히면 안 됩니다.
 *   장바구니(/order)에서 [주문하기] 로 들어옵니다.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '주문서 작성',
  robots: { index: false, follow: false },
  alternates: { canonical: '/checkout' },
};

export default async function CheckoutPage() {
  const [shipping, store, payment, user, profile, pointSettings] = await Promise.all([
    getCachedShipping(),
    getCachedStore(),
    // ★ 계좌 등록 여부만 확인합니다. 계좌번호는 이 화면에 내려보내지 않습니다.
    getPaymentSettings(),
    getCurrentUser(),
    getCurrentProfile(),
    getPointSettings(),
  ]);

  /*
   * 손님에게 보여 줄 결제수단 (4-A).
   * ★ 관리자가 켜 둔 것만 내려보냅니다. 꺼진 수단은 서버도 받지 않습니다.
   */
  const methods = enabledPaymentMethods(payment.methods);

  /*
   * 주문을 받을 수 있는지.
   * ★ 예전에는 "입금 계좌가 있는지" 하나로 판단했습니다.
   *   카드결제가 붙은 뒤로는 계좌가 없어도 카드로 주문할 수 있어야 합니다.
   *   그래서 "무통장입금만 켜져 있는데 계좌가 없는 경우" 에만 막습니다.
   */
  const onlyBank = methods.length === 1 && methods[0].key === 'bank_transfer';
  const ready = !onlyBank || hasBankAccount(payment);

  // 로그인 회원이면 저장된 정보로 주문서를 채웁니다. (탈퇴 계정은 제외)
  const member =
    profile && profile.status === 'active'
      ? {
          name: profile.name,
          phone: profile.phone,
          email: profile.email || user?.email || '',
          postcode: profile.postcode,
          address1: profile.address1,
          address2: profile.address2,
        }
      : null;

  // 비회원이면 포인트를 쓸 수 없습니다.
  const points =
    profile && profile.status === 'active'
      ? {
          balance: profile.pointBalance,
          minUse: pointSettings.minUse,
          useUnit: pointSettings.useUnit,
          maxUseRate: pointSettings.maxUseRate,
        }
      : null;

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">CHECKOUT</p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          주문서 작성
        </h1>
        {/*
          ★ 예전에는 "주문이 접수되면 입금 계좌를 안내드립니다" 뿐이었습니다.
            카드로 결제할 손님도 이 문장을 먼저 보게 됩니다.
          ★ 이 문구에는 아직 관리자 항목이 없습니다. 코드에 박혀 있습니다.
        */}
        <p className="mt-4 text-[17px] leading-[1.9] text-ink md:text-[18px]">
          받는 분과 배송지를 확인하고 결제수단을 골라 주세요. 무통장입금을 고르시면
          주문 완료 화면에서 입금 계좌를 안내드립니다.
        </p>
      </header>

      {!ready ? (
        <div className="mt-10 border border-wine px-5 py-4 text-[16px] leading-relaxed text-wine">
          입금 계좌가 아직 등록되지 않아 주문을 받을 수 없습니다. 고객센터{' '}
          {store.phone}으로 연락 주시면 바로 도와드리겠습니다.
          <br />
          <Link href="/order" className="mt-3 inline-block underline underline-offset-4">
            장바구니로 돌아가기
          </Link>
        </div>
      ) : (
        <div className="mt-12">
          <CheckoutForm
            shipping={shipping}
            storePhone={store.phone}
            member={member}
            points={points}
            methods={methods}
          />
        </div>
      )}
    </div>
  );
}
