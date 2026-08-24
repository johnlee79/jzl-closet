import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import { getProductBySellstarId } from '@/lib/products';
import {
  SellstarError,
  fetchSellstarProduct,
  parseSellstarId,
} from '@/lib/sellstar';

/**
 * 셀스타 상품 한 건을 가져옵니다.
 *
 * ★ 이 라우트가 CORS 를 대신 넘어갑니다.
 *   셀스타 API 는 Access-Control-Allow-Origin 이 https://sellstar.kr 로 묶여 있어
 *   관리자 브라우저에서 바로 부르면 막힙니다.
 *   브라우저 → (같은 출처) 이 라우트 → 셀스타 API 순서로 부르면 CORS 가 개입하지 않습니다.
 *   (CORS 는 브라우저가 거는 제약이지 서버끼리는 해당이 없습니다)
 *
 * ★ 이미 가져온 상품인지도 함께 알려 줍니다. 화면에서 덮어쓸지 건너뛸지 고릅니다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // ★ isAdmin 은 async 입니다. await 를 빠뜨리면 Promise 가 늘 참이라
  //   인증이 통째로 무력화됩니다. (실제로 그 상태였습니다)
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  }

  const input = request.nextUrl.searchParams.get('id') ?? '';
  const id = parseSellstarId(input);
  if (!id) {
    return NextResponse.json(
      { error: '셀스타 상품 주소나 상품번호를 확인해 주세요.' },
      { status: 400 }
    );
  }

  try {
    const product = await fetchSellstarProduct(id);

    // 같은 셀스타 상품을 이미 가져왔는지 확인합니다.
    const existing = await getProductBySellstarId(id);

    return NextResponse.json(
      {
        product,
        existing: existing
          ? { id: existing.id, slug: existing.slug, name: existing.name }
          : null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message =
      error instanceof SellstarError
        ? error.message
        : error instanceof Error
          ? error.message
          : '상품을 가져오지 못했습니다.';
    console.error('[import/sellstar]', id, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
