'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { sendResetMailAction, updateMemberAction } from '@/app/admin/member-actions';
import { adjustPointsAction } from '@/app/admin/content-actions';
import { formatDate, formatDateTime } from '@/lib/format';
import { statusBadgeClass, statusLabel } from '@/lib/order-status';
import { formatPrice } from '@/lib/product-utils';
import { pointReasonLabel } from '@/lib/site-config';
import type { PointTransaction } from '@/lib/points';
import { isSocialProvider, providerLabel } from '@/lib/auth-provider';
import {
  MEMBER_STATUSES,
  MEMBER_STATUS_LABEL,
  type MemberStatus,
} from '@/lib/member-status';
import type { Profile } from '@/lib/profiles';
import type { Order } from '@/lib/types';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/*
 * ★ 고를 수 있는 값은 lib/member-status.ts 의 목록에서 가져옵니다. (2026-08-26)
 *   여기에 또 적어 두면 목록이 갈라집니다. 실제로 다섯 벌이었습니다.
 *   덧붙이는 설명만 이 화면이 정합니다.
 */
const STATUS_NOTE: Record<MemberStatus, string> = {
  active: '',
  inactive: ' (로그인 차단)',
  withdrawn: '',
};

const STATUS_OPTIONS = MEMBER_STATUSES.map((key) => ({
  key,
  label: `${MEMBER_STATUS_LABEL[key]}${STATUS_NOTE[key]}`,
}));

function Agreement({ label, agreed }: { label: string; agreed: boolean }) {
  return (
    <li className="flex items-center gap-2 text-[16px]">
      <span className={agreed ? 'text-green-700' : 'text-red-600'}>
        {agreed ? '동의' : '미동의'}
      </span>
      <span className="text-slate-700">{label}</span>
    </li>
  );
}

export default function MemberDetail({
  profile,
  orders,
  totalSpent,
  pointHistory,
}: {
  profile: Profile;
  orders: Order[];
  totalSpent: number;
  pointHistory: PointTransaction[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  /** 포인트 수동 조정 */
  const [pointAmount, setPointAmount] = useState('');
  const [pointMemo, setPointMemo] = useState('');

  /** 간편가입 회원에게는 비밀번호 재설정 메일을 보낼 수 없습니다. */
  const isSocial = isSocialProvider(profile.provider);

  const [form, setForm] = useState({
    name: profile.name,
    phone: profile.phone,
    email: profile.email,
    postcode: profile.postcode,
    address1: profile.address1,
    address2: profile.address2,
    status: profile.status as string,
    adminMemo: profile.adminMemo,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateMemberAction(profile.id, form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '회원 정보를 저장했습니다.' });
      router.refresh();
    });
  };

  const sendReset = () => {
    if (!window.confirm('이 회원에게 비밀번호 재설정 메일을 보낼까요?')) return;
    setMessage(null);
    startTransition(async () => {
      const result = await sendResetMailAction(profile.id);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '재설정 메일을 보냈습니다.' });
    });
  };

  /** 액션 하나를 돌리고 결과 메시지를 띄웁니다. */
  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    okText: string
  ) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? '처리하지 못했습니다.' });
        return;
      }
      setMessage({ tone: 'ok', text: okText });
      setPointAmount('');
      setPointMemo('');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="admin-card flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
        <div>
          <h1 className="text-[24px] font-semibold text-slate-900">{profile.name}</h1>
          <p className="mt-1 text-[15px] text-slate-500">
            {profile.email || '이메일 없음'} · 가입 {formatDate(profile.createdAt)}
          </p>
        </div>
        <Link href="/admin/members" className="admin-btn">
          목록으로
        </Link>
      </div>

      {message ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[16px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {/* ── 기본 정보 ──────────────────────────────── */}
          <form onSubmit={save} className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">기본 정보</h2>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="admin-label" htmlFor="m-name">이름</label>
                <input
                  id="m-name"
                  type="text"
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label" htmlFor="m-phone">연락처</label>
                <input
                  id="m-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label" htmlFor="m-email">이메일</label>
                <input
                  id="m-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                  className="admin-input"
                />
                <p className="mt-1 text-[14px] text-slate-500">
                  여기서 바꾸면 회원 목록의 표시만 바뀝니다. 로그인 아이디는 Supabase Auth
                  에서 관리합니다.
                </p>
              </div>
              <div>
                <label className="admin-label" htmlFor="m-status">상태</label>
                <select
                  id="m-status"
                  value={form.status}
                  onChange={(event) => set('status', event.target.value)}
                  className="admin-input"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="admin-label" htmlFor="m-postcode">우편번호</label>
                <input
                  id="m-postcode"
                  type="text"
                  value={form.postcode}
                  onChange={(event) => set('postcode', event.target.value)}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label" htmlFor="m-address2">상세주소</label>
                <input
                  id="m-address2"
                  type="text"
                  value={form.address2}
                  onChange={(event) => set('address2', event.target.value)}
                  className="admin-input"
                />
              </div>
              <div className="md:col-span-2">
                <label className="admin-label" htmlFor="m-address1">주소</label>
                <input
                  id="m-address1"
                  type="text"
                  value={form.address1}
                  onChange={(event) => set('address1', event.target.value)}
                  className="admin-input"
                />
              </div>
              <div className="md:col-span-2">
                <label className="admin-label" htmlFor="m-memo">관리자 메모</label>
                <textarea
                  id="m-memo"
                  value={form.adminMemo}
                  onChange={(event) => set('adminMemo', event.target.value)}
                  rows={4}
                  className="admin-input leading-relaxed"
                />
                <p className="mt-1 text-[14px] text-slate-500">회원에게는 보이지 않습니다.</p>
              </div>
            </div>

            <button type="submit" disabled={pending} className="admin-btn-primary mt-4">
              {pending ? '저장 중…' : '회원 정보 저장'}
            </button>
          </form>

          {/* ── 주문 내역 ──────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[18px] font-semibold text-slate-900">
                주문 내역 {orders.length}건
              </h2>
              <p className="text-[15px] text-slate-600">
                총 구매금액 {formatPrice(totalSpent)}원
              </p>
            </div>

            {orders.length === 0 ? (
              <p className="mt-4 text-[15px] text-slate-500">주문 내역이 없습니다.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[16px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[15px] text-slate-600">
                      <th scope="col" className="px-3 py-2 font-medium">주문번호</th>
                      <th scope="col" className="px-3 py-2 font-medium">주문일</th>
                      <th scope="col" className="px-3 py-2 font-medium">상품</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">금액</th>
                      <th scope="col" className="px-3 py-2 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const live = order.items.filter((item) => item.itemStatus === 'normal');
                      const summary =
                        live.length === 0
                          ? '(전체 취소)'
                          : `${live[0].productName}${live.length > 1 ? ` 외 ${live.length - 1}건` : ''}`;
                      return (
                        <tr key={order.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <Link
                              href={`/admin/orders/${order.id}`}
                              className="font-medium text-blue-700 hover:underline"
                            >
                              {order.orderNo}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                            {formatDate(order.createdAt)}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-700">
                            {summary}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                            {formatPrice(order.totalAmount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span className={`admin-badge ${statusBadgeClass(order.status)}`}>
                              {statusLabel(order.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ── 오른쪽 ─────────────────────────────────── */}
        <aside className="flex flex-col gap-5">
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">약관 동의</h2>
            <ul className="mt-3 flex flex-col gap-2">
              <Agreement label="만 14세 이상 (필수)" agreed={profile.agreeAge14} />
              <Agreement label="이용약관 (필수)" agreed={profile.agreeTerms} />
              <Agreement label="개인정보 수집·이용 (필수)" agreed={profile.agreePrivacy} />
              <Agreement label="마케팅 수신 (선택)" agreed={profile.agreeMarketing} />
            </ul>
            <p className="mt-3 border-t border-slate-200 pt-3 text-[15px] text-slate-600">
              동의 시각{' '}
              <span className="text-slate-900">
                {profile.agreedAt ? formatDateTime(profile.agreedAt) : '기록 없음'}
              </span>
            </p>
          </section>

          {/* ── 포인트 ─────────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">포인트</h2>
            <p className="mt-2 text-[26px] font-semibold tabular-nums text-slate-900">
              {formatPrice(profile.pointBalance)}
              <span className="ml-1 text-[16px] font-normal">원</span>
            </p>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <label className="admin-label" htmlFor="point-amount">
                수동 지급 · 차감
              </label>
              <input
                id="point-amount"
                type="number"
                step={100}
                value={pointAmount}
                onChange={(event) => setPointAmount(event.target.value)}
                placeholder="지급은 1000, 차감은 -1000"
                className="admin-input tabular-nums"
              />

              <label className="admin-label mt-3" htmlFor="point-memo">
                사유 (필수)
              </label>
              <input
                id="point-memo"
                type="text"
                value={pointMemo}
                onChange={(event) => setPointMemo(event.target.value)}
                placeholder="예: 이벤트 당첨 / 오적립 회수"
                className="admin-input"
              />

              <button
                type="button"
                disabled={pending || !pointAmount || !pointMemo.trim()}
                onClick={() =>
                  run(
                    () => adjustPointsAction(profile.id, Number(pointAmount), pointMemo),
                    '포인트를 조정했습니다.'
                  )
                }
                className="admin-btn mt-3 w-full"
              >
                포인트 조정
              </button>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                사유는 회원의 포인트 내역에도 함께 보입니다. 잔액보다 많이 차감할 수는
                없습니다.
              </p>
            </div>

            {pointHistory.length > 0 ? (
              <ul className="mt-4 max-h-[220px] divide-y divide-slate-100 overflow-y-auto border-t border-slate-200 pt-2">
                {pointHistory.map((entry) => (
                  <li key={entry.id} className="py-2 text-[15px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-slate-700">
                        {pointReasonLabel(entry.reason)}
                      </span>
                      <span
                        className={`tabular-nums ${
                          entry.amount > 0 ? 'text-slate-900' : 'text-red-700'
                        }`}
                      >
                        {entry.amount > 0 ? '+' : '−'}
                        {formatPrice(Math.abs(entry.amount))}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 text-[14px] text-slate-500">
                      <span className="truncate">{entry.memo}</span>
                      <span className="shrink-0">잔액 {formatPrice(entry.balance)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">계정</h2>
            <dl className="mt-3 flex flex-col gap-2 text-[15px]">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">최근 로그인</dt>
                <dd className="text-slate-900">
                  {profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : '기록 없음'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">가입 경로</dt>
                <dd className="text-slate-900">
                  {isSocial ? `${providerLabel(profile.provider)} 간편가입` : '이메일 가입'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">가입일</dt>
                <dd className="text-slate-900">{formatDate(profile.createdAt)}</dd>
              </div>
              {profile.birthday ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">생일</dt>
                  <dd className="text-slate-900">{profile.birthday}</dd>
                </div>
              ) : null}
              {profile.withdrawnAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">탈퇴일</dt>
                  <dd className="text-slate-900">{formatDate(profile.withdrawnAt)}</dd>
                </div>
              ) : null}
            </dl>

            {isSocial ? (
              <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-600">
                {providerLabel(profile.provider)} 간편가입 회원입니다. JZL CLOSET 에
                저장된 비밀번호가 없어 재설정 메일을 보낼 수 없습니다. 로그인이 안 된다면
                {' '}{providerLabel(profile.provider)} 계정 쪽을 확인해 달라고 안내해 주세요.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={sendReset}
                  disabled={pending || !profile.email}
                  className="admin-btn mt-4 w-full"
                >
                  비밀번호 재설정 메일 보내기
                </button>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                  ★ 관리자는 회원 비밀번호를 볼 수도, 직접 바꿀 수도 없습니다. 회원이 메일
                  링크로 직접 정합니다.
                </p>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
