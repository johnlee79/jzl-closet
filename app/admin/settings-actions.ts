'use server';

import { cookies } from 'next/headers';
import { revalidatePath, revalidateTag } from 'next/cache';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { defaultCopyFor } from '@/lib/default-copy';
import {
  ANALYTICS_KEY,
  BRANDING_KEY,
  COPY_KEY,
  DESIGN_KEY,
  EVENT_KEY,
  PAYMENT_KEY,
  POINTS_KEY,
  REVIEW_KEY,
  SALES_KEY,
  SETTINGS_TAG,
  SHIPPING_KEY,
  STORE_KEY,
  getBranding,
  getCopySettings,
  normalizeAnalytics,
  normalizeDesign,
  normalizeEvent,
  normalizePayment,
  normalizePoints,
  normalizeReview,
  normalizeSales,
  normalizeShipping,
  normalizeStore,
  writeSetting,
} from '@/lib/settings';
import {
  COPY_META,
  GA4_ID_PATTERN,
  type AnalyticsSettings,
  type CopyKey,
  type CopySection,
  type DesignSettings,
  type EventSettings,
  type PaymentSettings,
  type PointSettings,
  type ReviewSettings,
  type SalesSettings,
  type ShippingSettings,
  type StoreSettings,
} from '@/lib/site-config';

/**
 * 설정 · 디자인 서버 액션.
 *
 * 저장하면 revalidateTag(SETTINGS_TAG) 로 캐시를 비우고,
 * revalidatePath 로 해당 페이지를 즉시 다시 굽습니다.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function assertAdmin(): Promise<boolean> {
  return verifySessionToken(cookies().get(ADMIN_COOKIE)?.value);
}

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : fallback;
  console.error('[admin/settings]', message);
  return { ok: false, error: message };
}

/** 스토어 정보·브랜딩은 푸터를 통해 모든 페이지에 실립니다. */
function revalidateEverything(): void {
  revalidateTag(SETTINGS_TAG);
  revalidatePath('/', 'layout');
}

/* ── 4-1. 스토어 정보 ─────────────────────────────────────── */

export async function saveStoreAction(input: StoreSettings): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (!input.name.trim()) return { ok: false, error: '브랜드명을 입력해 주세요.' };
  if (!input.phone.trim()) return { ok: false, error: '고객센터 번호를 입력해 주세요.' };

  try {
    // 빈 문장은 버리고, 형태가 깨진 값은 기본값으로 메웁니다.
    const value = normalizeStore({
      ...input,
      story: input.story.map((line) => line.trim()).filter(Boolean),
    });
    await writeSetting(STORE_KEY, value);
    revalidateEverything();
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '스토어 정보를 저장하지 못했습니다.');
  }
}

/* ── 4-2. 브랜딩 · 로고 ───────────────────────────────────── */

export async function saveLogoAction(url: string): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const branding = await getBranding();
    await writeSetting(BRANDING_KEY, {
      ...branding,
      logo: url.trim() ? { url: url.trim() } : null,
      updatedAt: new Date().toISOString(),
    });
    revalidateEverything();
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '로고를 저장하지 못했습니다.');
  }
}

/* ── 4-3. 배송·반품 ───────────────────────────────────────── */

export async function saveShippingAction(input: ShippingSettings): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (input.baseFee < 0 || input.freeThreshold < 0 || input.islandFee < 0) {
    return { ok: false, error: '금액은 0 이상으로 넣어 주세요.' };
  }

  try {
    await writeSetting(SHIPPING_KEY, normalizeShipping(input));
    revalidateTag(SETTINGS_TAG);
    revalidatePath('/guide');
    revalidatePath('/order');
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '배송 설정을 저장하지 못했습니다.');
  }
}

/* ── 2-A. 결제·주문 (입금 계좌 · 도서산간 · 알림 · 구매안전) ── */

export async function savePaymentAction(input: PaymentSettings): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const bankFilled = [input.bankName, input.accountNo, input.accountHolder].filter((value) =>
    value.trim()
  ).length;
  // 셋 중 일부만 채우면 주문 완료 화면에 반쪽짜리 계좌가 나옵니다.
  if (bankFilled > 0 && bankFilled < 3) {
    return { ok: false, error: '은행 · 계좌번호 · 예금주를 모두 입력해 주세요.' };
  }
  if (input.depositHours < 1) {
    return { ok: false, error: '입금 기한은 1시간 이상으로 넣어 주세요.' };
  }

  // 우편번호 규칙이 형식에 맞는지 확인합니다. (63000-63644 · 63* · 40200)
  const badRule = input.remoteAreaRules.find(
    (rule) => rule.trim() && !/^(\d{5}\s*-\s*\d{5}|\d{1,5}\*|\d{5})$/.test(rule.trim())
  );
  if (badRule) {
    return {
      ok: false,
      error: `우편번호 규칙 형식이 올바르지 않습니다: ${badRule} (예: 63000-63644 · 63* · 40200)`,
    };
  }

  try {
    await writeSetting(PAYMENT_KEY, normalizePayment(input));
    revalidateTag(SETTINGS_TAG);
    // 계좌·구매안전 문구는 주문 화면과 푸터에 실립니다.
    revalidatePath('/', 'layout');
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '결제 설정을 저장하지 못했습니다.');
  }
}

/* ── 3-A. 리뷰·포인트 ─────────────────────────────────────── */

export async function saveRewardAction(
  points: PointSettings,
  review: ReviewSettings
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (points.minUse < 0) return { ok: false, error: '최소 사용 금액은 0 이상이어야 합니다.' };
  if (points.purchase.amount < 0 || points.purchase.amount > 100) {
    return { ok: false, error: '구매 적립률은 0~100 사이로 넣어 주세요.' };
  }
  if (points.expireMonths < 0 || points.expireMonths > 120) {
    return { ok: false, error: '포인트 유효기간은 0~120개월 사이로 넣어 주세요.' };
  }
  if (points.popupIntervalHours < 1) {
    return { ok: false, error: '팝업 재표시 간격은 1시간 이상으로 넣어 주세요.' };
  }
  if (points.maxUseRate < 0 || points.maxUseRate > 100) {
    return { ok: false, error: '최대 사용 비율은 0~100 사이로 넣어 주세요.' };
  }
  if (review.tags.length === 0) {
    return { ok: false, error: '리뷰 태그를 하나 이상 남겨 주세요.' };
  }

  try {
    await writeSetting(POINTS_KEY, normalizePoints(points));
    await writeSetting(REVIEW_KEY, normalizeReview(review));

    revalidateTag(SETTINGS_TAG);
    // 적립 안내와 태그가 주문서·리뷰 작성 화면에 실립니다.
    revalidatePath('/', 'layout');
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '리뷰·포인트 설정을 저장하지 못했습니다.');
  }
}

/* ── 3-B. 판매정보 ────────────────────────────────────────── */

export async function saveSalesAction(input: SalesSettings): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await writeSetting(SALES_KEY, normalizeSales(input));
    revalidateTag(SETTINGS_TAG);
    // 전 상품의 [판매정보] 탭에 실립니다.
    revalidatePath('/products', 'page');
    revalidatePath('/', 'layout');
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '판매정보를 저장하지 못했습니다.');
  }
}

/* ── 3-B. 문구 · 이벤트 ───────────────────────────────────── */

export async function saveEventAction(input: EventSettings): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const ribbon = input.ribbon;
  if (ribbon.enabled && !ribbon.text.trim()) {
    return { ok: false, error: '띠배너 문구를 입력해 주세요.' };
  }
  if (ribbon.startsAt && ribbon.endsAt && ribbon.startsAt > ribbon.endsAt) {
    return { ok: false, error: '띠배너 노출 기간의 시작일이 종료일보다 늦습니다.' };
  }

  try {
    await writeSetting(EVENT_KEY, normalizeEvent(input));
    revalidateTag(SETTINGS_TAG);
    // 띠배너와 적립 안내는 모든 화면에 실립니다.
    revalidatePath('/', 'layout');
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '문구를 저장하지 못했습니다.');
  }
}

/* ── 6. GA4 ───────────────────────────────────────────────── */

export async function saveAnalyticsAction(
  input: AnalyticsSettings
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const id = input.ga4Id.trim();
  if (id && !GA4_ID_PATTERN.test(id)) {
    return {
      ok: false,
      error: '측정 ID 형식이 올바르지 않습니다. G- 로 시작하는 값을 넣어 주세요. (예: G-AB12CD34EF)',
    };
  }

  try {
    await writeSetting(ANALYTICS_KEY, normalizeAnalytics({ ga4Id: id }));
    revalidateEverything();
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '측정 ID 를 저장하지 못했습니다.');
  }
}

/* ── 5-1. 메인 배너 ───────────────────────────────────────── */

export async function saveDesignAction(input: DesignSettings): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const value = normalizeDesign(input);
    await writeSetting(DESIGN_KEY, value);
    revalidateTag(SETTINGS_TAG);
    revalidatePath('/');
    revalidatePath('/admin/design');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '배너를 저장하지 못했습니다.');
  }
}

/* ── 5-2. 사이트 문구 ─────────────────────────────────────── */

export async function saveCopyAction(
  key: CopyKey,
  section: CopySection
): Promise<ActionResult> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  const cleaned = section
    .map((block) => ({ heading: block.heading.trim(), body: block.body }))
    .filter((block) => block.heading || block.body.trim());

  if (cleaned.length === 0) {
    return {
      ok: false,
      error: '내용이 비어 있습니다. 지우려면 [기본값으로 되돌리기] 를 눌러 주세요.',
    };
  }

  try {
    const current = await getCopySettings();
    await writeSetting(COPY_KEY, { ...current, [key]: cleaned });

    revalidateTag(SETTINGS_TAG);
    revalidatePath(COPY_META[key].path);
    // 주문 3스텝은 메인에도 실립니다.
    if (key === 'orderSteps') revalidatePath('/');
    // 404 문구는 어느 주소에서도 나올 수 있어 전체를 갱신합니다.
    if (key === 'notFound') revalidatePath('/', 'layout');
    revalidatePath('/admin/design');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '문구를 저장하지 못했습니다.');
  }
}

/** 잘못 지웠을 때 원래 문구로 돌아갑니다. (lib/default-copy.ts 값) */
export async function resetCopyAction(key: CopyKey): Promise<ActionResult<CopySection>> {
  if (!(await assertAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const fallback = defaultCopyFor(key);
    const current = await getCopySettings();
    await writeSetting(COPY_KEY, { ...current, [key]: fallback });

    revalidateTag(SETTINGS_TAG);
    revalidatePath(COPY_META[key].path);
    if (key === 'orderSteps') revalidatePath('/');
    if (key === 'notFound') revalidatePath('/', 'layout');
    revalidatePath('/admin/design');
    return { ok: true, data: fallback };
  } catch (error) {
    return fail(error, '기본값으로 되돌리지 못했습니다.');
  }
}
