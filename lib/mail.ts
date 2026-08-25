import 'server-only';

import { courierName, trackingUrl } from '@/lib/couriers';
import { formatPrice } from '@/lib/product-utils';
import { sanitizeRichText } from '@/lib/product-utils';
import { getCachedCopy } from '@/lib/settings';
import { paymentMethodLabel } from '@/lib/site-config';
import { SITE_URL } from '@/lib/store';
import type { Order } from '@/lib/types';

/**
 * ============================================================
 * 손님에게 보내는 메일 (Resend)
 * ============================================================
 *
 * ★ 텔레그램(lib/telegram.ts)과 똑같은 세 가지 원칙을 따릅니다.
 *   1) 환경변수(RESEND_API_KEY)가 비어 있으면 아무 일도 하지 않고
 *      조용히 넘어갑니다. 오류를 내지 않습니다.
 *   2) 메일 실패가 주문 저장을 막으면 안 됩니다.
 *      호출부에서 await 하더라도 이 파일의 함수는 절대 throw 하지 않습니다.
 *   3) 보낼 주소가 없으면 그냥 넘어갑니다.
 *
 * ★★ 패키지를 새로 넣지 않았습니다.
 *   resend 라이브러리가 하는 일은 아래 fetch 한 번이 전부입니다.
 *   텔레그램도 같은 방식으로 붙어 있어, 두 연동이 같은 모양이 됩니다.
 *   의존성이 하나 늘면 그만큼 보안 갱신을 따라가야 할 것도 늘어납니다.
 *
 * ★★ 본문을 로그에 남기지 않습니다.
 *   주소·연락처·구매 내역이 들어 있습니다. 남기는 것은 주문번호와
 *   성공/실패뿐입니다.
 */

const API_URL = 'https://api.resend.com/emails';

/**
 * 관리자에서 고친 인사말·맺음말을 가져옵니다.
 *
 * ★★ 값(주문번호·금액·계좌·송장번호)은 여기서 오지 않습니다.
 *   코드가 채웁니다. 문구에 숫자를 적어 두면 설정과 메일이 서로 다른 말을 합니다.
 *   관리자가 고칠 수 있는 것은 인사말과 맺음말 두 문단뿐입니다.
 *
 * ★ 문구를 못 읽어도 메일은 나갑니다. 기본값으로 채웁니다.
 *   설정 조회가 잠깐 안 된다고 주문 메일이 통째로 안 나가면 안 됩니다.
 */
async function copyLines(
  key: 'orderMail' | 'shippingMail',
  fallback: [string, string]
): Promise<[string, string]> {
  try {
    const copy = await getCachedCopy();
    const section = copy[key] ?? [];
    const first = sanitizeRichText(section[0]?.body ?? '') || fallback[0];
    const second = sanitizeRichText(section[1]?.body ?? '') || fallback[1];
    return [first, second];
  } catch {
    return fallback;
  }
}

/**
 * 보내는 사람.
 *
 * ★ Resend 에서 도메인 인증(SPF·DKIM)을 마친 도메인이어야 합니다.
 *   인증하지 않은 주소로 보내면 Resend 가 거절하거나 스팸함으로 갑니다.
 * ★ 환경변수로 바꿀 수 있게 해 두었습니다. 도메인이 바뀔 때 코드를
 *   고치지 않아도 됩니다.
 */
function sender(): string {
  return process.env.MAIL_FROM?.trim() || 'JZL CLOSET <order@jzl.kr>';
}

/** 답장 받을 주소. 손님이 메일에 그대로 답장하는 일이 흔합니다. */
function replyTo(): string | undefined {
  return process.env.MAIL_REPLY_TO?.trim() || undefined;
}

function apiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? key : null;
}

/** 메일을 쓸 수 있는 상태인지 — 관리자 설정 안내에 씁니다. */
export function isMailConfigured(): boolean {
  return apiKey() !== null;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 한 통 보냅니다.
 *
 * ★ 실패하면 콘솔에만 남기고 false 를 돌려줍니다. 예외를 던지지 않습니다.
 * ★ 실패 내용에 본문을 넣지 않습니다. 주문번호와 응답 코드만 남깁니다.
 */
async function send(options: {
  to: string;
  subject: string;
  html: string;
  /** 로그에 남길 이름표. 개인정보가 아닌 값만 넣으세요. */
  tag: string;
}): Promise<boolean> {
  /*
   * ★★ 건너뛸 때도 반드시 남깁니다. (2026-08-25)
   *
   *   처음에는 "환경변수가 없으면 조용히 넘어간다" 로 만들었습니다.
   *   텔레그램과 같은 원칙이라 그렇게 했는데, 실제로 메일이 안 나갔을 때
   *   아무 흔적이 없어 원인을 찾을 수가 없었습니다.
   *   Resend 쪽에도 기록이 없고 우리 로그에도 없으니, 코드가 안 불린 것인지
   *   불렸는데 건너뛴 것인지조차 구분이 안 됐습니다.
   *
   *   "조용히" 는 손님 화면에 대한 약속이지 로그에 대한 약속이 아닙니다.
   *   주문은 그대로 저장되고 화면도 그대로지만, 왜 안 보냈는지는 남깁니다.
   *
   * ★ 그래도 본문·주소·이름은 남기지 않습니다. 주문번호와 이유만 남깁니다.
   */
  const key = apiKey();
  if (!key) {
    console.warn(
      `[mail] 건너뜁니다 (${options.tag}): RESEND_API_KEY 가 비어 있습니다. ` +
        'Vercel 환경변수에 넣고 Redeploy 했는지, Production 에 체크했는지 확인하세요.'
    );
    return false;
  }

  const to = options.to.trim();
  if (!to) {
    console.warn(`[mail] 건너뜁니다 (${options.tag}): 받는 주소가 비어 있습니다.`);
    return false;
  }

  console.log(`[mail] 보냅니다 (${options.tag}) → Resend`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender(),
        to: [to],
        subject: options.subject,
        html: options.html,
        ...(replyTo() ? { reply_to: replyTo() } : {}),
      }),
      /*
       * ★ 손님을 기다리게 하는 길에서 부를 수 있으므로 오래 붙잡지 않습니다.
       *   못 보내도 주문은 이미 저장되어 있습니다.
       */
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      /*
       * ★ Resend 가 왜 거절했는지 함께 남깁니다.
       *   가장 흔한 것이 "인증하지 않은 도메인으로 보내려 함" 인데,
       *   상태 코드만으로는 알 수 없습니다. 응답 본문에 이유가 들어 있습니다.
       * ★ 응답 본문에는 우리가 보낸 메일 내용이 들어 있지 않습니다.
       *   거절 사유만 있습니다. 그래서 남겨도 안전합니다.
       */
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        /* 본문을 못 읽어도 상태 코드는 남습니다. */
      }
      console.warn(
        `[mail] 보내지 못했습니다 (${options.tag}): HTTP ${response.status} ${detail}`
      );
      return false;
    }
    console.log(`[mail] 보냈습니다 (${options.tag})`);
    return true;
  } catch (error) {
    console.warn(
      `[mail] 보내지 못했습니다 (${options.tag}):`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

/* ------------------------------------------------------------------
 * 서식
 * ------------------------------------------------------------------
 *
 * ★★ 표(table)로 짭니다. div + flex 는 메일 프로그램에서 깨집니다.
 *   특히 아웃룩은 최신 CSS 를 거의 못 읽습니다.
 * ★★ 스타일을 태그 안에 직접 씁니다. <style> 블록은 지메일이 지웁니다.
 * ★ 사이트와 같은 색을 씁니다. 종이색 #F6F5F2 · 글자 #14141A
 * ★ 이미지를 쓰지 않습니다. 대부분의 메일 프로그램이 이미지를 막아 두는데,
 *   그 상태에서도 내용이 온전히 읽혀야 합니다.
 * ------------------------------------------------------------------ */

const INK = '#14141A';
const MUTED = '#6B6B72';
const LINE = '#E3E1DC';
const PAPER = '#F6F5F2';

/** 바깥 껍데기 — 제목과 맺음말이 늘 같은 자리에 오게 합니다. */
function shell(title: string, inner: string): string {
  return `<!doctype html>
<html lang="ko"><body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${LINE};">
  <tr><td style="padding:28px 28px 0;">
    <p style="margin:0;font-size:13px;letter-spacing:3px;color:${MUTED};font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">JZL CLOSET</p>
    <h1 style="margin:12px 0 0;font-size:20px;line-height:1.5;color:${INK};font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">${escapeHtml(title)}</h1>
  </td></tr>
  <tr><td style="padding:20px 28px 28px;font-size:15px;line-height:1.85;color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">
${inner}
  </td></tr>
  <tr><td style="padding:0 28px 28px;">
    <p style="margin:0;padding-top:16px;border-top:1px solid ${LINE};font-size:13px;line-height:1.8;color:${MUTED};font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">
      이 메일은 발신 전용이 아닙니다. 궁금한 점은 그대로 답장해 주세요.<br>
      <a href="${SITE_URL}" style="color:${MUTED};">${SITE_URL.replace(/^https?:\/\//, '')}</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** 이름-값 한 줄 */
function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0 6px 16px;font-size:15px;color:${INK};">${value}</td>
  </tr>`;
}

function button(href: string, text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
    <tr><td style="background:${INK};">
      <a href="${href}" style="display:inline-block;padding:12px 22px;font-size:15px;color:#FFFFFF;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">${escapeHtml(text)}</a>
    </td></tr>
  </table>`;
}

/** 주문한 상품 목록 */
function itemsTable(order: Order): string {
  const live = order.items.filter((item) => item.itemStatus !== 'cancelled');
  const lines = live
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:15px;color:${INK};">
          ${escapeHtml(item.productName)}
          ${item.optionKey ? `<br><span style="font-size:13px;color:${MUTED};">${escapeHtml(item.optionKey)}</span>` : ''}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${MUTED};text-align:right;white-space:nowrap;">${item.quantity}개</td>
        <td style="padding:8px 0 8px 12px;border-bottom:1px solid ${LINE};font-size:15px;color:${INK};text-align:right;white-space:nowrap;">${formatPrice(item.lineTotal)}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${lines}</table>`;
}

/** 금액 정리 */
function amountTable(order: Order): string {
  const shipping = order.shippingFee + order.extraShippingFee;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
    ${row('상품 금액', formatPrice(order.itemsTotal))}
    ${row('배송비', shipping > 0 ? formatPrice(shipping) : '무료')}
    ${order.discount > 0 ? row('할인·포인트', `- ${formatPrice(order.discount)}`) : ''}
    <tr><td colspan="2" style="padding-top:10px;border-top:1px solid ${LINE};"></td></tr>
    <tr>
      <td style="padding:6px 0;font-size:15px;color:${INK};font-weight:600;">결제 금액</td>
      <td style="padding:6px 0 6px 16px;font-size:18px;color:${INK};font-weight:600;text-align:right;">${formatPrice(order.totalAmount)}</td>
    </tr>
  </table>`;
}

function addressBlock(order: Order): string {
  const full = [order.address1, order.address2].filter(Boolean).join(' ');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
    ${row('받는 분', escapeHtml(order.receiverName))}
    ${row('연락처', escapeHtml(order.receiverPhone))}
    ${row('주소', `${order.postcode ? `(${escapeHtml(order.postcode)}) ` : ''}${escapeHtml(full)}`)}
    ${order.deliveryMemo ? row('배송 메모', escapeHtml(order.deliveryMemo)) : ''}
  </table>`;
}

/* ------------------------------------------------------------------
 * 보내는 함수 두 개
 * ------------------------------------------------------------------ */

/**
 * ① 주문이 접수되었습니다.
 *
 * ★★ 언제 부르는가 — 결제수단에 따라 다릅니다.
 *   무통장입금 — 주문이 저장된 직후. 계좌를 바로 알려야 합니다.
 *   신용카드   — 결제완료로 확정된 순간에만.
 *     주문 저장 시점에 보내면 결제창을 열었다 닫은 손님에게
 *     "주문이 접수되었습니다" 가 갑니다. 텔레그램 알림도 같은 이유로
 *     카드는 결제 후에 보냅니다. 같은 규칙을 따릅니다.
 *
 * @param bank 무통장입금일 때만 넘깁니다. 계좌와 기한을 함께 안내합니다.
 */
export async function sendOrderMail(
  order: Order,
  bank?: { bankName: string; accountNo: string; accountHolder: string; deadline: string } | null
): Promise<boolean> {
  const to = (order.ordererEmail ?? '').trim();
  if (!to) {
    // ★ 주소가 왜 없는지 알아야 합니다. 2026-08-25 부터 주문서에서 필수인데
    //   여기까지 빈 값이 온다면 그전에 들어온 주문이거나 다른 길로 만든 주문입니다.
    console.warn(`[mail] 주문 접수 메일 건너뜀 (${order.orderNo}): 이메일이 비어 있습니다.`);
    return false;
  }

  const lookup = `${SITE_URL}/order-lookup`;
  const [greeting, closing] = await copyLines('orderMail', [
    '<p>주문해 주셔서 감사합니다. 아래 내용으로 접수되었습니다.</p>',
    '<p>주문번호와 주문하신 연락처로 주문 조회를 하실 수 있습니다.</p>',
  ]);

  const bankBlock = bank
    ? `<div style="margin-top:20px;padding:16px;background:${PAPER};border:1px solid ${LINE};">
        <p style="margin:0 0 8px;font-size:15px;color:${INK};font-weight:600;">입금 계좌</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('은행', escapeHtml(bank.bankName))}
          ${row('계좌번호', `<strong>${escapeHtml(bank.accountNo)}</strong>`)}
          ${row('예금주', escapeHtml(bank.accountHolder))}
          ${bank.deadline ? row('입금 기한', escapeHtml(bank.deadline)) : ''}
        </table>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.8;color:${MUTED};">
          입금이 확인되면 준비를 시작합니다. 입금자명이 주문자와 다르면 알려 주세요.
        </p>
      </div>`
    : '';

  const inner = `
    ${greeting}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      ${row('주문번호', `<strong>${escapeHtml(order.orderNo)}</strong>`)}
      ${row('결제수단', escapeHtml(paymentMethodLabel(order.paymentMethod)))}
    </table>

    <p style="margin:22px 0 0;font-size:15px;color:${INK};font-weight:600;">주문 상품</p>
    ${itemsTable(order)}
    ${amountTable(order)}

    <p style="margin:22px 0 0;font-size:15px;color:${INK};font-weight:600;">배송지</p>
    ${addressBlock(order)}
    ${bankBlock}

    ${button(lookup, '주문 조회하기')}
    <div style="margin:6px 0 0;font-size:13px;line-height:1.8;color:${MUTED};">${closing}</div>`;

  return send({
    to,
    subject: `[JZL CLOSET] 주문이 접수되었습니다 (${order.orderNo})`,
    html: shell('주문이 접수되었습니다', inner),
    tag: order.orderNo,
  });
}

/**
 * ② 상품을 보냈습니다.
 *
 * ★★ setTracking() 한 곳에서만 부릅니다.
 *   관리자 주문 상세와 일괄 송장 등록이 둘 다 그 함수를 거칩니다.
 *   두 곳에 따로 넣으면 나중에 한쪽만 고치게 됩니다.
 *
 * ★★ 상태가 실제로 '배송중' 으로 바뀔 때만 부릅니다.
 *   송장을 고쳤을 때는 보내지 않습니다. 오타를 고칠 때마다 손님에게
 *   메일이 가면 안 됩니다.
 */
export async function sendShippingMail(order: Order): Promise<boolean> {
  const to = (order.ordererEmail ?? '').trim();
  if (!to) {
    console.warn(`[mail] 배송 안내 메일 건너뜀 (${order.orderNo}): 이메일이 비어 있습니다.`);
    return false;
  }

  const link = trackingUrl(order.courier, order.trackingNo);
  const name = courierName(order.courier);
  const [greeting, closing] = await copyLines('shippingMail', [
    '<p>주문하신 상품을 발송했습니다.</p>',
    '<p>택배사에 정보가 올라오기까지 몇 시간 걸릴 수 있습니다.</p>',
  ]);

  const inner = `
    ${greeting}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      ${row('주문번호', escapeHtml(order.orderNo))}
      ${row('택배사', escapeHtml(name || order.courier))}
      ${row('송장번호', `<strong>${escapeHtml(order.trackingNo)}</strong>`)}
    </table>

    ${link ? button(link, '배송 조회하기') : ''}
    <div style="margin:${link ? '6px' : '16px'} 0 0;font-size:13px;line-height:1.8;color:${MUTED};">
      ${closing}
      ${
        link
          ? ''
          : '<p>조회 링크를 만들지 못했습니다. 택배사 홈페이지에서 위 송장번호로 조회해 주세요.</p>'
      }
    </div>

    <p style="margin:22px 0 0;font-size:15px;color:${INK};font-weight:600;">보내는 상품</p>
    ${itemsTable(order)}

    <p style="margin:22px 0 0;font-size:15px;color:${INK};font-weight:600;">받는 곳</p>
    ${addressBlock(order)}`;

  return send({
    to,
    subject: `[JZL CLOSET] 상품을 보냈습니다 (${order.orderNo})`,
    html: shell('상품을 보냈습니다', inner),
    tag: order.orderNo,
  });
}
