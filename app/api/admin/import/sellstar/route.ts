import { NextResponse, type NextRequest } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import { getProductBySellstarId, getProductBySource } from '@/lib/products';
import {
  SellstarError,
  fetchSellstarProduct,
  parseSellstarId,
} from '@/lib/sellstar';
import {
  NewyorktrdError,
  fetchNewyorktrdProduct,
  isNewyorktrdInput,
  parseNewyorktrdId,
  type NewyorktrdProduct,
} from '@/lib/newyorktrd';
import type { SellstarProduct } from '@/lib/sellstar';

/**
 * 상품 가져오기 — 셀스타 · 뉴욕트렌딕 공용 라우트.
 *
 * ★ 입력 주소로 어느 쪽인지 자동 판단합니다.
 *   · "newyorktrd" 가 들어 있거나, 접두어 (nyt · 뉴욕 · 뉴욕트렌딕) 가 붙으면 → 뉴욕트렌딕
 *   · 그 밖은 → 셀스타 (기존 동작 유지)
 *
 * ★ 왜 /sellstar 라우트에 그대로 둡니까
 *   가져오기 화면이 이 주소로 부릅니다. 라우트를 바꾸면 화면도 함께 바꿔야 하고,
 *   /api/admin/import/sellstar 는 외부에서 호출하지 않는 내부 API 라 경로 이름이
 *   바뀌어도 문제가 없긴 합니다만, 당장은 이름만 두고 안을 바꿉니다.
 *
 * ★ 이 라우트가 CORS 를 대신 넘어갑니다.
 *   셀스타 API 는 Access-Control-Allow-Origin 이 https://sellstar.kr 로 묶여 있어
 *   관리자 브라우저에서 바로 부르면 막힙니다. 뉴욕트렌딕은 HTML 긁기라 CORS 는
 *   해당 없지만, 두 쪽을 같은 자리에서 다루려고 서버를 거쳐 부릅니다.
 *
 * ★ 이미 가져온 상품인지도 함께 알려 줍니다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 응답 모양 — 두 소스를 공통된 모양으로 돌려줍니다. 화면이 하나의 코드로 처리합니다. */
type SharedProductShape = {
  source: 'sellstar' | 'newyorktrd';
  /** 원본 쪽 상품번호 */
  sourceProductNo: number;
  /** 원본 상품 주소 — 저장과 "원본 보기" 링크에 씁니다 */
  sourceUrl: string;
  /** 호환용 — 기존 화면 코드가 sellstarId 로 받으므로 그대로 둡니다 */
  sellstarId: number;
  name: string;
  price: number;
  salePrice: number;
  /** 뉴욕트렌딕이 쥐어 준 브랜드명. 셀스타에서는 비어 옵니다. */
  brandName: string;
  gallery: { url: string; width: number; height: number }[];
  blocks: (
    | { kind: 'image'; url: string; reseller: boolean; gif: boolean }
    | { kind: 'text'; body: string }
  )[];
  optionGroups: { name: string; values: string[] }[];
  variants: {
    key: string;
    label: string;
    stock: number | null;
    soldOut: boolean;
    extraPrice: number;
  }[];
  /** 셀스타는 배송 안내를 함께 돌려줍니다. 뉴욕트렌딕은 null. */
  shipping: SellstarProduct['shipping'];
  warnings: string[];
};

function sellstarToShared(product: SellstarProduct): SharedProductShape {
  return {
    source: 'sellstar',
    sourceProductNo: product.sellstarId,
    sourceUrl: product.storeId
      ? `https://sellstar.kr/${product.storeId}/product/${product.sellstarId}`
      : '',
    sellstarId: product.sellstarId,
    name: product.name,
    price: product.price,
    salePrice: product.salePrice,
    brandName: '',
    gallery: product.gallery,
    blocks: product.blocks,
    optionGroups: product.optionGroups,
    variants: product.variants.map((variant) => ({
      key: variant.key,
      label: variant.label,
      stock: variant.stock,
      soldOut: variant.soldOut,
      extraPrice: 0,
    })),
    shipping: product.shipping,
    warnings: product.warnings,
  };
}

function newyorktrdToShared(product: NewyorktrdProduct): SharedProductShape {
  return {
    source: 'newyorktrd',
    sourceProductNo: product.newyorktrdId,
    sourceUrl: product.sourceUrl,
    sellstarId: 0,
    name: product.name,
    price: product.price,
    salePrice: product.salePrice,
    brandName: product.brandName,
    gallery: product.gallery,
    blocks: product.blocks,
    optionGroups: product.optionGroups,
    variants: product.variants.map((variant) => ({
      key: variant.key,
      label: variant.label,
      stock: variant.stock,
      soldOut: variant.soldOut,
      extraPrice: variant.extraPrice,
    })),
    shipping: null,
    warnings: product.warnings,
  };
}

export async function GET(request: NextRequest) {
  // ★ isAdmin 은 async 입니다. await 를 빠뜨리면 Promise 가 늘 참이라
  //   인증이 통째로 무력화됩니다. (실제로 그 상태였습니다)
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  }

  const input = (request.nextUrl.searchParams.get('id') ?? '').trim();
  if (!input) {
    return NextResponse.json(
      { error: '셀스타·뉴욕트렌딕 상품 주소나 상품번호를 넣어 주세요.' },
      { status: 400 }
    );
  }

  /* ── 뉴욕트렌딕 ───────────────────────────────────────── */
  if (isNewyorktrdInput(input)) {
    const id = parseNewyorktrdId(input);
    if (!id) {
      return NextResponse.json(
        { error: '뉴욕트렌딕 상품 주소나 상품번호를 확인해 주세요.' },
        { status: 400 }
      );
    }

    try {
      const product = await fetchNewyorktrdProduct(id);
      const existing = await getProductBySource('newyorktrd', id);

      return NextResponse.json(
        {
          product: newyorktrdToShared(product),
          existing: existing
            ? { id: existing.id, slug: existing.slug, name: existing.name }
            : null,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      const message =
        error instanceof NewyorktrdError
          ? error.message
          : error instanceof Error
            ? error.message
            : '뉴욕트렌딕 상품을 가져오지 못했습니다.';
      console.error('[import/newyorktrd]', id, message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  /* ── 셀스타 (기본) ────────────────────────────────────── */
  const id = parseSellstarId(input);
  if (!id) {
    return NextResponse.json(
      { error: '셀스타 상품 주소나 상품번호를 확인해 주세요.' },
      { status: 400 }
    );
  }

  try {
    const product = await fetchSellstarProduct(id);
    const existing = await getProductBySellstarId(id);

    return NextResponse.json(
      {
        product: sellstarToShared(product),
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
