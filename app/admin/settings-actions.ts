'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import { defaultCopyFor } from '@/lib/default-copy';
import {
  ANALYTICS_KEY,
  BRANDING_KEY,
  ABOUT_PAGE_KEY,
  COPY_KEY,
  HERO_BUTTONS_KEY,
  DESIGN_KEY,
  EVENT_KEY,
  PAYMENT_KEY,
  POINTS_KEY,
  REVIEW_KEY,
  SALES_KEY,
  SETTINGS_TAG,
  SHIPPING_KEY,
  SNS_KEY,
  STORE_KEY,
  getBranding,
  readStoredCopy,
  getDesignSettings,
  normalizeAnalytics,
  normalizeDesign,
  normalizeEvent,
  getPaymentSettings,
  normalizePayment,
  normalizePoints,
  normalizeReview,
  normalizeSales,
  normalizeShipping,
  normalizeSns,
  normalizeStore,
  writeSetting,
} from '@/lib/settings';
import {
  COPY_META,
  DEFAULT_HERO_BUTTONS,
  GA4_ID_PATTERN,
  PAYMENT_METHODS,
  SNS_ITEMS,
  type AnalyticsSettings,
  type CopyKey,
  type CopySection,
  type DesignSettings,
  type EventSettings,
  type HeroButtonsSettings,
  type MainSections,
  type PaymentSettings,
  type PointSettings,
  type ReviewSettings,
  type SalesSettings,
  type ShippingSettings,
  type SnsSettings,
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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  /*
   * ★★ 금액 칸을 하나라도 빠뜨리지 마세요.
   *   반품·교환 배송비는 나중에 추가되면서 이 검사에 들어오지 못했습니다.
   *   그래서 음수를 넣으면 여기를 그냥 통과하고, 저장할 때 normalizeShipping 이
   *   조용히 기본값으로 바꿔 놓았습니다. "저장했습니다" 가 뜨는데 새로고침하면
   *   내가 넣은 값도 아니고 이전 값도 아닌 숫자가 들어 있습니다.
   *   무엇이 잘못됐는지 알려 주지 않으면 운영자는 저장이 고장 난 줄 압니다.
   */
  const amounts: [string, number][] = [
    ['기본 배송비', input.baseFee],
    ['무료배송 기준', input.freeThreshold],
    ['제주·도서산간 추가', input.islandFee],
    ['반품 배송비', input.returnFee],
    ['교환 배송비', input.exchangeFee],
  ];
  const wrong = amounts.find(([, value]) => !Number.isFinite(value) || value < 0);
  if (wrong) {
    return {
      ok: false,
      error: `${wrong[0]}는 0 이상으로 넣어 주세요. 지금 값: ${wrong[1]}`,
    };
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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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

  /*
   * ★ 결제수단을 전부 끄면 주문 자체가 불가능해집니다. (4-A)
   *   화면에서도 막지만, 여기서 한 번 더 받칩니다.
   *   저장 버튼 한 번으로 사이트가 주문을 못 받는 상태가 되면 안 됩니다.
   */
  /*
   * ★ 코드에서 닫아 둔 수단(ready:false)은 세지 않습니다. (2026-08-25)
   *   저장값으로는 켜져 있어도 주문서에 나오지 않으므로, 그것만 켜 두고
   *   저장하면 "하나는 켜져 있다" 며 통과해 놓고 실제로는 주문을 못 받습니다.
   */
  const onCount = PAYMENT_METHODS.filter(
    (method) => method.ready && input.methods?.[method.key]
  ).length;
  if (onCount === 0) {
    return {
      ok: false,
      error: '결제수단을 전부 끄면 주문을 받을 수 없습니다. 최소 하나는 켜 주세요.',
    };
  }

  /*
   * ★ 무통장입금만 켜 두고 계좌를 비워 두면 아무도 주문할 수 없습니다.
   *   저장 시점에 알려 주지 않으면 손님이 주문서에서 막히고 나서야 알게 됩니다.
   */
  const onlyBank = onCount === 1 && input.methods?.bank_transfer === true;
  if (onlyBank && bankFilled < 3) {
    return {
      ok: false,
      error:
        '무통장입금만 켜져 있는데 입금 계좌가 비어 있습니다. 계좌를 채우거나 다른 결제수단을 켜 주세요.',
    };
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

/**
 * ============================================================
 * ** 수수료 두 개만 저장합니다 (2026-08-27)
 * ============================================================
 *
 * ** 수익 관리 화면에서 요율을 바꿔 저장할 때 씁니다.
 *   savePaymentAction 은 결제 설정을 통째로 받습니다. 수익 화면에는
 *   계좌·결제수단·우편번호 규칙이 없으니, 그것을 그대로 보내면
 *   빈 값으로 덮어써 가게가 주문을 못 받게 됩니다.
 *   그래서 **지금 저장된 값을 읽어 두 칸만 갈아 끼웁니다.**
 *
 * ** 저장하면 revalidateTag(SETTINGS_TAG) 로 캐시를 비웁니다.
 *   그래서 수익 화면 숫자가 즉시 다시 계산됩니다.
 *
 * * 값 범위는 normalizePayment 가 다시 한 번 다듬습니다. (0~100% · 0~10,000원)
 */
export async function saveFeesAction(input: {
  cardFeeRate: number;
  transferFee: number;
}): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (!Number.isFinite(input.cardFeeRate) || input.cardFeeRate < 0 || input.cardFeeRate > 100) {
    return { ok: false, error: '카드 수수료율은 0~100 사이로 넣어 주세요.' };
  }
  if (!Number.isFinite(input.transferFee) || input.transferFee < 0 || input.transferFee > 10000) {
    return { ok: false, error: '이체 수수료는 0~10,000원 사이로 넣어 주세요.' };
  }

  try {
    const current = await getPaymentSettings();
    await writeSetting(
      PAYMENT_KEY,
      normalizePayment({
        ...current,
        cardFeeRate: input.cardFeeRate,
        transferFee: input.transferFee,
      })
    );
    revalidateTag(SETTINGS_TAG);
    revalidatePath('/admin/profit');
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '수수료를 저장하지 못했습니다.');
  }
}

/* ── 3-A. 리뷰·포인트 ─────────────────────────────────────── */

export async function saveRewardAction(
  points: PointSettings,
  review: ReviewSettings
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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

/* ── 3-G. SNS ─────────────────────────────────────────────── */

export async function saveSnsAction(input: SnsSettings): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  /*
   * ★ 주소는 http(s) 만 받습니다.
   *   푸터는 사이트 전 페이지에 실리는 자리라, 여기 들어간 값은 어디에나 나갑니다.
   *   javascript: 같은 주소가 저장되면 링크가 그대로 실행 통로가 됩니다.
   *   normalizeSns 가 읽을 때도 한 번 더 거르지만, 저장 단계에서 이유를 알려 줍니다.
   */
  const bad = [
    ...SNS_ITEMS.map((item) => ({
      label: item.label,
      value: input.links[item.key] ?? '',
    })),
    { label: '위챗 QR 이미지', value: input.wechatQrUrl },
  ].find((entry) => entry.value.trim() && !/^https?:\/\//i.test(entry.value.trim()));

  if (bad) {
    return {
      ok: false,
      error: `${bad.label} 주소는 http:// 또는 https:// 로 시작해야 합니다. (지금 값: ${bad.value.trim()})`,
    };
  }

  try {
    await writeSetting(SNS_KEY, normalizeSns(input));
    revalidateTag(SETTINGS_TAG);
    // 푸터에 실리므로 전 페이지를 다시 굽습니다.
    revalidatePath('/', 'layout');
    revalidatePath('/admin/settings');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, 'SNS 설정을 저장하지 못했습니다.');
  }
}

/* ── 6. GA4 ───────────────────────────────────────────────── */

export async function saveAnalyticsAction(
  input: AnalyticsSettings
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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

/**
 * 메인 섹션 노출만 따로 저장합니다. (3-K)
 *
 * ★ 배너 목록은 건드리지 않습니다. 지금 저장된 값을 먼저 읽어 그대로 다시 씁니다.
 *   섹션 스위치를 저장했다고 운영자가 등록해 둔 배너가 사라지면 안 됩니다.
 */
export async function saveMainSectionsAction(
  sections: MainSections
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const current = await getDesignSettings();
    await writeSetting(DESIGN_KEY, normalizeDesign({ ...current, sections }));
    revalidateTag(SETTINGS_TAG);
    revalidatePath('/');
    revalidatePath('/admin/design');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '섹션 노출을 저장하지 못했습니다.');
  }
}

/**
 * 공유 미리보기 이미지(og:image)만 따로 저장합니다.
 *
 * ★ 배너·섹션 설정은 건드리지 않습니다. 지금 저장된 값을 먼저 읽어 그대로 다시 씁니다.
 *   design 은 한 덩어리로 저장되는 설정이라, 일부만 넘기면 나머지가 사라집니다.
 *
 * ★ 저장하면 즉시 반영되어야 합니다.
 *   공유 카드는 메신저가 우리 HTML 의 og:image 를 읽어 가는 방식이라
 *   페이지가 다시 구워지지 않으면 예전 주소가 계속 나갑니다.
 *   그래서 설정 태그를 무효화하고 레이아웃까지 통째로 다시 굽습니다.
 *   (og:image 를 내보내는 페이지가 메인·목록·약관 등 여러 곳에 흩어져 있습니다)
 */
export async function saveOgImageAction(imageUrl: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const current = await getDesignSettings();
    await writeSetting(
      DESIGN_KEY,
      normalizeDesign({ ...current, ogImageUrl: imageUrl.trim() })
    );
    revalidateTag(SETTINGS_TAG);
    // ★ og:image 를 쓰는 페이지가 여러 곳이라 레이아웃째 다시 굽습니다.
    revalidatePath('/', 'layout');
    revalidatePath('/admin/design');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '공유 미리보기 이미지를 저장하지 못했습니다.');
  }
}

/* ── 5-2. 사이트 문구 ─────────────────────────────────────── */

export async function saveCopyAction(
  key: CopyKey,
  section: CopySection
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

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
    /*
     * ★★ 저장된 것만 읽어서, 지금 고친 항목 하나만 얹습니다.
     *   예전에는 getCopySettings() 를 읽어 통째로 다시 썼습니다.
     *   그 값에는 저장되지 않은 항목까지 코드 기본값이 채워져 있어서,
     *   항목 하나를 저장하면 나머지 열일곱 개도 그 시점 값으로 DB 에 박혔습니다.
     *   그 뒤로는 코드 기본값을 고쳐도 화면이 바뀌지 않습니다.
     *   카드결제를 붙이고도 약관이 "즉시 결제를 제공하지 않습니다" 로
     *   남아 있던 것이 이것 때문입니다.
     */
    const stored = await readStoredCopy();
    await writeSetting(COPY_KEY, { ...stored, [key]: cleaned });

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

/* ── 5-4. 메인 히어로 버튼 (3-J) ──────────────────────────── */

/**
 * 메인 첫 화면 버튼 두 개의 문구와 링크.
 * ★ 두 번째 문구는 빈 값을 허용합니다. 비우면 버튼이 사라져야 하기 때문입니다.
 * ★ 링크는 비워 두면 저장하지 않습니다. 빈 주소를 걸어 두면 눌렀을 때 아무 데도 못 갑니다.
 */
export async function saveHeroButtonsAction(
  input: HeroButtonsSettings
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  if (!input.primaryLabel.trim()) {
    return { ok: false, error: '첫 번째 버튼 문구를 입력해 주세요.' };
  }
  if (!input.primaryHref.trim()) {
    return { ok: false, error: '첫 번째 버튼 링크를 입력해 주세요.' };
  }
  if (input.secondaryLabel.trim() && !input.secondaryHref.trim()) {
    return { ok: false, error: '두 번째 버튼 링크를 입력해 주세요. (문구를 비우면 버튼이 사라집니다)' };
  }

  try {
    await writeSetting(HERO_BUTTONS_KEY, {
      primaryLabel: input.primaryLabel.trim(),
      primaryHref: input.primaryHref.trim(),
      secondaryLabel: input.secondaryLabel.trim(),
      secondaryHref: input.secondaryHref.trim() || DEFAULT_HERO_BUTTONS.secondaryHref,
    });
    revalidateTag(SETTINGS_TAG);
    revalidatePath('/');
    revalidatePath('/admin/design');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '버튼 설정을 저장하지 못했습니다.');
  }
}

/* ── 5-3. 편집숍 소개 대표 이미지 (3-I) ───────────────────── */

/**
 * /about 대표 이미지 주소를 저장합니다. 업로드 자체는 기존 파이프라인
 * (/api/upload → R2)이 이미 끝낸 뒤라, 여기서는 주소만 받아 둡니다.
 * ★ 빈 문자열도 정상입니다. 비우면 /about 이 이미지 영역을 통째로 건너뜁니다.
 */
export async function saveAboutImageAction(imageUrl: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    await writeSetting(ABOUT_PAGE_KEY, { imageUrl: imageUrl.trim() });
    revalidateTag(SETTINGS_TAG);
    revalidatePath('/about');
    revalidatePath('/admin/design');
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error, '대표 이미지를 저장하지 못했습니다.');
  }
}

/**
 * 잘못 지웠을 때 원래 문구로 돌아갑니다. (lib/default-copy.ts 값)
 *
 * ★★ 기본값을 "저장" 하지 않고 저장해 둔 값을 "지웁니다".
 *   기본값을 적어 넣으면 그 순간의 문구가 DB 에 박혀, 나중에 코드 기본값을
 *   고쳐도 이 항목만 옛 문구로 남습니다. 되돌리기의 뜻은
 *   "코드 기본값을 따라간다" 이지 "지금 기본값을 베껴 둔다" 가 아닙니다.
 */
export async function resetCopyAction(key: CopyKey): Promise<ActionResult<CopySection>> {
  if (!(await isAdmin())) return { ok: false, error: '로그인이 필요합니다.' };

  try {
    const fallback = defaultCopyFor(key);
    const stored = await readStoredCopy();
    delete stored[key];
    await writeSetting(COPY_KEY, stored);

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
