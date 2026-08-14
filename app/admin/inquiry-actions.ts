'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { answerInquiry, getInquiryById, updateInquiryStatus } from '@/lib/inquiries';
import { isInquiryStatus, type InquiryStatus } from '@/lib/inquiry-status';
import { getProductSlugById } from '@/lib/products';

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
  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/inquiries');
  revalidatePath(`/admin/inquiries/${id}`);
  // 회원 화면은 동적 렌더링이라 항상 최신이지만, 명시해 두면 의도가 분명해집니다.
  revalidatePath('/mypage/inquiries');
}

/**
 * 상품 문의라면 그 상품 상세를 다시 굽습니다.
 *
 * ★ 상품 상세는 ISR(정적 생성)입니다. 여기서 무효화하지 않으면
 *   답변을 저장해도 Q&A 탭에는 다음 갱신 주기가 올 때까지 옛 내용이 남습니다.
 * ★ slug 를 클라이언트에서 받지 않고 서버에서 직접 찾습니다.
 *   화면마다 넘겨 주게 하면 한 곳만 빠뜨려도 조용히 반영이 안 됩니다.
 */
async function refreshProductPage(productId: string | null): Promise<void> {
  if (!productId) return;
  const slug = await getProductSlugById(productId);
  if (slug) revalidatePath(`/products/${slug}`);
}

/** 답변 저장 — 답변을 넣으면 상태가 자동으로 '답변완료'가 됩니다. */
export async function answerInquiryAction(
  id: string,
  answer: string,
  /** 'closed' 일 때만 그 상태를 유지합니다. 비워 두면 '답변완료'가 됩니다. */
  status = ''
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
    // ★ 상품 상세의 Q&A 탭에 답변이 바로 나타나게 합니다.
    await refreshProductPage(inquiry.productId);
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
    // 어느 상품 페이지를 다시 구울지 알아야 하므로 먼저 읽습니다.
    const inquiry = await getInquiryById(id);
    if (!inquiry) return { ok: false, error: '문의를 찾을 수 없습니다.' };

    await updateInquiryStatus(id, status);
    refresh(id);
    await refreshProductPage(inquiry.productId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '상태를 바꾸지 못했습니다.');
  }
}
