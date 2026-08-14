/**
 * 1:1 문의 — 상태와 유형. 서버·클라이언트 공용(순수 값만) 입니다.
 */

export const INQUIRY_STATUSES = ['pending', 'answered', 'closed'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_META: Record<
  InquiryStatus,
  { label: string; tone: 'wait' | 'done' | 'closed' }
> = {
  pending: { label: '미답변', tone: 'wait' },
  answered: { label: '답변완료', tone: 'done' },
  closed: { label: '종료', tone: 'closed' },
};

export function inquiryStatusLabel(status: string): string {
  return INQUIRY_STATUS_META[status as InquiryStatus]?.label ?? status;
}

export function isInquiryStatus(value: string): value is InquiryStatus {
  return (INQUIRY_STATUSES as readonly string[]).includes(value);
}

export function inquiryBadgeClass(status: string): string {
  switch (INQUIRY_STATUS_META[status as InquiryStatus]?.tone) {
    case 'wait':
      return 'bg-amber-100 text-amber-800';
    case 'done':
      return 'bg-green-100 text-green-800';
    case 'closed':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

/** 관리자 목록의 상태 탭 */
export const INQUIRY_TABS: { key: InquiryStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  ...INQUIRY_STATUSES.map((status) => ({
    key: status,
    label: INQUIRY_STATUS_META[status].label,
  })),
];

/* ── 문의 유형 ────────────────────────────────────────────── */

export const INQUIRY_CATEGORIES = [
  { key: 'order', label: '주문/배송' },
  { key: 'exchange', label: '교환/반품' },
  { key: 'product', label: '상품' },
  { key: 'etc', label: '기타' },
] as const;

export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number]['key'];

export function inquiryCategoryLabel(category: string): string {
  return INQUIRY_CATEGORIES.find((item) => item.key === category)?.label ?? category;
}

export function isInquiryCategory(value: string): value is InquiryCategory {
  return INQUIRY_CATEGORIES.some((item) => item.key === value);
}

/** 첨부 이미지 최대 장수 */
export const MAX_ATTACHMENTS = 3;
