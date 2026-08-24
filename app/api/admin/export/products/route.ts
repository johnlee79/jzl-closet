import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin-guard';
import { brandLabel } from '@/lib/brands';
import { categoryNameKo, findSubCategory } from '@/lib/categories';
import { getProducts } from '@/lib/products';
import { getBrands, getCategories } from '@/lib/taxonomy';

/**
 * 상품 전체를 CSV 로 내려받습니다. (관리자 > 설정 > 데이터 내보내기)
 *
 * ★ 라이브러리를 추가하지 않고 문자열로 직접 만듭니다.
 *   맨 앞에 UTF-8 BOM(﻿)을 붙여야 엑셀에서 한글이 깨지지 않습니다.
 */
export const dynamic = 'force-dynamic';

const HEADERS = [
  'slug',
  '상품명',
  '브랜드',
  '대분류',
  '소분류',
  '판매가',
  '정상가',
  '성별',
  '시즌',
  '원산지',
  '제조사',
  '노출',
  '품절',
  '신상품',
  '세일',
  '무료배송',
  '진열순서',
  '옵션조합수',
  '재고합계',
  '이미지수',
  '요약',
  '등록일',
  '수정일',
];

/** CSV 한 칸. 큰따옴표·콤마·줄바꿈이 있으면 감싸고 따옴표를 두 번 씁니다. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // = + - @ 로 시작하면 엑셀이 수식으로 읽습니다. 앞에 작은따옴표를 붙여 막습니다.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /["\n,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function yesNo(value: boolean): string {
  return value ? 'Y' : 'N';
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 19).replace('T', ' ');
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const [products, categories, brands] = await Promise.all([
    getProducts({ includeHidden: true }),
    getCategories(),
    getBrands(),
  ]);

  const lines = [HEADERS.map(cell).join(',')];

  for (const product of products) {
    const sub = product.subCategorySlug
      ? findSubCategory(categories, product.categorySlug, product.subCategorySlug)
      : undefined;

    // 재고를 관리하는 조합만 더합니다. (비어 있는 조합은 세지 않습니다)
    const managed = product.optionCombinations.filter((item) => item.stock !== null);
    const stockTotal = managed.reduce((sum, item) => sum + (item.stock ?? 0), 0);

    lines.push(
      [
        product.slug,
        product.name,
        product.brandSlug ? brandLabel(brands, product.brandSlug) : '',
        categoryNameKo(categories, product.categorySlug),
        sub?.nameKo ?? '',
        product.price,
        product.originalPrice ?? '',
        product.gender,
        product.season ?? '',
        product.origin ?? '',
        product.manufacturer ?? '',
        yesNo(product.isVisible),
        yesNo(product.isSoldOut),
        yesNo(product.isNew),
        yesNo(product.isSale),
        yesNo(product.freeShipping),
        product.displayOrder,
        product.optionCombinations.length,
        managed.length > 0 ? stockTotal : '',
        product.thumbnails.length,
        product.summary,
        formatDate(product.createdAt),
        formatDate(product.updatedAt),
      ]
        .map(cell)
        .join(',')
    );
  }

  // 엑셀은 CRLF 를 기대합니다.
  const csv = `﻿${lines.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="jzl-products-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
