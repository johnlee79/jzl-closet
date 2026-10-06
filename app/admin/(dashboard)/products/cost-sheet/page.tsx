import CostSheetMatcher from '@/components/admin/CostSheetMatcher';

/**
 * 뉴욕트렌딕 단가표 엑셀 ↔ 원가 등록 (1단계).
 *
 * ★ 55MB 파일을 브라우저에서 읽기 때문에 서버는 거의 하는 일이 없습니다.
 *   매칭 미리보기와 저장만 서버 액션으로.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '원가 엑셀 올리기' };

export default function CostSheetPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <h1 className="text-[24px] font-semibold text-slate-900">원가 엑셀 올리기</h1>
      <p className="mt-1 text-[15px] text-slate-600">
        뉴욕트렌딕 단가표 엑셀을 올려 상품 원가를 등록합니다. 한 번 짝지은 상품은 다음 달
        자동으로 매칭됩니다.
      </p>
      <div className="mt-5">
        <CostSheetMatcher />
      </div>
    </div>
  );
}
