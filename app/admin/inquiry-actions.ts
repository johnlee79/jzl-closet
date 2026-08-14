'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { answerInquiry, getInquiryById, updateInquiryStatus } from '@/lib/inquiries';
import { isInquiryStatus, type InquiryStatus } from '@/lib/inquiry-status';

/** 관리자 문의 관리 서버 액션. */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function assertAdmin(): Promise<boolean> {
  return verifySessionToken(cookies().get(ADMIN_COOKIE)?.value);
}

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin/inquiries]', message);
  return { ok: false, error: message };
}

function refresh(id: string): void {
  revalidatePath('/admin');
  revalidatePath('/admin/inquiries');
  revalidatePath(`/admin/inquiries/${id}`);
}

/** 답변 저장 — 답변을 넣으면 상태가 자동으로 '답변완료'가 됩니다. */
export async function answerInquiryAction(
  id: string,
  answer: string,
  status: string
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!answer.trim()) return { ok: false, error: '답변 내용을 입력해 주세요.' };

  const nextStatus: InquiryStatus | undefined = isInquiryStatus(status)
    ? status
    : undefined;

  try {
    const inquiry = await getInquiryById(id);
    if (!inquiry) return { ok: false, error: '문의를 찾을 수 없습니다.' };

    await answerInquiry(id, answer, nextStatus);
    refresh(id);
    // 손님 화면(마이페이지·상품 상세)도 다시 굽습니다.
    revalidatePath('/mypage/inquiries');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '답변을 저장하지 못했습니다.');
  }
}

export async function updateInquiryStatusAction(
  id: string,
  status: string
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!isInquiryStatus(status)) return { ok: false, error: '알 수 없는 상태입니다.' };

  try {
    await updateInquiryStatus(id, status);
    refresh(id);
    revalidatePath('/mypage/inquiries');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '상태를 바꾸지 못했습니다.');
  }
}
