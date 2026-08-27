'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import {
  NOTICE_TAG,
  createNotice,
  deleteNotice,
  updateNotice,
  type NoticeInput,
} from '@/lib/notices';
import { changePoints } from '@/lib/points';
import { getProductBySlug } from '@/lib/products';
import {
  POPUP_TAG,
  createPopup,
  deletePopup,
  updatePopup,
  type PopupInput,
} from '@/lib/popups';
import {
  createReview,
  deleteReview,
  replyToReview,
  setReviewVisible,
} from '@/lib/reviews';
import { getReviewSettings } from '@/lib/settings';
import { MAX_REVIEW_ATTACHMENTS, MAX_REVIEW_LENGTH } from '@/lib/site-config';

/**
 * 관리자 — 리뷰 · 공지 · 팝업 · 포인트 수동 조정.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin/content]', message);
  return { ok: false, error: message };
}

/* ==================================================================
 * 리뷰
 * ================================================================== */

export async function toggleReviewAction(
  id: string,
  visible: boolean,
  productSlug: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await setReviewVisible(id, visible);
    revalidatePath('/admin/reviews');
    revalidatePath(`/products/${productSlug}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '노출 설정을 바꾸지 못했습니다.');
  }
}

export async function replyReviewAction(
  id: string,
  reply: string,
  productSlug: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await replyToReview(id, reply);
    revalidatePath('/admin/reviews');
    revalidatePath(`/products/${productSlug}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '답변을 저장하지 못했습니다.');
  }
}

export async function deleteReviewAction(
  id: string,
  productSlug: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await deleteReview(id);
    revalidatePath('/admin/reviews');
    revalidatePath(`/products/${productSlug}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '리뷰를 삭제하지 못했습니다.');
  }
}

/**
 * 관리자가 직접 등록하는 리뷰 (체험단·서포터즈 후기 대신 입력).
 *
 * ★ user_id 는 항상 null 입니다. 포인트도 적립하지 않고 알림도 보내지 않습니다.
 * ★ isSponsored 를 끄면 "※ 제품을 무상으로 제공받아 작성된 후기입니다" 가
 *   프론트에 나오지 않습니다. 화면에서 확인 창을 띄우고 있습니다.
 */
export async function createAdminReviewAction(input: {
  productSlug: string;
  writerName: string;
  rating: number;
  tags: string[];
  content: string;
  attachments: string[];
  isSponsored: boolean;
  /**
   * 화면에 보여 줄 작성일. 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:mm'.
   * 비워 두면 지금 시각을 씁니다.
   */
  writtenAt?: string;
}): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const rating = Math.trunc(input.rating);
  if (rating < 1 || rating > 5) return { ok: false, error: '별점을 선택해 주세요.' };
  if (!input.writerName.trim()) return { ok: false, error: '작성자 이름을 입력해 주세요.' };

  const content = input.content.trim();
  if (!content) return { ok: false, error: '후기 내용을 입력해 주세요.' };
  if (content.length > MAX_REVIEW_LENGTH) {
    return { ok: false, error: `후기는 ${MAX_REVIEW_LENGTH}자 이내로 써 주세요.` };
  }

  const product = await getProductBySlug(input.productSlug);
  if (!product) return { ok: false, error: '상품을 찾을 수 없습니다.' };

  // ★ 작성일 — 미래 날짜는 받지 않습니다. 최신순에서 영원히 맨 위에 붙습니다.
  let writtenAt = '';
  if (input.writtenAt?.trim()) {
    const raw = input.writtenAt.trim();
    // 시간을 비우면 그날 정오로 둡니다. (00:00 이면 같은 날 후기 사이에서 항상 뒤로 밀립니다)
    const parsed = new Date(raw.includes('T') ? raw : `${raw}T12:00`);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: '작성일 형식을 확인해 주세요.' };
    }
    if (parsed.getTime() > Date.now()) {
      return { ok: false, error: '작성일을 미래로 지정할 수 없습니다.' };
    }
    writtenAt = parsed.toISOString();
  }

  // 태그는 설정에 있는 것만 받습니다.
  const settings = await getReviewSettings();
  const allowed = new Set(settings.tags);
  const tags = input.tags.filter((tag) => allowed.has(tag));

  try {
    await createReview({
      productId: product.id,
      productSlug: product.slug,
      // ★ 실제 주문과 연결되지 않은 후기입니다.
      userId: null,
      orderId: null,
      writerName: input.writerName,
      rating,
      tags,
      content,
      attachments: input.attachments.slice(0, MAX_REVIEW_ATTACHMENTS),
      isSponsored: input.isSponsored,
      writtenAt,
    });
  } catch (error) {
    return fail(error, '리뷰를 저장하지 못했습니다.');
  }

  revalidatePath('/admin/reviews');
  revalidatePath(`/products/${product.slug}`);
  return { ok: true, data: undefined };
}

/* ==================================================================
 * 공지사항
 * ================================================================== */

function refreshNotices(id?: string): void {
  revalidateTag(NOTICE_TAG);
  revalidatePath('/notice');
  revalidatePath('/sitemap.xml');
  if (id) revalidatePath(`/notice/${id}`);
  revalidatePath('/admin/notices');
}

export async function saveNoticeAction(
  input: NoticeInput,
  id?: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const isFaq = input.kind === 'faq';

  if (!input.title.trim()) {
    return { ok: false, error: isFaq ? '질문을 입력해 주세요.' : '제목을 입력해 주세요.' };
  }

  /*
   * ** 자주 묻는 질문은 답변이 비어 있어도 저장됩니다. (사장님 지시)
   *   질문만 먼저 넣어 두고 답변은 나중에 쓰시기 때문입니다.
   *   답변이 빈 동안에는 그 질문이 채팅에 아예 안 보입니다.
   *   (lib/notices.ts 의 getVisibleFaqs)
   * ** 공지는 지금까지대로 내용이 있어야 합니다. 빈 공지는 손님 공지
   *   목록에 제목만 뜨고 눌러도 아무것도 없는 화면이 됩니다.
   */
  if (!isFaq && !input.content.trim()) {
    return { ok: false, error: '내용을 입력해 주세요.' };
  }

  try {
    if (id) await updateNotice(id, input);
    else await createNotice(input);
    refreshNotices(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '공지를 저장하지 못했습니다.');
  }
}

export async function deleteNoticeAction(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await deleteNotice(id);
    refreshNotices(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '공지를 삭제하지 못했습니다.');
  }
}

/* ==================================================================
 * 팝업
 * ================================================================== */

function refreshPopups(): void {
  revalidateTag(POPUP_TAG);
  // 팝업은 모든 화면에 뜰 수 있어 전체를 다시 굽습니다.
  revalidatePath('/', 'layout');
  revalidatePath('/admin/popups');
}

export async function savePopupAction(
  input: PopupInput,
  id?: string
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };
  if (!input.title.trim()) return { ok: false, error: '제목을 입력해 주세요.' };
  if (!input.imageUrl.trim() && !input.content.trim()) {
    return { ok: false, error: '이미지나 내용 중 하나는 넣어 주세요.' };
  }
  if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) {
    return { ok: false, error: '노출 시작일이 종료일보다 늦습니다.' };
  }

  try {
    if (id) await updatePopup(id, input);
    else await createPopup(input);
    refreshPopups();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '팝업을 저장하지 못했습니다.');
  }
}

export async function deletePopupAction(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await deletePopup(id);
    refreshPopups();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '팝업을 삭제하지 못했습니다.');
  }
}

/* ==================================================================
 * 포인트 수동 지급·차감
 * ================================================================== */

export async function adjustPointsAction(
  userId: string,
  amount: number,
  memo: string
): Promise<ActionResult<{ balance: number }>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const value = Math.trunc(Number(amount) || 0);
  if (value === 0) return { ok: false, error: '지급하거나 차감할 금액을 입력해 주세요.' };
  // ★ 사유를 반드시 남깁니다. 나중에 왜 조정했는지 알 수 있어야 합니다.
  if (!memo.trim()) return { ok: false, error: '조정 사유를 입력해 주세요.' };

  try {
    const balance = await changePoints(userId, value, 'admin', memo.trim(), null);
    revalidatePath(`/admin/members/${userId}`);
    revalidatePath('/mypage/points');
    return { ok: true, data: { balance: balance ?? 0 } };
  } catch (error) {
    return fail(error, '포인트를 조정하지 못했습니다.');
  }
}
