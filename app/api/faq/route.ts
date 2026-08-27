import { NextResponse } from 'next/server';
import { getVisibleFaqs, stripTags } from '@/lib/notices';

/**
 * ================================================================
 * ** 채팅 상담창의 「자주 묻는 질문」 (2-C, 2026-08-27)
 * ================================================================
 *
 * ** 왜 화면에 미리 실어 보내지 않고 따로 가져오나요
 *   손님 화면(상품 목록·상품 상세 42장 등)은 미리 구워 두는 정적 화면입니다.
 *   질문 8개와 답변을 거기에 실으면 **모든 화면의 HTML 이 그만큼 무거워집니다.**
 *   채팅창을 여는 손님은 일부인데 모두가 그 무게를 집니다.
 *   그래서 손님이 「자주 묻는 질문」을 **누를 때 한 번만** 가져옵니다.
 *   정적 생성도 그대로입니다. 굽는 것에 아무 영향이 없습니다.
 *
 * ** 답변은 여기서 **글자로 바꿔서** 내보냅니다.
 *   채팅창은 HTML 을 아예 손에 쥐지 않습니다. 말풍선에 태그를 꽂아 넣는
 *   자리를 새로 만들지 않습니다. (lib/notices.ts 의 stripTags 주석)
 *
 * ** 답이 비어 있는 질문은 여기 오기 전에 이미 빠져 있습니다.
 *   (getVisibleFaqs)
 *
 * ** 로그인 여부와 상관없이 누구나 볼 수 있는 내용입니다.
 *   개인정보가 없습니다. 그래서 따로 검사하지 않습니다.
 * ================================================================
 */

/** 한 번에 내보낼 질문 수의 상한. */
const MAX_ITEMS = 12;

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const all = await getVisibleFaqs();

    /*
     * ** 상한을 넘으면 **왜 잘랐는지 반드시 기록에 남깁니다.**
     *   조용히 자르면 "왜 저 질문이 안 보이지" 를 아무도 못 찾습니다.
     */
    if (all.length > MAX_ITEMS) {
      console.warn(
        `[faq] 노출 중인 질문이 ${all.length}개라 앞의 ${MAX_ITEMS}개만 내보냅니다. ` +
          '관리자에서 안 쓰는 질문의 노출을 꺼 주세요.'
      );
    }

    const items = all.slice(0, MAX_ITEMS).map((row) => ({
      id: row.id,
      question: row.title,
      answer: stripTags(row.content),
    }));

    return NextResponse.json(
      { items },
      {
        headers: {
          // 손님 브라우저가 잠깐 들고 있어도 됩니다. 자주 안 바뀝니다.
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    /*
     * ** 여기서 터져도 채팅창은 살아 있어야 합니다.
     *   빈 목록을 돌려주면 채팅은 「지금은 준비된 답변이 없습니다」 로
     *   갈아탑니다. 손님 화면이 죽지 않습니다.
     */
    console.error('[faq] 질문을 읽지 못했습니다:', error);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
