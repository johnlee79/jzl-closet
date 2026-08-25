'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { logoutAction } from '@/app/(shop)/auth-actions';
import { clearMember } from '@/lib/member';

/**
 * ============================================================
 * "로그인은 되어 있는데 쇼핑몰 회원이 아닙니다"
 * ============================================================
 *
 * ★★ 언제 나오는가
 *   로그인 세션은 있는데 profiles 행이 없거나 탈퇴한 계정일 때입니다.
 *   실제로 이런 계정이 있습니다.
 *     · 관리자 이메일 계정 — 관리자 로그인이 Supabase 세션을 만드는데,
 *       그 계정은 쇼핑몰 회원으로 가입한 적이 없어 profiles 행이 없습니다
 *     · 탈퇴한 계정 — 세션이 남아 있는 채로 마이페이지에 들어온 경우
 *
 * ★★ 예전에는 이 자리에서 아무것도 그리지 않았습니다. (return null)
 *   헤더와 푸터만 있고 가운데가 텅 빈 화면이 나왔습니다.
 *   손님은 고장 났는지, 로그인이 안 된 건지, 뭘 해야 하는지 알 수 없습니다.
 *
 * ★★ /login 으로 보내지 않습니다. 무한 반복이 됩니다.
 *   미들웨어가 /login 에서 "로그인한 사람" 을 /mypage 로 되돌려 보냅니다.
 *   이 상태는 미들웨어 눈에는 로그인한 사람이라, 두 화면이 서로를 가리키며
 *   손님 브라우저가 그 자리에서 멈춥니다.
 *
 * ★ 그래서 여기서 멈춰 서서 사실을 말하고, 나가는 길을 줍니다.
 *   로그아웃하면 세션이 지워져 그다음부터는 평범한 비로그인 상태가 됩니다.
 */
export default function MemberOnlyNotice() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const logout = () => {
    startTransition(async () => {
      await logoutAction();
      /*
       * ★ 화면이 들고 있는 로그인 상태도 즉시 비웁니다.
       *   서버에 다시 물어볼 때까지 기다리면 헤더에 이름이 남아 있어
       *   "로그아웃을 눌렀는데 아무 일도 안 일어난" 것처럼 보입니다.
       */
      clearMember();
      router.replace('/login');
      router.refresh();
    });
  };

  return (
    <div className="shell py-20">
      <h1 className="font-serif text-[26px] leading-snug text-ink md:text-[32px]">
        이 계정으로는 마이페이지를 쓸 수 없습니다
      </h1>
      <p className="mt-5 max-w-[560px] text-[17px] leading-[1.9] text-ink">
        로그인은 되어 있지만 쇼핑몰 회원 정보가 없는 계정입니다. 관리자용 계정이거나
        탈퇴한 계정일 수 있습니다.
      </p>
      <p className="mt-3 max-w-[560px] text-[16px] leading-[1.9] text-muted">
        로그아웃한 뒤 쇼핑몰 회원 계정으로 다시 로그인해 주세요. 회원가입 없이
        주문하셨다면 <Link href="/order-lookup" className="underline underline-offset-4">주문 조회</Link>
        에서 주문번호와 연락처로 확인하실 수 있습니다.
      </p>

      <div className="btn-row mt-8">
        <button type="button" onClick={logout} disabled={pending} className="btn-primary">
          {pending ? '로그아웃하는 중…' : '로그아웃하고 다시 로그인'}
        </button>
        <Link href="/" className="btn-secondary">
          쇼핑몰 홈으로
        </Link>
      </div>
    </div>
  );
}
