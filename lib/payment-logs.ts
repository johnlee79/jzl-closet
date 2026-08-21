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

/**
 * ============================================================
 * 주문의 결제 Key(reCommConId) 찾기
 * ============================================================
 *
 * ★★ 왜 필요한가
 *   KSNET 에 "이 주문 승인됐나요?" 를 물으려면 결제 Key 가 있어야 합니다.
 *   recv_post.jsp 는 주문번호가 아니라 sndCommConId 로만 조회됩니다.
 *
 *   그런데 이 Key 는 주문에 저장되지 않습니다. 결제창이 돌려주는 값이라
 *   손님이 결제창을 닫고 나가면 우리 손에 들어오지 않습니다.
 *   결제창이 우리 서버로 한 번이라도 돌아왔다면 그 원문이 payment_logs 에
 *   남아 있으므로, 거기서 꺼냅니다.
 *
 * ★ 못 찾는다는 것은 "KSNET 과 이 주문에 대해 아무 말도 주고받지 못했다" 는 뜻입니다.
 *   판단은 호출부(lib/card-sweep.ts)가 합니다. 여기서는 찾기만 합니다.
 *
 * ★ 취소(reCnclType=1)로 돌아온 원문에는 Key 가 빈 값으로 옵니다.
 *   실제 데이터로 확인했습니다. 빈 값은 없는 것으로 봅니다.
 */

/** 결제창·노티가 결제 Key 를 담아 보내는 이름들 (return 라우트와 같은 목록) */
const COMM_ID_KEYS = ['reCommConId', 'sndCommConId', 'commConId', 'CommConId'];

export async function findPaymentKey(orderNo: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !orderNo) return '';

  const { data, error } = await supabase
    .from(TABLE)
    .select('parsed, raw')
    .eq('order_no', orderNo)
    .in('kind', ['return', 'notify'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return '';

  for (const row of data as { parsed: unknown; raw: string | null }[]) {
    // ① 파싱해 둔 값에서 먼저 찾습니다.
    if (row.parsed && typeof row.parsed === 'object') {
      const parsed = row.parsed as Record<string, unknown>;
      for (const key of COMM_ID_KEYS) {
        const value = parsed[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }

    // ② 파싱이 없거나 이름이 달랐으면 원문에서 직접 훑습니다.
    const raw = row.raw ?? '';
    for (const key of COMM_ID_KEYS) {
      const found = new RegExp(`${key}=([^&\s]+)`).exec(raw);
      const value = found ? decodeURIComponent(found[1]).trim() : '';
      if (value) return value;
    }
  }

  return '';
}
