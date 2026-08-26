'use client';

/**
 * ============================================================
 * ★★ 「이 화면이 옛 정보일 수 있습니다」 경고 (2026-08-26)
 * ============================================================
 *
 * ★★ 왜 만들었는가
 *   관리자 회원 목록에 DB 에 없는 사람이 11명 뜬 일이 있었습니다.
 *   그때 화면은 이랬습니다.
 *       상단 「조건에 맞는 회원 3명」   ← 새것
 *       탭   「전체 3 활성 3」          ← 새것
 *       목록  11행                      ← 옛것
 *   한 화면에 두 시점이 섞여 있었는데, **화면만 봐서는 알 수 없었습니다.**
 *   사장님이 이상하다고 알려 주시기 전까지 아무도 몰랐습니다.
 *
 * ★★ 어떻게 알아채는가
 *   상단 숫자(건수 조회)와 목록 행 수(행 조회)는 **서로 다른 조회**입니다.
 *   한 페이지 안에 다 들어가는 상황이라면 둘은 반드시 같아야 합니다.
 *   다르면 둘 중 하나가 옛것입니다.
 *
 * ★ 페이지가 여러 장일 때는 당연히 다릅니다. 그때는 띄우지 않습니다.
 *   (예: 전체 49개인데 한 페이지에 20개)
 *
 * ★ 서버 로그에도 [stale] 로 한 줄 남깁니다. 화면을 못 본 뒤에도
 *   언제 났는지 찾을 수 있어야 합니다.
 */
export default function StaleWarning({
  /** 상단 숫자 — 건수 조회 결과 */
  total,
  /** 목록에 실제로 그려진 행 수 */
  shown,
  /** 전체 페이지 수. 1 이 아니면 다른 것이 정상입니다. */
  totalPages,
  /** 로그에 남길 화면 이름 */
  where,
}: {
  total: number;
  shown: number;
  totalPages: number;
  where: string;
}) {
  const mismatched = totalPages <= 1 && total !== shown;
  if (!mismatched) return null;

  /*
   * ★ 그리는 김에 남깁니다. 이 컴포넌트는 어긋났을 때만 그려지므로
   *   평소에는 로그가 한 줄도 안 쌓입니다.
   */
  if (typeof window !== 'undefined') {
    console.warn(`[stale] ${where} — 상단 ${total} · 목록 ${shown} 이 어긋납니다.`);
  } else {
    console.warn(`[stale] ${where} — 상단 ${total} · 목록 ${shown} 이 어긋납니다.`);
  }

  return (
    <div
      role="alert"
      className="admin-card mt-4 border-amber-300 bg-amber-50 p-4 text-[16px] leading-relaxed text-amber-900"
    >
      <p className="font-semibold">
        ⚠ 이 화면이 옛 정보를 보여주고 있을 수 있습니다. 새로고침해 주세요.
      </p>
      <p className="mt-1 text-[15px]">
        위에 적힌 수({total})와 실제 목록({shown}줄)이 다릅니다. 아래를 누르시면 지금 값을
        다시 받아옵니다.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="admin-btn mt-3"
      >
        새로고침
      </button>
    </div>
  );
}
