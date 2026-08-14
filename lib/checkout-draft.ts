'use client';

/**
 * 주문서 임시저장.
 *
 * ★ 왜 필요한가
 *   주소 검색이 멈춰 새로고침하면 입력하던 내용이 전부 날아갔습니다.
 *   뒤로가기·세션 만료에서도 같은 일이 생깁니다.
 *
 * ★ 저장하지 않는 것
 *   비밀번호·카드정보 같은 민감정보는 절대 담지 않습니다.
 *   여기 담기는 것은 배송에 필요한 값(이름·연락처·주소·요청사항·현금영수증)뿐입니다.
 *
 * ★ 24시간이 지난 저장본은 버립니다. 배송지가 바뀌었을 수 있습니다.
 * ★ 주문이 끝나면 즉시 지웁니다.
 */

const KEY = 'jzl-checkout-draft';
const MAX_AGE = 24 * 60 * 60 * 1000;

/** 저장해도 되는 항목만 추립니다. 새 칸이 늘어도 여기 없으면 저장되지 않습니다. */
export const DRAFT_FIELDS = [
  'ordererName',
  'ordererPhone',
  'ordererEmail',
  'sameAsOrderer',
  'receiverName',
  'receiverPhone',
  'postcode',
  'address1',
  'address2',
  'deliveryMemo',
  'cashReceiptType',
  'cashReceiptNo',
] as const;

export type DraftField = (typeof DRAFT_FIELDS)[number];

export type CheckoutDraft = Partial<Record<DraftField, string | boolean>>;

type Stored = { savedAt: number; values: CheckoutDraft };

/** 저장 대상만 골라 냅니다. */
export function pickDraft(form: Record<string, unknown>): CheckoutDraft {
  const draft: CheckoutDraft = {};
  for (const field of DRAFT_FIELDS) {
    const value = form[field];
    if (typeof value === 'string' || typeof value === 'boolean') {
      draft[field] = value;
    }
  }
  return draft;
}

/** 하나라도 채워진 값이 있는지 (빈 폼을 저장해 두면 안내만 뜨고 쓸모가 없습니다) */
export function hasContent(draft: CheckoutDraft): boolean {
  return DRAFT_FIELDS.some((field) => {
    const value = draft[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function saveDraft(draft: CheckoutDraft): void {
  if (typeof window === 'undefined') return;
  if (!hasContent(draft)) return;
  try {
    const payload: Stored = { savedAt: Date.now(), values: draft };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* 저장하지 못해도 주문 자체는 그대로 진행됩니다. */
  }
}

export function loadDraft(): CheckoutDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.values) {
      clearDraft();
      return null;
    }
    // 하루가 지났으면 버립니다.
    if (Date.now() - parsed.savedAt > MAX_AGE) {
      clearDraft();
      return null;
    }

    const draft = pickDraft(parsed.values as Record<string, unknown>);
    return hasContent(draft) ? draft : null;
  } catch {
    clearDraft();
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 지우지 못해도 24시간 뒤 자동으로 버려집니다. */
  }
}
