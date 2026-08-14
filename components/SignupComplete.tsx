'use client';

import ResendVerification, { MailboxButton } from '@/components/ResendVerification';

/**
 * 가입 직후 안내.
 * 메일이 스팸함으로 가는 일이 잦아 눈에 띄게 알려 줍니다.
 */
export default function SignupComplete({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-5">
      {/* ★ 실제로 가장 많이 묻는 부분이라 노란 박스로 크게 둡니다. */}
      <div className="border border-amber-300 bg-amber-50 px-5 py-4 text-left text-[14px] leading-relaxed text-amber-900">
        <p className="font-medium">메일이 오지 않았나요?</p>
        <p className="mt-1.5">
          스팸함(정크메일)을 확인해 주세요. 네이버·다음 메일은 스팸으로 분류되는 경우가
          있습니다.
        </p>
      </div>

      <MailboxButton email={email} />

      <ResendVerification email={email} />

      <p className="text-[13px] leading-relaxed text-muted">
        인증 링크는 일정 시간이 지나면 만료됩니다. 만료되었다면 위 버튼으로 다시
        받아 주세요.
      </p>
    </div>
  );
}
