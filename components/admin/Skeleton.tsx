/**
 * 관리자 로딩 스켈레톤.
 *
 * ★ 빈 화면 대신 구조가 먼저 보이게 합니다.
 *   서울 리전으로 옮겨도 첫 조회는 어느 정도 걸립니다.
 *   화면이 통째로 비어 있으면 실제보다 훨씬 느리게 느껴집니다.
 * ★ 순수 표시용이라 클라이언트 컴포넌트로 만들지 않습니다.
 */

function Bar({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-slate-200 ${className}`}
    />
  );
}

/** 목록 화면 — 제목 · 필터 · 표 */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="mx-auto w-full max-w-[1280px]" role="status" aria-label="불러오는 중">
      <Bar className="h-6 w-40" />
      <Bar className="mt-3 h-4 w-64" />

      <div className="admin-card mt-5 p-4">
        <div className="flex flex-wrap gap-2">
          <Bar className="h-9 w-24" />
          <Bar className="h-9 w-24" />
          <Bar className="h-9 w-24" />
        </div>
      </div>

      <div className="admin-card mt-4 overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <Bar className="h-4 w-full max-w-[420px]" />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-b-0"
          >
            <Bar className="h-4 w-[110px] shrink-0" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-[90px] shrink-0" />
            <Bar className="h-5 w-[60px] shrink-0" />
          </div>
        ))}
      </div>

      <span className="sr-only">불러오는 중입니다.</span>
    </div>
  );
}

/** 카드가 늘어선 화면 — 대시보드·통계 */
export function CardsSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="mx-auto w-full max-w-[1280px]" role="status" aria-label="불러오는 중">
      <Bar className="h-6 w-40" />
      <Bar className="mt-3 h-4 w-64" />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="admin-card p-4">
            <Bar className="h-3.5 w-24" />
            <Bar className="mt-3 h-7 w-32" />
          </div>
        ))}
      </div>

      <div className="admin-card mt-8 p-4">
        <Bar className="h-4 w-40" />
        <Bar className="mt-4 h-4 w-full" />
        <Bar className="mt-2 h-4 w-full" />
        <Bar className="mt-2 h-4 w-2/3" />
      </div>

      <span className="sr-only">불러오는 중입니다.</span>
    </div>
  );
}

/** 편집 화면 — 설정·상품 등록 */
export function FormSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[900px]" role="status" aria-label="불러오는 중">
      <Bar className="h-6 w-32" />
      <Bar className="mt-3 h-4 w-72" />

      <div className="admin-card mt-5 p-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="mb-5 last:mb-0">
            <Bar className="h-3.5 w-24" />
            <Bar className="mt-2 h-10 w-full" />
          </div>
        ))}
      </div>

      <span className="sr-only">불러오는 중입니다.</span>
    </div>
  );
}
