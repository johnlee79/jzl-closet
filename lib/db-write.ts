import 'server-only';

/**
 * update · delete 가 실제로 몇 행을 건드렸는지 확인합니다.
 *
 * ★ Supabase 는 조건에 맞는 행이 없거나 RLS 에 막히면 에러 없이 "0건 처리" 로 돌려줍니다.
 *   그대로 두면 화면에 "저장했습니다" 초록 메시지만 뜨고 실제로는 아무것도 바뀌지 않습니다.
 *   그래서 관리자 쓰기 경로는 전부 .select('id') 를 붙여 이 함수로 확인합니다.
 */

type WriteResult = {
  error: { message: string; code?: string } | null;
  data: unknown[] | null;
};

export function assertWritten(result: WriteResult, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (!result.data || result.data.length === 0) {
    throw new Error(
      `${what}: 대상을 찾지 못해 아무것도 저장되지 않았습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.`
    );
  }
}

/** 몇 건이 바뀌었는지 알아야 하는 일괄 처리용. */
export function countWritten(result: WriteResult, what: string): number {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data?.length ?? 0;
}
