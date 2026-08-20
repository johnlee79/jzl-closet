import 'server-only';

import {
  KSNET_REPLY_PARAMS,
  KSNET_REPLY_PARAM_STRING,
  KSPAY_APPROVE_URL,
  type KsnetReplyKey,
} from '@/lib/payments/ksnet/config';
import { decodeEuckr, euckrFormBody, ksnetAmount } from '@/lib/payments/ksnet/encode';

/**
 * ============================================================
 * 최종 승인 확인 — 이 작업에서 가장 중요한 파일
 * ============================================================
 *
 * 결제창이 "성공" 이라고 말했다고 해서 승인이 난 것이 아닙니다.
 * 결제창의 응답은 손님 브라우저를 거쳐 옵니다. 얼마든지 조작될 수 있습니다.
 * 반드시 우리 서버가 KSNET 서버에 직접 물어봐야 합니다. 그 일을 여기서 합니다.
 *
 * 요청
 *   POST http://kspay.ksnet.to/store/KSPayWebV1.4/web_host/recv_post.jsp
 *   sndCommConId  결제창이 돌려준 결제 Key (reCommConId)
 *   sndActionType 1
 *   sndAmount     결제 금액  ← ★ 반드시 우리 DB 의 금액을 넣습니다
 *   sndRpyParams  받고 싶은 항목을 백틱(`)으로 이어 붙인 문자열
 *
 * 응답
 *   백틱(`) 으로 이어진 문자열이고 EUC-KR 입니다.
 *   첫 조각은 버리고 두 번째부터 sndRpyParams 순서대로 대응됩니다.
 *   (PHP 샘플의 $tmpvals[$i+1])
 */

export type KsnetApproveResult = {
  /** 통신·파싱까지 정상으로 끝났는지. 승인 성공 여부와 다릅니다. */
  ok: boolean;
  /** 'O' 성공 / 'X' 거절 */
  authyn: string;
  /** KSNET 거래번호 — 취소·조회의 키값 */
  trno: string;
  /** 승인번호(성공) 또는 에러코드(실패) */
  authno: string;
  /** 승인 금액 (숫자). 못 읽으면 null */
  amount: number | null;
  /** 우리가 보낸 주문번호가 그대로 돌아옵니다 */
  ordno: string;
  /** 거래일자 + 거래시각 원문 */
  tradeAt: string;
  issuerCode: string;
  acquirerCode: string;
  installment: number | null;
  resultCode: string;
  /** msg1 msg2 를 이어 붙인 한글 메시지 (UTF-8) */
  message: string;
  /** 받은 원문 그대로 — payment_logs 에 남깁니다 */
  raw: string;
  /** 항목별로 나눈 값 */
  fields: Partial<Record<KsnetReplyKey, string>>;
  /** 통신·파싱이 실패한 이유 */
  error?: string;
};

/** 결제창이 돌려주는 값 중 우리가 쓰는 것 */
export type KsnetReturnPayload = {
  /** 결제 Key. 이 값으로 승인을 확인합니다. */
  commConId: string;
  /** 결제창이 알려 준 주문번호 — 참고용입니다. 믿지 않습니다. */
  orderNo: string;
};

const TIMEOUT_MS = 20_000;

/**
 * 승인 확인 한 번.
 *
 * @param commConId 결제창이 돌려준 결제 Key (reCommConId)
 * @param amount    ★ 우리 DB 에서 읽은 결제 금액. 클라이언트 값을 넣지 마세요.
 */
async function requestApprove(
  commConId: string,
  amount: number
): Promise<KsnetApproveResult> {
  const body = euckrFormBody({
    sndCommConId: commConId,
    sndActionType: '1',
    sndAmount: ksnetAmount(amount),
    sndRpyParams: KSNET_REPLY_PARAM_STRING,
  });

  const response = await fetch(KSPAY_APPROVE_URL, {
    method: 'POST',
    headers: {
      // ★ charset 을 밝혀 둡니다. 밝히지 않으면 상대가 UTF-8 로 읽을 수 있습니다.
      'Content-Type': 'application/x-www-form-urlencoded; charset=euc-kr',
    },
    body,
    // 승인 확인은 캐시되면 안 됩니다.
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // ★ text() 를 쓰면 안 됩니다. UTF-8 로 읽어 한글이 깨집니다.
  const raw = decodeEuckr(await response.arrayBuffer());

  if (!response.ok) {
    return failure(raw, `승인 확인 응답이 HTTP ${response.status} 입니다.`);
  }

  return parseApproveResponse(raw);
}

/**
 * 승인 확인 — 실패하면 한 번 더 시도합니다.
 *
 * ★ 왜 재시도하는가
 *   통신이 끊기면 "승인은 났는데 우리만 모르는" 상태가 됩니다.
 *   문서에 따르면 당일에 한해 같은 요청(sndActionType=1)으로 다시 조회할 수 있습니다.
 *   그래서 실패를 곧바로 실패로 확정하지 않고 한 번 더 물어봅니다.
 *
 * ★ 재시도해도 실패하면 여기서 판단하지 않습니다.
 *   호출부가 주문을 '승인확인실패' 로 두고 사람에게 알립니다.
 *   절대 '결제실패' 로 단정하지 마세요. 돈은 빠져나갔을 수 있습니다.
 */
export async function approveKsnetPayment(
  commConId: string,
  amount: number
): Promise<{ result: KsnetApproveResult; attempts: number }> {
  let last: KsnetApproveResult | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await requestApprove(commConId, amount);
      // 파싱까지 성공했으면 승인 거절이어도 그것이 확정된 답입니다. 재시도하지 않습니다.
      if (result.ok) return { result, attempts: attempt };
      last = result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '승인 확인 중 오류';
      last = failure('', message);
    }

    // 곧바로 다시 두드리면 같은 이유로 또 실패합니다. 잠깐 쉽니다.
    if (attempt === 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return { result: last ?? failure('', '승인 확인에 실패했습니다.'), attempts: 2 };
}

/* ------------------------------------------------------------------
 * 응답 파싱
 * ------------------------------------------------------------------ */

/**
 * 백틱으로 이어진 응답을 항목별로 나눕니다.
 *
 * ★ 첫 조각은 버립니다. 두 번째 조각이 sndRpyParams 의 첫 항목입니다.
 *   이 규칙을 어기면 authyn 자리에 엉뚱한 값이 들어가
 *   거절된 결제가 성공으로 보일 수 있습니다. 절대 바꾸지 마세요.
 */
export function parseApproveResponse(raw: string): KsnetApproveResult {
  const text = String(raw ?? '').trim();
  if (!text) return failure(raw, '승인 확인 응답이 비어 있습니다.');

  const chunks = text.split('`');
  if (chunks.length < 2) {
    return failure(raw, '승인 확인 응답 형식을 알 수 없습니다.');
  }

  const fields: Partial<Record<KsnetReplyKey, string>> = {};
  KSNET_REPLY_PARAMS.forEach((key, index) => {
    const value = chunks[index + 1];
    if (value !== undefined) fields[key] = value.trim();
  });

  const authyn = (fields.authyn ?? '').toUpperCase();
  if (authyn !== 'O' && authyn !== 'X') {
    // 승인 여부를 못 읽으면 성공으로 넘겨선 안 됩니다.
    return {
      ...failure(raw, `승인 여부(authyn)를 읽지 못했습니다: "${fields.authyn ?? ''}"`),
      fields,
    };
  }

  const amountText = (fields.amt ?? '').replace(/[^0-9]/g, '');
  const halbu = (fields.halbu ?? '').replace(/[^0-9]/g, '');

  return {
    ok: true,
    authyn,
    trno: fields.trno ?? '',
    authno: fields.authno ?? '',
    amount: amountText ? Number(amountText) : null,
    ordno: fields.ordno ?? '',
    tradeAt: `${fields.trddt ?? ''}${fields.trdtm ?? ''}`,
    issuerCode: fields.isscd ?? '',
    acquirerCode: fields.aqucd ?? '',
    installment: halbu ? Number(halbu) : null,
    resultCode: fields.result ?? '',
    message: [fields.msg1, fields.msg2].filter(Boolean).join(' ').trim(),
    raw: text,
    fields,
  };
}

function failure(raw: string, error: string): KsnetApproveResult {
  return {
    ok: false,
    authyn: '',
    trno: '',
    authno: '',
    amount: null,
    ordno: '',
    tradeAt: '',
    issuerCode: '',
    acquirerCode: '',
    installment: null,
    resultCode: '',
    message: '',
    raw: String(raw ?? ''),
    fields: {},
    error,
  };
}
