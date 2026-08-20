import { type NextRequest } from 'next/server';
import { approveKsnetPayment } from '@/lib/payments/ksnet/approve';
import { applyKsnetApproval, getOrderByNo, markPaymentUnconfirmed } from '@/lib/orders';
import { createOrderToken } from '@/lib/order-token';
import { writePaymentLog } from '@/lib/payment-logs';
import { decodeEuckr } from '@/lib/payments/ksnet/encode';
import { clientIp } from '@/lib/rate-limit';
import { getPaymentSettings } from '@/lib/settings';
import { SITE_URL } from '@/lib/store';
import {
  notifyNewOrder,
  notifyPaymentPaid,
  notifyPaymentReview,
  notifyPaymentUnconfirmed,
} from '@/lib/telegram';

/**
 * ============================================================
 * KSNET 결제창 복귀 — sndReply 가 가리키는 주소
 * ============================================================
 *
 * 흐름
 *   ① 결제창이 이 주소로 POST 합니다 (EUC-KR 폼)
 *   ② 결제 Key(reCommConId)를 꺼냅니다
 *   ③ ★ 우리 서버가 KSNET 에 직접 물어 최종 승인을 확인합니다 (recv_post.jsp)
 *   ④ 금액·주문번호를 우리 DB 와 대조합니다
 *   ⑤ 전부 맞을 때만 결제완료로 바꿉니다
 *
 * ★ ①에서 받은 값은 손님 브라우저를 거쳐 옵니다. 금액을 여기서 읽어 쓰면 안 됩니다.
 *   승인 확인에 넣는 금액도, 대조에 쓰는 금액도 전부 DB 에서 다시 읽습니다.
 *
 * ★ 응답을 리다이렉트(3xx)가 아니라 HTML 한 장으로 돌려줍니다.
 *   PC 는 결제창이 레이어(iframe) 안에서 열립니다. 그 안에서 리다이렉트하면
 *   레이어 안에서만 화면이 바뀌고 뒤의 페이지는 주문서 그대로 남습니다.
 *   그래서 최상위 창을 옮기는 스크립트를 담은 페이지를 돌려줍니다.
 *   모바일은 페이지째 이동한 상태라 같은 스크립트가 그냥 현재 창을 옮깁니다.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 결제창이 돌려주는 값.
 *
 * ★★ 실제로 들어온 내용 (2026-08-20 테스트 결제 원문, payment_logs 에서 확인)
 *     reCommConId = w11a01e434bceed50820   결제 Key — 승인 확인에 쓰는 값
 *     reCommType  = WH                     결제 구분
 *     reHash      = ...                    검증값
 *     reEncData   = (빈 값)
 *     reCnclType  = 0                      0 정상 / 1 손님이 결제창을 닫음
 *
 * ★★ 여기에 주문번호가 없습니다. 이것이 첫 실제 결제가 실패한 원인이었습니다.
 *   처음에는 KSNET 이 주문번호를 돌려줄 것이라 보고 reOrdernumber 같은 이름을
 *   찾게 해 두었는데, 실제로는 다섯 개뿐이고 주문번호는 오지 않습니다.
 *   그래서 지금은 우리가 sndReply 주소에 주문번호를 직접 박아 보냅니다.
 *     sndReply = {SITE_URL}/api/payment/ksnet/return/{주문번호}?no={주문번호}
 *   결제창은 그 주소를 그대로 폼 action 으로 써서 POST 하므로 되돌아옵니다.
 *   (경로와 쿼리 양쪽에 넣습니다. 한쪽이 잘려도 다른 쪽으로 찾습니다)
 *
 * ★ 주소에 실린 주문번호는 "어느 주문인지" 를 찾는 데만 씁니다.
 *   금액은 그 주문을 DB 에서 다시 읽어 쓰고, 승인 응답의 ordno 와도 대조합니다.
 *   주소를 손대도 금액·주문번호 대조에서 걸립니다. (검토필요로 떨어집니다)
 */
const COMM_ID_KEYS = ['reCommConId', 'sndCommConId', 'commConId', 'CommConId'];
/**
 * 혹시 나중에 KSNET 이 주문번호를 함께 보내 주면 그것도 받습니다.
 * ★ 지금은 오지 않습니다. 주소에 심은 값이 주 경로입니다.
 */
const ORDER_NO_KEYS = ['reOrdernumber', 'sndOrdernumber', 'ordno', 'reOrdNo'];
/**
 * 취소 표시.
 * ★ 결제창의 [닫기] 버튼은 payClose() 를 부릅니다.
 *   그 함수는 reCommConId 를 비우고 reCnclType 에 1 을 넣은 뒤
 *   이 주소로 POST 합니다. 즉 취소도 우리가 받습니다.
 */
const CANCEL_KEYS = ['reCnclType'];

/** Next 가 넘겨 주는 경로 조각. /return/{주문번호} 의 그 자리입니다. */
type RouteContext = { params: { orderNo?: string[] } };

export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

/**
 * KSNET 이 GET 으로 되돌려 보내는 경우도 있습니다.
 * 규격을 확정하지 못해 양쪽 다 받습니다. (받는 값의 이름은 같습니다)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  const ip = clientIp(request.headers);
  let payload: Record<string, string> = {};
  let rawBody = '';

  try {
    if (request.method === 'POST') {
      // ★ text() 를 쓰면 EUC-KR 이 깨집니다. 바이트로 받아 직접 디코딩합니다.
      rawBody = decodeEuckr(await request.arrayBuffer());
      payload = parseFormBody(rawBody);
    } else {
      request.nextUrl.searchParams.forEach((value, key) => {
        payload[key] = value;
      });
      rawBody = request.nextUrl.searchParams.toString();
    }
  } catch (error) {
    console.error('[ksnet/return] 본문을 읽지 못했습니다:', error);
  }

  /*
   * 주문번호 찾는 순서
   *   ① 경로   /api/payment/ksnet/return/{주문번호}
   *   ② 쿼리   ?no={주문번호}
   *   ③ 본문   혹시 KSNET 이 함께 보내 준다면
   * ★ ①②는 우리가 sndReply 에 심은 값입니다. KSNET 은 주문번호를 돌려주지 않습니다.
   */
  const fromPath = decodeSegment(context.params?.orderNo?.[0] ?? '');
  const fromQuery = (request.nextUrl.searchParams.get('no') ?? '').trim();
  const orderNo = fromPath || fromQuery || pick(payload, ORDER_NO_KEYS);

  const commConId = pick(payload, COMM_ID_KEYS);
  const cancelled = pick(payload, CANCEL_KEYS) === '1';

  // ★ 무엇보다 먼저 원문을 남깁니다. 이 아래에서 무슨 일이 나든 근거는 남아야 합니다.
  await writePaymentLog({
    kind: 'return',
    orderNo: orderNo || null,
    raw: rawBody,
    parsed: payload,
    remoteIp: ip,
    note: cancelled
      ? '손님이 결제창을 닫았습니다. (reCnclType=1)'
      : commConId
        ? ''
        : '결제 Key(reCommConId)가 없습니다.',
  });

  /* ── 손님이 결제창을 닫았다면 여기서 끝냅니다 ─────────────
   * ★ 이 판단이 "주문번호를 못 찾음" 보다 먼저 와야 합니다.
   *   취소는 돈이 오가지 않은 것이 확실합니다. 주문번호를 모르더라도
   *   "결제 확인 중" 이라고 겁줄 이유가 없습니다.
   *   주문은 결제대기 그대로 두어 다시 시도할 수 있게 합니다. */
  if (cancelled) {
    const query = orderNo ? `no=${encodeURIComponent(orderNo)}&reason=cancelled` : 'reason=cancelled';
    return htmlRedirect(`${SITE_URL}/checkout/failed?${query}`);
  }

  if (!orderNo) {
    /*
     * ★★ 결제 Key 가 있는데 어느 주문인지 모르는 상황입니다.
     *   손님은 카드 정보를 다 넣고 결제를 마쳤을 수 있습니다. 즉 돈이 빠져나갔을 수 있습니다.
     *   여기서 "주문 정보를 찾을 수 없습니다"(결제 미완료 화면)로 보내면
     *   손님은 결제가 안 된 줄 알고 다시 결제합니다. 이중결제가 납니다.
     *   그래서 사람에게 즉시 알리고, 손님에게는 "확인 중"으로만 안내합니다.
     */
    if (commConId) {
      await writePaymentLog({
        kind: 'error',
        raw: rawBody,
        parsed: payload,
        remoteIp: ip,
        note: '결제 Key 는 있는데 주문번호를 찾지 못했습니다. sndReply 주소를 확인하세요.',
      });
      await safeNotify(() =>
        notifyPaymentUnconfirmed(
          null,
          '(주문번호 없음)',
          `결제 Key(${commConId})는 받았지만 어느 주문인지 알 수 없습니다. KSNET 거래내역과 대조해 주세요.`
        )
      );
      return htmlRedirect(`${SITE_URL}/checkout/pending`);
    }

    // 결제 Key 도 없으면 결제가 시작되지 않은 것입니다. 돈은 오가지 않았습니다.
    return htmlRedirect(`${SITE_URL}/checkout/failed?reason=noorder`);
  }

  /* ── 결제 Key 가 없으면 승인 확인 자체를 할 수 없습니다 ──
   * 취소(reCnclType=1)는 위에서 이미 걸렀습니다. 여기까지 왔는데 Key 가 없다면
   * 결제가 시작되지 않은 것으로 봅니다. 주문은 결제대기 그대로 둡니다. */
  if (!commConId) {
    return htmlRedirect(
      `${SITE_URL}/checkout/failed?no=${encodeURIComponent(orderNo)}&reason=cancelled`
    );
  }

  /* ── ★ 금액은 반드시 DB 에서 읽습니다 ──────────────────
   * 결제창이 보낸 금액을 쓰면, 그 값을 바꿔 보내는 것만으로
   * 1,000원짜리 승인을 100만원 주문의 완료로 만들 수 있습니다. */
  const order = await getOrderByNo(orderNo);
  if (!order) {
    await writePaymentLog({
      kind: 'error',
      orderNo,
      raw: rawBody,
      remoteIp: ip,
      note: '주문을 찾지 못했습니다.',
    });
    return htmlRedirect(`${SITE_URL}/checkout/failed?reason=noorder`);
  }

  /*
   * 이미 처리된 주문이면 다시 승인 확인을 하지 않습니다.
   * (새로고침·뒤로가기로 같은 요청이 다시 들어온 경우입니다)
   * ★ 무조건 완료 화면으로 보내면 안 됩니다.
   *   검토필요·승인확인실패인 주문의 손님에게 "결제가 완료되었습니다" 가 보이면,
   *   실제로는 아직 확인 중인데 완료된 줄 알고 발송을 기다립니다.
   */
  if (order.status !== 'pending_payment') {
    return htmlRedirect(await resultUrl(order.status, orderNo));
  }

  /* ── 승인 확인 (실패하면 한 번 더) ────────────────────── */
  let approval;
  try {
    approval = await approveKsnetPayment(commConId, order.totalAmount);
  } catch (error) {
    approval = null;
    console.error('[ksnet/return] 승인 확인 중 오류:', error);
  }

  if (!approval || !approval.result.ok) {
    const reason = approval?.result.error ?? '승인 확인 요청이 실패했습니다.';

    await writePaymentLog({
      kind: 'error',
      orderId: order.id,
      orderNo,
      raw: approval?.result.raw ?? '',
      remoteIp: ip,
      note: `승인 확인 실패 (${approval?.attempts ?? 0}회 시도) — ${reason}`,
    });

    /*
     * ★ 여기서 '결제실패' 로 단정하면 안 됩니다.
     *   실제로는 승인이 났는데 우리만 모르는 상황일 수 있습니다.
     *   '승인확인실패' 로 두고 사람이 KSNET 거래내역과 대조하게 합니다.
     */
    const marked = await markPaymentUnconfirmed(orderNo, reason);
    await safeNotify(() => notifyPaymentUnconfirmed(marked, orderNo, reason));

    // 손님에게는 "확인 중" 으로 안내합니다. 실패라고 말하지 않습니다.
    return htmlRedirect(
      `${SITE_URL}/checkout/pending?no=${encodeURIComponent(orderNo)}`
    );
  }

  const facts = approval.result;

  await writePaymentLog({
    kind: approval.attempts > 1 ? 'approve_retry' : 'approve',
    orderId: order.id,
    orderNo,
    authyn: facts.authyn,
    amount: facts.amount,
    trno: facts.trno,
    raw: facts.raw,
    parsed: facts.fields,
    remoteIp: ip,
    note: `${approval.attempts}회 시도 · ${facts.message}`,
  });

  /* ── 주문에 반영 ──────────────────────────────────────── */
  let applied;
  try {
    applied = await applyKsnetApproval(orderNo, facts);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '승인 결과를 저장하지 못했습니다.';
    console.error('[ksnet/return] 승인 반영 실패:', reason);

    await writePaymentLog({
      kind: 'error',
      orderId: order.id,
      orderNo,
      raw: facts.raw,
      remoteIp: ip,
      note: `승인은 확인했으나 주문에 반영하지 못했습니다 — ${reason}`,
    });
    await safeNotify(() =>
      notifyPaymentUnconfirmed(order, orderNo, `승인 반영 실패 — ${reason}`)
    );
    return htmlRedirect(`${SITE_URL}/checkout/pending?no=${encodeURIComponent(orderNo)}`);
  }

  if (applied.outcome === 'review') {
    await writePaymentLog({
      kind: 'mismatch',
      orderId: order.id,
      orderNo,
      authyn: facts.authyn,
      amount: facts.amount,
      trno: facts.trno,
      raw: facts.raw,
      parsed: facts.fields,
      remoteIp: ip,
      note: applied.reason,
    });
    await safeNotify(() =>
      notifyPaymentReview(applied.order ?? order, applied.reason, {
        trno: facts.trno,
        authno: facts.authno,
        amount: facts.amount,
      })
    );
    // 손님에게는 확인 중으로 안내합니다. 물건은 나가지 않습니다.
    return htmlRedirect(`${SITE_URL}/checkout/pending?no=${encodeURIComponent(orderNo)}`);
  }

  if (applied.outcome === 'declined') {
    return htmlRedirect(
      `${SITE_URL}/checkout/failed?no=${encodeURIComponent(orderNo)}&reason=declined`
    );
  }

  /*
   * 'paid' 일 때만 알립니다. 'already' 는 중복이라 두 번 알리지 않습니다.
   *
   * ★ 두 통을 보냅니다.
   *   ① 결제 완료 — 승인번호·거래번호가 담긴 짧은 알림
   *   ② 새 주문 — 공급처에 그대로 복사해 넘기는 주문 내역
   *   카드 주문은 주문 접수 시점에 ②를 보내지 않습니다. 결제를 끝내지 않고
   *   창을 닫는 경우가 많아, 그때 보내면 발송하면 안 되는 주문이 공급처로 넘어갑니다.
   *   그래서 돈이 실제로 들어온 지금 보냅니다.
   */
  if (applied.outcome === 'paid' && applied.order) {
    const paidOrder = applied.order;
    await safeNotify(() =>
      notifyPaymentPaid(paidOrder, { trno: facts.trno, authno: facts.authno })
    );
    const payment = await getPaymentSettings();
    if (payment.telegramEnabled) {
      await safeNotify(() => notifyNewOrder(paidOrder, 0));
    }
    return htmlRedirect(await completeUrl(orderNo));
  }

  /*
   * 'already' — 다른 요청이 먼저 처리했습니다.
   * ★ 그 요청이 결제완료로 끝냈는지, 검토필요로 끝냈는지 알 수 없습니다.
   *   지금 주문 상태를 보고 그에 맞는 화면으로 보냅니다.
   */
  return htmlRedirect(await resultUrl(applied.order?.status ?? '', orderNo));
}

/* ------------------------------------------------------------------
 * 도우미
 * ------------------------------------------------------------------ */

/** 경로 조각은 인코딩되어 올 수 있습니다. 못 풀면 원문 그대로 씁니다. */
function decodeSegment(value: string): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function pick(payload: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

/** application/x-www-form-urlencoded 본문을 풀어 냅니다. (이미 EUC-KR → UTF-8 됨) */
function parseFormBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of body.split('&')) {
    if (!pair) continue;
    const at = pair.indexOf('=');
    const key = at < 0 ? pair : pair.slice(0, at);
    const value = at < 0 ? '' : pair.slice(at + 1);
    try {
      out[decodeURIComponent(key.replace(/\+/g, ' '))] = decodeURIComponent(
        value.replace(/\+/g, ' ')
      );
    } catch {
      // 퍼센트 인코딩이 깨져 있으면 원문 그대로 둡니다. 값을 잃는 것보다 낫습니다.
      out[key] = value;
    }
  }
  return out;
}

/** 주문 완료 화면 주소 — 서명 토큰을 붙여야 열립니다. */
async function completeUrl(orderNo: string): Promise<string> {
  const token = await createOrderToken(orderNo);
  const query = new URLSearchParams({ no: orderNo, k: token });
  return `${SITE_URL}/checkout/complete?${query.toString()}`;
}

/**
 * 지금 주문 상태에 맞는 화면으로 보냅니다.
 *
 * ★ 손님에게 보이는 말이 상태와 어긋나면 안 됩니다.
 *   확인 중인 주문에 "완료" 라고 하면 발송을 기다리게 되고,
 *   승인이 났을 수 있는 주문에 "실패" 라고 하면 이중결제를 부릅니다.
 */
async function resultUrl(status: string, orderNo: string): Promise<string> {
  const encoded = encodeURIComponent(orderNo);

  // 사람이 확인해야 하는 상태 — "확인 중" 으로만 안내합니다.
  if (status === 'payment_review' || status === 'payment_unconfirmed') {
    return `${SITE_URL}/checkout/pending?no=${encoded}`;
  }

  // 돈이 오가지 않은 것이 확실한 상태
  if (status === 'failed') {
    return `${SITE_URL}/checkout/failed?no=${encoded}&reason=declined`;
  }
  if (status === 'cancelled' || status === 'cancel_requested') {
    return `${SITE_URL}/checkout/failed?no=${encoded}&reason=cancelled`;
  }

  // 결제완료 이후(준비중·배송중…)는 완료 화면으로 보냅니다.
  return completeUrl(orderNo);
}

/**
 * 최상위 창을 옮기는 HTML 한 장.
 *
 * ★ PC 는 결제창이 레이어(iframe) 안에 있습니다. 그 안에서 location 을 바꾸면
 *   레이어만 바뀌고 뒤 페이지는 그대로입니다. 그래서 top 을 먼저 시도합니다.
 * ★ 스크립트가 막힌 환경을 위해 링크도 함께 둡니다.
 * ★ alert 을 쓰지 않습니다. 결제창 안에서 모달이 뜨면 아무것도 못 하게 됩니다.
 */
function htmlRedirect(url: string): Response {
  const safe = url.replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const body = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>결제 결과 확인 중</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#F6F5F2; color:#14141A;
         font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
  .box { text-align:center; padding:32px; }
  p { margin:0 0 16px; font-size:15px; line-height:1.9; }
  a { color:#6A2E3C; text-decoration:underline; text-underline-offset:4px; font-size:14px; }
</style>
</head>
<body>
  <div class="box">
    <p>결제 결과를 확인하고 있습니다.<br>잠시만 기다려 주세요.</p>
    <a href="${safe}">화면이 넘어가지 않으면 여기를 눌러 주세요</a>
  </div>
  <script>
    (function () {
      var url = "${safe}";
      try {
        if (window.top && window.top !== window.self) { window.top.location.href = url; }
        else { window.location.replace(url); }
      } catch (e) {
        // 다른 출처의 프레임이라 top 을 만질 수 없는 경우입니다.
        window.location.replace(url);
      }
    })();
  </script>
</body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** 알림 실패가 결제 처리를 막으면 안 됩니다. */
async function safeNotify(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.warn('[ksnet/return] 알림 실패:', error);
  }
}
