import { type NextRequest } from 'next/server';
import { applyKsnetApproval, getOrderByNo } from '@/lib/orders';
import { writePaymentLog } from '@/lib/payment-logs';
import { decodeEuckr } from '@/lib/payments/ksnet/encode';
import { clientIp } from '@/lib/rate-limit';
import { getPaymentSettings } from '@/lib/settings';
import { notifyKsnetNotify, notifyPaymentReview } from '@/lib/telegram';

/**
 * ============================================================
 * KSNET 노티(거래내역통보) 수신
 * ============================================================
 *
 * POST /api/payment/ksnet/notify
 * 이 주소를 KSNET 에 등록 요청해 둔 상태입니다.
 *
 * ★★ 아직 등록 확인이 안 됐습니다.
 *   그래서 이 입구가 없어도 결제는 정상 동작해야 합니다.
 *   실제 승인 확인은 /api/payment/ksnet/return 이 이미 끝내 둡니다.
 *   여기는 "혹시 그쪽이 실패했을 때를 위한 두 번째 경로" 입니다.
 *
 * ★★ 노티에는 인증이 없습니다.
 *   KSNET 이 우리에게 보내는 것이라 서명도 비밀값도 없습니다.
 *   주소만 알면 누구나 이 입구에 아무 내용이나 보낼 수 있습니다.
 *   그래서 받은 내용을 절대 그대로 믿지 않습니다.
 *     · 주문번호로 우리 DB 를 조회해 금액을 대조합니다
 *     · 기본값은 "기록하고 알리기만" 입니다. 주문 상태를 바꾸지 않습니다
 *     · 주문을 완료 처리하려면 관리자 설정에서 명시적으로 켜야 합니다
 *       (설정 > 결제·주문 > KSNET 노티 자동 완료 처리)
 *   켜기 전에 KSNET 으로부터 노티 규격과 발신 IP 를 확인받으세요.
 *
 * ★ 규격을 확정할 수 없으므로 받은 원문을 그대로 payment_logs 에 저장합니다.
 *   나중에 실제 데이터를 보고 파싱을 맞출 수 있어야 합니다.
 *
 * ★ 응답 규격을 모릅니다. 우선 200 OK 에 "OK" 를 돌려줍니다.
 *   KSNET 이 특정 문자열을 기대한다면 그때 맞추면 됩니다.
 *   (마지막 보고의 질문 항목으로 남겨 두었습니다)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/** 노티에서 주문번호가 담길 수 있는 이름들 — 규격 확정 전까지 넓게 받습니다. */
const ORDER_NO_KEYS = ['ordno', 'reOrdernumber', 'sndOrdernumber', 'orderno', 'order_no'];
const AMOUNT_KEYS = ['amt', 'amount', 'reAmount', 'sndAmount'];
const TRNO_KEYS = ['trno', 'reTrno', 'tid'];
const AUTHYN_KEYS = ['authyn', 'reAuthYn', 'result'];

export async function POST(request: NextRequest) {
  return handle(request);
}

/** 규격을 확정하지 못해 GET 도 받아 둡니다. 내용은 같게 처리합니다. */
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest): Promise<Response> {
  const ip = clientIp(request.headers);
  let raw = '';
  let payload: Record<string, string> = {};

  /* ── 1. 무슨 일이 있어도 원문부터 남깁니다 ───────────── */
  try {
    if (request.method === 'POST') {
      // EUC-KR 일 수도, UTF-8 일 수도 있습니다. EUC-KR 로 읽어도 ASCII 는 그대로입니다.
      raw = decodeEuckr(await request.arrayBuffer());
    } else {
      raw = request.nextUrl.searchParams.toString();
    }
    payload = parseLoose(raw);
  } catch (error) {
    console.error('[ksnet/notify] 본문을 읽지 못했습니다:', error);
  }

  const orderNo = pick(payload, ORDER_NO_KEYS);
  const amount = toAmount(pick(payload, AMOUNT_KEYS));
  const trno = pick(payload, TRNO_KEYS);
  const authyn = pick(payload, AUTHYN_KEYS).toUpperCase();

  await writePaymentLog({
    kind: 'notify',
    orderNo: orderNo || null,
    authyn: authyn || null,
    amount,
    trno: trno || null,
    raw,
    parsed: Object.keys(payload).length > 0 ? payload : null,
    remoteIp: ip,
    note: orderNo ? '' : '주문번호를 찾지 못했습니다. 규격 확인이 필요합니다.',
  });

  /* ── 2. 주문번호를 못 읽으면 사람에게 알리고 끝냅니다 ── */
  if (!orderNo) {
    await safeNotify(() =>
      notifyKsnetNotify(
        '주문번호를 읽지 못한 노티가 들어왔습니다. 규격 확인이 필요합니다.',
        raw
      )
    );
    return ok();
  }

  const order = await getOrderByNo(orderNo);
  if (!order) {
    await safeNotify(() =>
      notifyKsnetNotify(`노티의 주문번호(${orderNo})에 해당하는 주문이 없습니다.`, raw)
    );
    return ok();
  }

  /* ── 3. ★ 금액 대조는 반드시 우리 DB 기준으로 ────────── */
  const amountMatches = amount !== null && amount === order.totalAmount;

  if (!amountMatches) {
    await writePaymentLog({
      kind: 'mismatch',
      orderId: order.id,
      orderNo,
      authyn: authyn || null,
      amount,
      trno: trno || null,
      raw,
      remoteIp: ip,
      note: `노티 금액(${amount ?? '없음'}) ≠ 주문 금액(${order.totalAmount})`,
    });
    await safeNotify(() =>
      notifyPaymentReview(
        order,
        `노티 금액이 주문 금액과 다릅니다. (노티 ${amount ?? '없음'} / 주문 ${order.totalAmount})`,
        { trno, amount }
      )
    );
    return ok();
  }

  /* ── 4. 이미 처리된 주문이면 조용히 넘어갑니다 ─────────
   * 같은 노티가 여러 번 올 수 있습니다. (중복 처리 방지)
   * applyKsnetApproval 이 DB 수준에서 한 번만 통과시키지만,
   * 알림을 두 번 보내지 않도록 여기서 먼저 걸러 냅니다. */
  if (order.status !== 'pending_payment') {
    return ok();
  }

  /* ── 5. 자동 완료 처리는 관리자가 켰을 때만 ──────────── */
  const payment = await getPaymentSettings();
  if (!payment.ksnetNotifyAutoComplete) {
    await safeNotify(() =>
      notifyKsnetNotify(
        `노티가 들어왔지만 자동 완료 처리가 꺼져 있어 주문을 바꾸지 않았습니다.\n주문 ${orderNo} · ${order.totalAmount}원 · 승인여부 ${authyn || '미확인'}`,
        raw
      )
    );
    return ok();
  }

  if (authyn !== 'O') {
    await safeNotify(() =>
      notifyKsnetNotify(`노티의 승인 여부가 성공이 아닙니다. (${authyn || '없음'})`, raw)
    );
    return ok();
  }

  /*
   * ★ 승인 확인(recv_post)과 똑같은 함수를 씁니다.
   *   금액·주문번호 대조와 중복 방지가 전부 그 안에 있습니다.
   *   여기서 상태를 직접 바꾸면 언젠가 한쪽 검사만 빠집니다.
   */
  try {
    const applied = await applyKsnetApproval(orderNo, {
      authyn: 'O',
      trno,
      authno: pick(payload, ['authno', 'reAuthNo']),
      amount,
      ordno: orderNo,
      tradeAt: `${pick(payload, ['trddt'])}${pick(payload, ['trdtm'])}`,
      issuerCode: pick(payload, ['isscd']),
      acquirerCode: pick(payload, ['aqucd']),
      installment: null,
      resultCode: pick(payload, ['result']),
      message: '노티로 확인',
    });

    await safeNotify(() =>
      notifyKsnetNotify(
        `노티로 주문 ${orderNo} 를 처리했습니다. (결과: ${applied.outcome})`,
        raw
      )
    );
  } catch (error) {
    console.error('[ksnet/notify] 반영 실패:', error);
    await safeNotify(() =>
      notifyKsnetNotify(`노티를 주문에 반영하지 못했습니다. (${orderNo})`, raw)
    );
  }

  return ok();
}

/* ------------------------------------------------------------------
 * 도우미
 * ------------------------------------------------------------------ */

function ok(): Response {
  return new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function pick(payload: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function toAmount(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

/**
 * 규격을 모르는 본문을 최대한 풀어 봅니다.
 *
 * ★ 순서
 *   1) JSON 이면 JSON 으로
 *   2) key=value&key=value 형태면 폼으로
 *   3) 백틱(`)으로 이어진 문자열이면 승인 응답과 같은 순서로 (가능성 있음)
 *   실패해도 괜찮습니다. 원문은 이미 저장되어 있습니다.
 */
function parseLoose(raw: string): Record<string, string> {
  const text = String(raw ?? '').trim();
  if (!text) return {};

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value !== null && value !== undefined) out[key] = String(value);
      }
      return out;
    } catch {
      // JSON 이 아니었습니다. 아래에서 다시 시도합니다.
    }
  }

  if (text.includes('=')) {
    const out: Record<string, string> = {};
    for (const pair of text.split('&')) {
      if (!pair) continue;
      const at = pair.indexOf('=');
      if (at < 0) continue;
      const key = pair.slice(0, at);
      const value = pair.slice(at + 1);
      try {
        out[decodeURIComponent(key.replace(/\+/g, ' '))] = decodeURIComponent(
          value.replace(/\+/g, ' ')
        );
      } catch {
        out[key] = value;
      }
    }
    if (Object.keys(out).length > 0) return out;
  }

  return {};
}

async function safeNotify(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.warn('[ksnet/notify] 알림 실패:', error);
  }
}
