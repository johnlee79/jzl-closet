'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile, getCurrentUser } from '@/lib/auth';
import {
  createInquiry,
  getInquiryForLookup,
  type Inquiry,
} from '@/lib/inquiries';
import { isInquiryCategory, MAX_ATTACHMENTS } from '@/lib/inquiry-status';
import { getOrderByNo, getOrderForLookup, getOrderOfUser } from '@/lib/orders';
import { getProductById } from '@/lib/products';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getPaymentSettings } from '@/lib/settings';
import { notifyNewInquiry } from '@/lib/telegram';

/**
 * 1:1 문의 서버 액션.
 *
 * ★ 회원 여부는 클라이언트가 보낸 값이 아니라 세션에서 직접 읽습니다.
 * ★ 관련 주문을 붙일 때도 "정말 그 사람의 주문인지" 서버에서 확인합니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type InquiryFormInput = {
  category: string;
  title: string;
  content: string;
  writerName: string;
  writerPhone: string;
  writerEmail: string;
  /** 비회원만 씁니다. 조회할 때 쓰는 비밀번호입니다. */
  password: string;
  isSecret: boolean;
  attachments: string[];
  /** 회원이 고른 주문 id */
  orderId: string;
  /** 비회원이 입력한 주문번호 */
  orderNo: string;
  /** 상품 문의면 상품 uuid. slug 는 서버가 직접 찾으므로 받지 않습니다. */
  productId: string;
};

export async function submitInquiryAction(
  input: InquiryFormInput
): Promise<ActionResult<{ inquiryNo: string; isMember: boolean }>> {
  const limited = rateLimit(`inquiry:${clientIp(headers())}`, 5, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `문의 등록이 너무 잦습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  if (!isInquiryCategory(input.category)) {
    return { ok: false, error: '문의 유형을 선택해 주세요.' };
  }
  if (!input.title.trim()) return { ok: false, error: '제목을 입력해 주세요.' };
  if (!input.content.trim()) return { ok: false, error: '내용을 입력해 주세요.' };
  if (input.title.trim().length > 120) {
    return { ok: false, error: '제목은 120자 이내로 입력해 주세요.' };
  }

  const user = await getCurrentUser();
  const profile = user ? await getCurrentProfile() : null;
  const isMember = Boolean(user && profile && profile.status === 'active');

  // 회원이면 저장된 정보를 씁니다. 비회원은 입력값을 검증합니다.
  const writerName = isMember ? profile!.name : input.writerName.trim();
  const writerPhone = isMember ? profile!.phone : input.writerPhone.trim();
  const writerEmail = isMember
    ? profile!.email || user!.email
    : input.writerEmail.trim();

  if (!writerName) return { ok: false, error: '이름을 입력해 주세요.' };

  if (!isMember) {
    if (!writerPhone && !writerEmail) {
      return { ok: false, error: '연락처나 이메일 중 하나는 입력해 주세요.' };
    }
    if (input.password.trim().length < 4) {
      return { ok: false, error: '조회용 비밀번호를 4자 이상 입력해 주세요.' };
    }
  }

  /* ── 관련 주문 확인 ─────────────────────────────────── */
  let orderId: string | null = null;
  if (isMember && input.orderId) {
    // ★ 정말 본인 주문인지 확인합니다.
    const order = await getOrderOfUser(user!.id, input.orderId);
    if (!order) return { ok: false, error: '선택한 주문을 찾을 수 없습니다.' };
    orderId = order.id;
  } else if (!isMember && input.orderNo.trim()) {
    // 비회원은 주문번호 + 연락처가 맞을 때만 연결합니다.
    const order = writerPhone
      ? await getOrderForLookup(input.orderNo, writerPhone)
      : await getOrderByNo(input.orderNo.trim().toUpperCase());
    if (!order) {
      return {
        ok: false,
        error: '주문번호를 확인해 주세요. 주문 시 입력하신 연락처와 함께 확인합니다.',
      };
    }
    orderId = order.id;
  }

  /* ── 저장 ───────────────────────────────────────────── */
  let inquiry: Inquiry;
  try {
    inquiry = await createInquiry({
      userId: isMember ? user!.id : null,
      orderId,
      productId: input.productId || null,
      category: input.category,
      title: input.title,
      content: input.content,
      writerName,
      writerPhone,
      writerEmail,
      password: input.password,
      isSecret: input.isSecret,
      attachments: input.attachments.slice(0, MAX_ATTACHMENTS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문의를 저장하지 못했습니다.';
    console.error('[inquiry]', message);
    return { ok: false, error: message };
  }

  // 상품 문의면 어느 상품인지 서버에서 직접 찾습니다.
  // ★ 화면이 slug 를 넘겨 주게 하면 한 곳만 빠뜨려도 조용히 반영이 안 됩니다.
  //   실제로 /inquiry/new 폼은 slug 를 넘기지 않아 상품 페이지가 갱신되지 않았습니다.
  const product = inquiry.productId ? await getProductById(inquiry.productId) : null;

  // ★ 알림 실패가 문의 저장을 막으면 안 됩니다. 이미 저장은 끝났습니다.
  const payment = await getPaymentSettings();
  if (payment.inquiryTelegramEnabled) {
    try {
      await notifyNewInquiry(inquiry, product?.name ?? '');
    } catch (error) {
      console.warn('[inquiry] 텔레그램 알림 실패:', error);
    }
  }

  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/inquiries');
  if (isMember) revalidatePath('/mypage/inquiries');
  // 상품 상세의 Q&A 탭에 바로 나타나게 합니다.
  if (product) revalidatePath(`/products/${product.slug}`);

  return { ok: true, data: { inquiryNo: inquiry.inquiryNo, isMember } };
}

/* ── 비회원 문의 조회 ─────────────────────────────────────── */

export async function lookupInquiryAction(
  inquiryNo: string,
  password: string
): Promise<ActionResult<Inquiry>> {
  // 문의번호를 하나씩 바꿔가며 두드리는 시도를 막습니다.
  const limited = rateLimit(`inquiry-lookup:${clientIp(headers())}`, 10, 60_000);
  if (!limited.ok) {
    return {
      ok: false,
      error: `조회 시도가 너무 많습니다. ${limited.retryAfter}초 뒤에 다시 시도해 주세요.`,
    };
  }

  if (!inquiryNo.trim() || !password.trim()) {
    return { ok: false, error: '문의번호와 비밀번호를 모두 입력해 주세요.' };
  }

  const inquiry = await getInquiryForLookup(inquiryNo, password);
  if (!inquiry) {
    // 문의번호가 있는지 없는지 알려 주지 않습니다.
    return { ok: false, error: '문의번호와 비밀번호가 일치하는 문의를 찾지 못했습니다.' };
  }

  return { ok: true, data: inquiry };
}
