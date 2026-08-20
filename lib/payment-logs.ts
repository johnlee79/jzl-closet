import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * KSNET 과 주고받은 원문 보관.
 *
 * ★ 왜 원문을 그대로 남기는가
 *   ① 노티(거래내역통보) 규격을 아직 확정할 수 없습니다.
 *      나중에 실제로 들어온 데이터를 보고 파싱을 맞춰야 합니다.
 *      우리가 해석한 결과만 남기면, 해석이 틀렸을 때 되짚을 방법이 없습니다.
 *   ② 돈이 오간 뒤 분쟁이 나면 "그때 PG 가 뭐라고 답했는지" 가 유일한 근거입니다.
 *
 * ★ 이 함수는 절대 예외를 던지지 않습니다.
 *   로그를 못 남겼다고 결제 처리가 멈추면 안 됩니다.
 *   반대로 결제 처리가 실패해도 로그는 남아야 하므로, 호출부는 로그를 먼저 씁니다.
 */

const TABLE = 'payment_logs';

export type PaymentLogKind =
  /** 결제창에서 우리 서버로 돌아온 원문 */
  | 'return'
  /** recv_post.jsp 승인 확인 결과 */
  | 'approve'
  /** 승인 확인 재시도 */
  | 'approve_retry'
  /** 노티(거래내역통보) 수신 */
  | 'notify'
  /** 금액·주문번호 대조 실패 */
  | 'mismatch'
  /** 통신·파싱 실패 */
  | 'error';

export type PaymentLogInput = {
  kind: PaymentLogKind;
  orderId?: string | null;
  orderNo?: string | null;
  authyn?: string | null;
  amount?: number | null;
  trno?: string | null;
  raw?: string | null;
  parsed?: unknown;
  remoteIp?: string | null;
  note?: string | null;
};

export async function writePaymentLog(input: PaymentLogInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const { error } = await supabase.from(TABLE).insert({
      kind: input.kind,
      order_id: input.orderId ?? null,
      order_no: input.orderNo ?? null,
      authyn: input.authyn ?? null,
      amount: typeof input.amount === 'number' ? input.amount : null,
      trno: input.trno ?? null,
      // 원문이 아주 길게 올 수도 있어 상한을 둡니다. 잘린 사실은 note 에 남습니다.
      raw: input.raw ? input.raw.slice(0, 20_000) : null,
      parsed: input.parsed ?? null,
      remote_ip: input.remoteIp ?? null,
      note: input.note ?? null,
    });
    if (error) console.warn('[payment-logs] 저장 실패:', error.message);
  } catch (error) {
    // 표가 아직 없을 수도 있습니다. (supabase/schema-4a.sql 미실행)
    console.warn('[payment-logs] 저장 중 오류:', error);
  }
}

/** 관리자 주문 상세에서 그 주문의 결제 로그를 봅니다. */
export type PaymentLog = {
  id: string;
  kind: string;
  authyn: string;
  amount: number | null;
  trno: string;
  raw: string;
  note: string;
  remoteIp: string;
  createdAt: string | null;
};

type PaymentLogRow = {
  id: string;
  kind: string;
  authyn: string | null;
  amount: number | null;
  trno: string | null;
  raw: string | null;
  note: string | null;
  remote_ip: string | null;
  created_at: string | null;
};

export async function getPaymentLogs(orderNo: string, limit = 20): Promise<PaymentLog[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !orderNo) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, kind, authyn, amount, trno, raw, note, remote_ip, created_at')
    .eq('order_no', orderNo)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as PaymentLogRow[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    authyn: row.authyn ?? '',
    amount: row.amount,
    trno: row.trno ?? '',
    raw: row.raw ?? '',
    note: row.note ?? '',
    remoteIp: row.remote_ip ?? '',
    createdAt: row.created_at,
  }));
}
