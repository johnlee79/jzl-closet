import { type NextRequest } from 'next/server';
import { approveKsnetPayment } from '@/lib/payments/ksnet/approve';
import {
  applyKsnetApproval,
  failPendingCardOrder,
  getOrderByNo,
  markPaymentUnconfirmed,
  saveKsnetPaymentKey,
} from '@/lib/orders';
import { ksnetResultUrl } from '@/lib/payments/ksnet/result-url';
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
 * ★★ 답하는 방법이 기기에 따라 다릅니다. (2026-08-25)
 *
 *   PC     — HTML 한 장 (아래 htmlRedirect)
 *            결제창이 레이어(iframe) 안에 있습니다. 그 안에서 리다이렉트하면
 *            레이어만 바뀌고 뒤 페이지는 주문서 그대로 남습니다. 바깥 창을
 *            옮기려면 스크립트가 반드시 필요합니다.
 *
 *   모바일  — 진짜 리다이렉트 303 (sndReply 에 m=1 이 붙어 옵니다)
 *            프레임이 없어 옮길 창이 이 창 하나뿐입니다. 스크립트를 쓸 이유가
 *            없는데, 예전에는 모바일에도 HTML 을 줬습니다. PC 는 길이 셋이라
 *            하나 막혀도 넘어가지만 모바일은 그 스크립트가 유일한 길이었고,
 *            늦거나 막히면 3초짜리 meta refresh 가 마지막이었습니다.
 */
/**
 * 손님이 기다리는 길에서 승인 확인에 쓸 수 있는 시간.
 *
 * ★ 실제 승인 확인은 1~2초면 끝납니다. (실측: 결제창 복귀 후 1.5초)
 *   6초는 느린 회선까지 감안한 값이고, 그 이상은 손님을 붙잡는 것입니다.
 * ★ 이 시간을 넘겨도 잃는 것이 없습니다. 정리 작업이 끝을 냅니다.
 */
const CUSTOMER_APPROVE_TIMEOUT_MS = 6000;

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

  /*
   * ── ★★ 모바일이면 진짜 리다이렉트로 답합니다 (2026-08-25) ──────
   *
   * 모바일은 프레임이 없습니다. 페이지째 KSNET 으로 넘어갔다가 페이지째
   * 돌아옵니다. 그래서 옮겨야 하는 창은 지금 이 창 하나뿐입니다.
   *
   * ★★ 그런데 지금까지는 모바일에도 스크립트가 든 HTML 을 돌려줬습니다.
   *   그 스크립트가 바깥 창을 찾다가(없음) 마지막에 이 창을 옮깁니다.
   *   PC 는 그 스크립트 말고도 길이 셋(신호·top 이동·바깥창 자체확인)이라
   *   하나가 막혀도 넘어가지만, 모바일은 그 스크립트가 유일한 길입니다.
   *   스크립트가 늦거나 막히면 3초짜리 meta refresh 가 마지막이었습니다.
   *
   * ★ 303 은 브라우저가 응답 헤더만 보고 따라갑니다.
   *   스크립트도, 프레임도, 로딩 시간도 끼어들지 않습니다.
   *   POST 로 들어온 요청을 GET 으로 바꿔 보내 주는 것도 303 의 규격입니다.
   *   (302 를 쓰면 브라우저에 따라 POST 를 그대로 다시 보냅니다)
   *
   * ★ PC 는 그대로 HTML 을 씁니다. 아이프레임 안에서 답하는 것이라
   *   바깥 창을 옮기려면 스크립트가 반드시 필요합니다.
   */
  const isMobileFlow = request.nextUrl.searchParams.get('m') === '1';
  const sendTo = (url: string): Response =>
    isMobileFlow
      ? new Response(null, {
          status: 303,
          headers: { Location: url, 'Cache-Control': 'no-store' },
        })
      : htmlRedirect(url);

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
   *
   * ★★ 4-B — 여기서 재고를 바로 되돌립니다.
   *   예전에는 주문을 결제대기 그대로 두었습니다. 그런데 그 주문을
   *   정리하는 코드가 어디에도 없어서, 손님이 취소를 누른 그 순간부터
   *   재고가 영원히 묶였습니다. 팔 수 있는 물건이 품절로 보였습니다.
   *
   *   이 경로는 KSNET 이 "손님이 취소했다"(reCnclType=1)고 알려 준 것이라
   *   결제가 안 된 것이 확실합니다. 기다릴 이유가 없습니다.
   *   (실제 로그로 확인: 취소로 돌아온 원문에는 결제 Key 가 빈 값입니다)
   *
   * ★ 장바구니는 비우지 않습니다. 손님이 그대로 다시 시도할 수 있어야 합니다.
   *   장바구니를 비우는 곳은 주문 완료 화면뿐입니다. (CartCleanupOnComplete)
   */
  if (cancelled) {
    if (orderNo) {
      try {
        const order = await getOrderByNo(orderNo);
        /*
         * ★ 결제대기일 때만 건드립니다.
         *   이미 결제완료된 주문에 취소 신호가 뒤늦게 들어와도 아무 일도 없어야 합니다.
         *   무통장입금은 이 경로로 오지 않지만, 와도 건드리지 않게 막아 둡니다.
         */
        if (order && order.status === 'pending_payment' && order.paymentMethod !== 'bank_transfer') {
          await failPendingCardOrder(
            order,
            '손님이 결제창에서 취소했습니다. 재고를 바로 되돌렸습니다. (reCnclType=1)'
          );
        }
      } catch (error) {
        /*
         * ★ 정리에 실패해도 손님 화면은 그대로 진행합니다.
         *   손님은 이미 취소를 눌렀고, 돈은 오가지 않았습니다.
         *   재고는 10분마다 도는 정리(card-sweep)가 다시 잡습니다.
         */
        console.warn('[ksnet/return] 결제창 취소 정리 실패:', orderNo, error);
      }
    }

    const query = orderNo ? `no=${encodeURIComponent(orderNo)}&reason=cancelled` : 'reason=cancelled';
    return sendTo(`${SITE_URL}/checkout/failed?${query}`);
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
      return sendTo(`${SITE_URL}/checkout/pending`);
    }

    // 결제 Key 도 없으면 결제가 시작되지 않은 것입니다. 돈은 오가지 않았습니다.
    return sendTo(`${SITE_URL}/checkout/failed?reason=noorder`);
  }

  /* ── 결제 Key 가 없으면 승인 확인 자체를 할 수 없습니다 ──
   * 취소(reCnclType=1)는 위에서 이미 걸렀습니다. 여기까지 왔는데 Key 가 없다면
   * 결제가 시작되지 않은 것으로 봅니다. 주문은 결제대기 그대로 둡니다. */
  if (!commConId) {
    return sendTo(
      `${SITE_URL}/checkout/failed?no=${encodeURIComponent(orderNo)}&reason=cancelled`
    );
  }

  /*
   * ── ★★ 결제 Key 를 먼저 주문에 적어 둡니다 (4-B) ──────
   *
   * 승인 재조회(recv_post.jsp)는 이 값으로만 됩니다. 주문번호로는 못 물어봅니다.
   * 4-A 는 이 값을 승인 확인에만 쓰고 버렸습니다. 그래서 아래 승인 확인이
   * 통신 오류로 실패하면 그 주문은 영영 확인할 방법이 없었습니다.
   *
   * ★ 승인 확인보다 먼저입니다. 확인이 실패해도 열쇠는 남아야
   *   10분 뒤 정리 작업이 다시 물어볼 수 있습니다.
   * ★ 실패해도 결제 처리를 막지 않습니다. (안에서 조용히 넘어갑니다)
   */
  await saveKsnetPaymentKey(orderNo, commConId);

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
    return sendTo(`${SITE_URL}/checkout/failed?reason=noorder`);
  }

  /*
   * 이미 처리된 주문이면 다시 승인 확인을 하지 않습니다.
   * (새로고침·뒤로가기로 같은 요청이 다시 들어온 경우입니다)
   * ★ 무조건 완료 화면으로 보내면 안 됩니다.
   *   검토필요·승인확인실패인 주문의 손님에게 "결제가 완료되었습니다" 가 보이면,
   *   실제로는 아직 확인 중인데 완료된 줄 알고 발송을 기다립니다.
   */
  if (order.status !== 'pending_payment') {
    return sendTo(await resultUrl(order.status, orderNo));
  }

  /*
   * ── 승인 확인 ────────────────────────────────────────
   *
   * ★★ 손님이 기다리는 길입니다. 짧게 한 번만 묻습니다.
   *   예전에는 20초 타임아웃으로 두 번 물었습니다. KSNET 이 답을 안 주면
   *   손님은 결제창 안 빈 화면을 최대 41초 동안 보게 됩니다.
   *   그 사이 창을 닫으면 우리는 결과를 영영 못 받습니다.
   *
   * ★ 못 받아도 손해가 없습니다. 결제 Key 를 이미 주문에 적어 두었으므로
   *   10분마다 도는 정리가 넉넉한 시간으로 다시 물어 끝을 냅니다.
   *   손님에게는 그동안 "확인 중" 으로만 안내합니다.
   */
  let approval;
  try {
    approval = await approveKsnetPayment(commConId, order.totalAmount, {
      timeoutMs: CUSTOMER_APPROVE_TIMEOUT_MS,
      attempts: 1,
    });
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
     * ★★ 어떤 경우에도 '결제실패' 로 단정하지 않습니다.
     *   실제로는 승인이 났는데 우리만 모르는 상황일 수 있습니다.
     *
     * ★★ 다만 "우리가 기다리다 끊은 것" 과 "물어봤는데 답이 이상한 것" 은 나눕니다.
     *
     *   끊긴 경우 — 주문을 결제대기 그대로 둡니다.
     *     답이 아직 안 왔을 뿐입니다. 결제 Key 가 주문에 있으니
     *     10분마다 도는 정리가 넉넉한 시간으로 다시 물어 끝을 냅니다.
     *     여기서 승인확인실패로 보내고 사람을 부르면, 몇 초 뒤 저절로 풀릴 일에
     *     매번 알림이 울려 정작 중요한 알림을 놓칩니다.
     *
     *   답이 이상한 경우 — 지금까지처럼 승인확인실패로 두고 사람을 부릅니다.
     *     저절로 풀리지 않습니다.
     */
    if (approval?.result.timedOut) {
      return sendTo(
        `${SITE_URL}/checkout/pending?no=${encodeURIComponent(orderNo)}`
      );
    }

    const marked = await markPaymentUnconfirmed(orderNo, reason);
    await safeNotify(() => notifyPaymentUnconfirmed(marked.order, orderNo, reason));

    // 손님에게는 "확인 중" 으로 안내합니다. 실패라고 말하지 않습니다.
    return sendTo(
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
    return sendTo(`${SITE_URL}/checkout/pending?no=${encodeURIComponent(orderNo)}`);
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
    return sendTo(`${SITE_URL}/checkout/pending?no=${encodeURIComponent(orderNo)}`);
  }

  if (applied.outcome === 'declined') {
    return sendTo(
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
    return sendTo(await resultUrl('paid', orderNo));
  }

  /*
   * 'already' — 다른 요청이 먼저 처리했습니다.
   * ★ 그 요청이 결제완료로 끝냈는지, 검토필요로 끝냈는지 알 수 없습니다.
   *   지금 주문 상태를 보고 그에 맞는 화면으로 보냅니다.
   */
  return sendTo(await resultUrl(applied.order?.status ?? '', orderNo));
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

/**
 * 지금 주문 상태에 맞는 화면으로 보냅니다.
 *
 * ★ 실제 판단은 lib/payments/ksnet/result-url.ts 에 있습니다.
 *   바깥 창이 스스로 물어보는 창구(/api/payment/ksnet/status)와 같은 함수를 씁니다.
 *   두 벌로 두면 한쪽만 고쳐 서로 다른 곳으로 보내게 됩니다.
 */
async function resultUrl(status: string, orderNo: string): Promise<string> {
  return ksnetResultUrl(status, orderNo);
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
  /*
   * 두 가지로 다르게 감쌉니다.
   *   safe     — <script> 안의 문자열용. & 를 그대로 두어야 주소가 살아 있습니다.
   *   attrSafe — HTML 속성용. & 를 &amp; 로 바꿔야 규격에 맞습니다.
   * 한 가지로 뭉뚱그리면 한쪽이 반드시 깨집니다.
   */
  const safe = url.replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const attrSafe = safe.replace(/&(?!amp;|quot;|lt;)/g, '&amp;');
  const body = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>결과 화면으로 이동합니다</title>
<!--
  ★ 자바스크립트가 꺼져 있을 때만 쓰이는 마지막 길입니다.
    0초로 두면 아래 스크립트보다 먼저 움직여, 바깥 창이 아니라
    이 작은 프레임만 결과 화면으로 바뀝니다. 손님은 결제창 크기의
    상자 안에서 주문 완료를 보게 됩니다.
    스크립트가 먼저 끝낼 시간을 주려고 3초 뒤로 미룹니다.
-->
<meta http-equiv="refresh" content="3;url=${attrSafe}">
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
    <!--
      ★ "확인하고 있습니다" 라고 적지 않습니다.
        이 화면이 그려지는 시점에는 승인 확인이 이미 끝났습니다.
        확인 중이라고 하면 손님이 결과를 기다리는 중으로 오해하고,
        정말 확인이 필요한 화면(/checkout/pending)과 구분이 안 됩니다.
    -->
    <p>결과 화면으로 이동합니다.</p>
    <a href="${attrSafe}" target="_top">화면이 넘어가지 않으면 여기를 눌러 주세요</a>
  </div>
  <script>
    (function () {
      var url = "${safe}";

      /*
       * ★★ 콘솔 기록을 남깁니다.
       *   이 화면에 갇히는 일이 반복돼서, 어디서 끊기는지 눈으로 보려고 둡니다.
       *   전부 [ksnet] 로 시작하므로 개발자도구에서 그 말로 걸러 보면 됩니다.
       *   결제 금액·카드번호 같은 것은 찍지 않습니다. 주소와 결과만 남깁니다.
       */
      function log(step, extra) {
        try {
          console.log("[ksnet] 결제창: " + step, extra === undefined ? "" : extra);
        } catch (e) {}
      }

      var framed = false;
      try { framed = window.top !== window.self; } catch (e) { framed = true; }
      log("응답 화면이 그려졌습니다", { 프레임안인가: framed, 갈곳: url });

      /*
       * ★★ PC 결제는 우리 페이지(/checkout/pay) 위에 띄운 아이프레임 안에서 돕니다.
       *   결과 화면으로 넘어가야 하는 것은 이 프레임이 아니라 바깥 창입니다.
       *   바깥 창을 옮기는 길을 세 갈래로 두고 하나라도 되면 넘어가게 합니다.
       *   예전에는 top 을 직접 만지는 한 갈래뿐이라, 그것이 막히면 손님이
       *   이 화면에 갇혀 새로고침해야 했습니다.
       */

      /*
       * ① 바깥 창에게 알립니다. 바깥 창이 스스로 옮겨 갑니다.
       *   top 에 손을 못 대는 상황에서도 이 길은 열려 있습니다.
       *
       * ★★ 바로 위(parent)와 맨 바깥(top) 둘 다에 보냅니다.
       *   결제사 화면이 프레임을 한 겹 더 쓰는 경우가 있습니다.
       *   그러면 parent 는 결제사 화면이라 우리 신호를 받을 사람이 없습니다.
       *   맨 바깥이 우리 페이지이므로 그쪽에도 같이 보내야 닿습니다.
       */
      var sentTo = [];
      try {
        if (window.parent && window.parent !== window.self) {
          window.parent.postMessage({ type: "ksnet-payment-result", url: url }, "*");
          sentTo.push("바로 위(parent)");
        }
      } catch (e) {
        log("① parent 에 신호를 보내지 못했습니다", String(e));
      }
      try {
        if (window.top && window.top !== window.self && window.top !== window.parent) {
          window.top.postMessage({ type: "ksnet-payment-result", url: url }, "*");
          sentTo.push("맨 바깥(top)");
        }
      } catch (e) {
        log("① top 에 신호를 보내지 못했습니다", String(e));
      }
      if (sentTo.length > 0) log("① 신호를 보냈습니다 (postMessage)", sentTo.join(", "));
      else log("① 건너뜀 — 바깥 창이 없습니다 (프레임이 아닙니다)");

      // ② 바깥 창을 직접 옮깁니다. 같은 출처면 이 길이 가장 빠릅니다.
      try {
        if (window.top && window.top !== window.self) {
          log("② 바깥 창을 직접 옮깁니다");
          window.top.location.replace(url);
          /*
           * ★ 여기서 멈추지 않습니다.
           *   replace 가 예외 없이 지나갔어도 실제로 안 옮겨지는 경우가 있습니다.
           *   (샌드박스·정책으로 조용히 무시되는 환경)
           *   3초 뒤에도 이 화면이 그대로면 아래 ③ 으로 갑니다.
           */
          setTimeout(function () {
            log("② 이후에도 이 화면이 남아 있습니다 — ③ 으로 넘어갑니다");
            try { window.location.replace(url); } catch (e) { window.location.href = url; }
          }, 2500);
          return;
        }
        log("② 건너뜀 — 바깥 창이 없습니다");
      } catch (e) {
        log("② 바깥 창을 옮기지 못했습니다 (교차 출처일 수 있습니다)", String(e));
      }

      // ③ 그래도 안 되면 최소한 이 화면이라도 결과로 바꿉니다.
      //    (모바일은 애초에 프레임이 없어 여기로 옵니다)
      log("③ 이 화면을 결과로 바꿉니다");
      try { window.location.replace(url); } catch (e) { window.location.href = url; }

      /*
       * ★ 자바스크립트로 다 실패한 경우를 위해 head 의 meta refresh 가 3초 뒤에 움직입니다.
       *   그때가 되면 이 기록이 마지막으로 남습니다.
       */
      setTimeout(function () {
        log("3초가 지났는데 아직 여기입니다 — meta refresh 가 곧 움직입니다");
      }, 3000);
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
