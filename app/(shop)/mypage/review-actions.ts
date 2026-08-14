'use server';

import { revalidatePath } from 'next/cache';
import { getActiveMember } from '@/lib/auth';
import { getOrderOfUser } from '@/lib/orders';
import { earnReviewPoints } from '@/lib/points';
import {
  DuplicateReviewError,
  createReview,
  hasReviewed,
  type Review,
} from '@/lib/reviews';
import { getReviewSettings } from '@/lib/settings';
import { MAX_REVIEW_ATTACHMENTS, MAX_REVIEW_LENGTH } from '@/lib/site-config';
import { notifyNewReview } from '@/lib/telegram';

/**
 * 회원 리뷰 작성.
 *
 * ★ 어떤 값도 클라이언트를 믿지 않습니다.
 *   본인 주문인지, 배송이 끝났는지, 이미 썼는지 모두 서버에서 다시 확인합니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ReviewFormInput = {
  orderId: string;
  productSlug: string;
  rating: number;
  tags: string[];
  content: string;
  attachments: string[];
};

/** 리뷰를 쓸 수 있는 주문 상태 */
const REVIEWABLE = ['delivered', 'confirmed'];

export async function submitReviewAction(
  input: ReviewFormInput
): Promise<ActionResult<{ earned: number }>> {
  const member = await getActiveMember();
  if (!member) return { ok: false, error: '로그인이 필요합니다.' };

  const rating = Math.trunc(input.rating);
  if (rating < 1 || rating > 5) return { ok: false, error: '별점을 선택해 주세요.' };

  const content = input.content.trim();
  if (!content) return { ok: false, error: '후기 내용을 입력해 주세요.' };
  if (content.length > MAX_REVIEW_LENGTH) {
    return { ok: false, error: `후기는 ${MAX_REVIEW_LENGTH}자 이내로 써 주세요.` };
  }

  // ★ 본인 주문인지 서버에서 다시 확인합니다.
  const order = await getOrderOfUser(member.user.id, input.orderId);
  if (!order) return { ok: false, error: '주문을 찾을 수 없습니다.' };

  if (!REVIEWABLE.includes(order.status)) {
    return { ok: false, error: '배송이 완료된 주문에만 후기를 남기실 수 있습니다.' };
  }

  // 이 주문에 실제로 들어 있는 상품인지 확인합니다.
  const item = order.items.find(
    (entry) => entry.productSlug === input.productSlug && entry.itemStatus === 'normal'
  );
  if (!item) return { ok: false, error: '이 주문에 없는 상품입니다.' };
  if (!item.productId) {
    return { ok: false, error: '상품 정보를 찾지 못했습니다. 고객센터로 문의해 주세요.' };
  }

  if (await hasReviewed(order.id, item.productId)) {
    return { ok: false, error: '이미 이 상품의 후기를 남기셨습니다.' };
  }

  // 태그는 설정에 있는 것만 받습니다.
  const settings = await getReviewSettings();
  const allowed = new Set(settings.tags);
  const tags = input.tags.filter((tag) => allowed.has(tag));

  const attachments = input.attachments.slice(0, MAX_REVIEW_ATTACHMENTS);

  let review: Review;
  try {
    review = await createReview({
      productId: item.productId,
      productSlug: item.productSlug,
      userId: member.user.id,
      orderId: order.id,
      writerName: member.profile.name,
      rating,
      tags,
      content,
      attachments,
      // 회원이 직접 쓴 후기라 체험단이 아닙니다.
      isSponsored: false,
    });
  } catch (error) {
    if (error instanceof DuplicateReviewError) {
      return { ok: false, error: error.message };
    }
    const message = error instanceof Error ? error.message : '후기를 저장하지 못했습니다.';
    console.error('[review]', message);
    return { ok: false, error: message };
  }

  // 포인트 적립 — 실패해도 후기는 이미 저장되어 있습니다.
  const earned = await earnReviewPoints(
    member.user.id,
    review.id,
    attachments.length > 0
  );

  // 알림 — 실패해도 후기 저장을 막지 않습니다.
  if (settings.telegramEnabled) {
    try {
      await notifyNewReview(review, item.productName);
    } catch (error) {
      console.warn('[review] 텔레그램 알림 실패:', error);
    }
  }

  revalidatePath(`/products/${item.productSlug}`);
  revalidatePath('/mypage/orders');
  revalidatePath('/mypage/points');
  revalidatePath('/admin/reviews');
  revalidatePath('/admin');

  return { ok: true, data: { earned } };
}
