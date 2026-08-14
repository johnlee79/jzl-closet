'use client';

import { useEffect } from 'react';

/**
 * 인쇄 버튼. 화면을 열면 자동으로 인쇄 대화상자를 띄웁니다.
 * 인쇄 미리보기를 닫아도 화면은 그대로 남아 있어 다시 누를 수 있습니다.
 */
export default function PrintButton({ auto = true }: { auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    // 글꼴과 표가 자리를 잡은 뒤에 띄웁니다.
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [auto]);

  return (
    <button type="button" onClick={() => window.print()} className="admin-btn print:hidden">
      다시 인쇄
    </button>
  );
}
