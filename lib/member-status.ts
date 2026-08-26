/**
 * ============================================================
 * ★★ 회원 상태 — 우리가 아는 값의 단 하나뿐인 목록 (2026-08-26)
 * ============================================================
 *
 * ★★ 왜 만들었는가
 *   같은 목록이 다섯 곳에 따로 적혀 있었습니다.
 *     lib/profiles.ts    타입 선언
 *     lib/profiles.ts    화면에 그릴 값으로 바꾸는 곳 (toStatus)
 *     lib/profiles.ts    상태별로 세는 곳
 *     app/admin/member-actions.ts   저장할 때 검사하는 곳
 *     components/admin/MemberDetail.tsx  상세 화면 선택지
 *   그리고 그중 하나가 달랐습니다. 세는 쪽은 정확히 세 값만 세는데,
 *   그리는 쪽은 **모르는 값을 전부 「활성」으로 바꿔** 버렸습니다.
 *
 *   그래서 이상한 값이 든 행이 있어도 화면에는 멀쩡한 활성 회원으로
 *   보였고, 탭 숫자와 목록 건수만 어긋났습니다. 왜 어긋나는지는
 *   화면 어디에도 드러나지 않았습니다.
 *
 * ★ 서버·클라이언트가 함께 씁니다. 그래서 값만 두고 server-only 를
 *   들여오지 않습니다. lib/inquiry-status.ts 와 같은 구조입니다.
 *   (lib/profiles.ts 는 server-only 라 화면 파일에서 못 가져옵니다)
 */

export const MEMBER_STATUSES = ['active', 'inactive', 'withdrawn'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active: '활성',
  inactive: '비활성',
  withdrawn: '탈퇴',
};

/** 우리가 아는 값인지. 모르면 false 입니다. */
export function isKnownMemberStatus(value: string): value is MemberStatus {
  return (MEMBER_STATUSES as readonly string[]).includes(value);
}

/**
 * 화면에 보여 줄 이름.
 *
 * ★★ 모르는 값을 「활성」으로 바꾸지 않습니다. 있는 그대로 드러냅니다.
 *   전에는 조용히 활성으로 바꿔서, 이상한 값이 들어와도 아무도 몰랐습니다.
 *   빨간 딱지로 눈에 걸리게 하고 원래 값을 그대로 붙여 줍니다.
 *   그래야 사장님이 화면만 보고도 무엇이 들어왔는지 알려 주실 수 있습니다.
 *
 * ★ 값이 비어 있을 때(NULL) 도 딱지가 사라지지 않게 「비어 있음」 이라고
 *   적습니다. 빈 딱지는 아무것도 안 보이는 것과 같습니다.
 */
export function memberStatusLabel(status: string): string {
  if (isKnownMemberStatus(status)) return MEMBER_STATUS_LABEL[status];
  return `알 수 없음 · ${status.trim() || '비어 있음'}`;
}

/** 관리자 화면 딱지 색. 모르는 값은 빨강입니다. */
export function memberStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'inactive':
      return 'bg-amber-100 text-amber-800';
    case 'withdrawn':
      return 'bg-slate-100 text-slate-600';
    default:
      // ★ 모르는 값은 눈에 걸려야 합니다. 회색으로 두면 그냥 지나칩니다.
      return 'bg-red-100 text-red-800';
  }
}
