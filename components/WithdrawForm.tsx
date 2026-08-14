'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { withdrawAction } from '@/app/(shop)/mypage/actions';

const REASONS = [
  '원하는 상품이 없어서',
  '배송이나 응대가 불만족스러워서',
  '가격이 부담되어서',
  '개인정보가 걱정되어서',
  '다른 계정으로 다시 가입하려고',
  '기타',
];

/** 간편가입 회원이 직접 입력해야 하는 문구 */
const PHRASE = '탈퇴합니다';

export default function WithdrawForm({
  isSocial,
  providerName,
  pointBalance,
}: {
  /** 간편가입(구글·카카오·네이버) 회원이면 true */
  isSocial: boolean;
  providerName: string;
  pointBalance: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // ★ 간편가입 회원은 JZL CLOSET 에 비밀번호가 없어 비밀번호로 본인확인을 할 수 없습니다.
  //   대신 문구를 직접 입력하게 합니다.
  const ready = isSocial ? confirmText.trim() === PHRASE : password.length > 0;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    // ★ 되돌릴 수 없는 작업이라 한 번 더 확인합니다.
    if (
      !window.confirm(
        '정말 탈퇴하시겠습니까?\n\n탈퇴하시면 보유 포인트가 모두 소멸되며 복구할 수 없습니다.\n주문 내역은 전자상거래법에 따라 5년간 보관 후 파기됩니다.'
      )
    ) {
      return;
    }

    setError('');
    const full = [reason, detail.trim()].filter(Boolean).join(' — ');
    startTransition(async () => {
      const result = await withdrawAction(full, confirmText, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  if (done) {
    return (
      <div className="border border-stone p-6 md:p-8">
        <h2 className="font-serif text-[20px] text-ink">탈퇴가 완료되었습니다</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-ink">
          그동안 이용해 주셔서 감사합니다. 주문 내역은 전자상거래법에 따라 보관되며,
          회원 정보는 삭제되었습니다.
        </p>
        <Link href="/" className="btn-primary mt-6">
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="border border-wine bg-wine/5 p-5 text-[15px] leading-relaxed text-wine">
        <p className="font-medium">탈퇴하시기 전에 확인해 주세요</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-[14px]">
          <li>
            · <strong>
              탈퇴하시면 보유 포인트가 모두 소멸되며 복구할 수 없습니다.
            </strong>
            {pointBalance > 0 ? ` (현재 ${pointBalance.toLocaleString('ko-KR')}P)` : ''}
          </li>
          <li>
            · <strong>주문 내역은 전자상거래법에 따라 5년간 보관 후 파기됩니다.</strong>{' '}
            주문번호·금액·상품은 남고 이름·연락처·주소는 지워집니다.
          </li>
          <li>· 회원 정보(이름·연락처·주소)는 삭제되며 되돌릴 수 없습니다.</li>
          <li>· 작성하신 후기는 남되 작성자명이 가려집니다.</li>
          <li>· 탈퇴 후에는 같은 이메일로 다시 가입하실 수 있습니다.</li>
          <li>· 진행 중인 주문이 있으면 배송이 끝난 뒤 탈퇴해 주세요.</li>
        </ul>
      </div>

      <div className="mt-10 max-w-[520px]">
        <span className="label-xs block">탈퇴 사유 (선택)</span>
        <ul className="mt-3 flex flex-col gap-2">
          {REASONS.map((item) => (
            <li key={item}>
              <label className="flex cursor-pointer items-center gap-3 text-[15px] text-ink">
                <input
                  type="radio"
                  name="reason"
                  checked={reason === item}
                  onChange={() => setReason(item)}
                  className="h-4 w-4"
                />
                {item}
              </label>
            </li>
          ))}
        </ul>

        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          rows={3}
          placeholder="자세한 의견을 남겨 주시면 큰 도움이 됩니다. (선택)"
          aria-label="탈퇴 사유 상세"
          className="mt-4 w-full resize-none border border-stone bg-transparent p-4 text-[15px] leading-relaxed text-ink outline-none focus:border-ink"
        />

        {isSocial ? (
          <div className="mt-8">
            <label htmlFor="withdraw-confirm" className="label-xs block">
              확인 — 아래에 &ldquo;{PHRASE}&rdquo; 를 입력해 주세요
            </label>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {providerName} 계정으로 로그인 중이라 확인할 비밀번호가 없습니다. 문구를
              직접 입력해 주세요.
            </p>
            <input
              id="withdraw-confirm"
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={PHRASE}
              autoComplete="off"
              className="mt-2 w-full min-h-[48px] max-w-[240px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none focus:border-ink"
            />
          </div>
        ) : (
          <div className="mt-8">
            <label htmlFor="withdraw-password" className="label-xs block">
              확인 — 비밀번호를 입력해 주세요
            </label>
            <input
              id="withdraw-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-2 w-full min-h-[48px] max-w-[280px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none focus:border-ink"
            />
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 text-[14px] leading-relaxed text-wine">
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending || !ready}
            className="btn-primary"
          >
            {pending ? '처리 중…' : '회원 탈퇴'}
          </button>
          <Link href="/mypage" className="btn-secondary">
            돌아가기
          </Link>
        </div>
      </div>
    </form>
  );
}
