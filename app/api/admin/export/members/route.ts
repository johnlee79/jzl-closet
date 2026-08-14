import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';
import { getMembers } from '@/lib/profiles';

/**
 * 회원 CSV 내보내기. (관리자 > 회원 관리)
 * ★ 라이브러리 없이 문자열로 만들고 UTF-8 BOM 을 붙여 엑셀에서 한글이 깨지지 않게 합니다.
 * 목록 화면의 필터(status·q·from·to)를 그대로 적용합니다.
 */
export const dynamic = 'force-dynamic';

const HEADERS = [
  '이름',
  '이메일',
  '연락처',
  '상태',
  '주문수',
  '총구매금액',
  '우편번호',
  '주소',
  '상세주소',
  '만14세동의',
  '이용약관동의',
  '개인정보동의',
  '마케팅동의',
  '동의시각',
  '최근로그인',
  '가입일',
  '탈퇴일',
  '관리자메모',
];

const STATUS_LABEL: Record<string, string> = {
  active: '활성',
  inactive: '비활성',
  withdrawn: '탈퇴',
};

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
  return Number.isNaN(date.getTime())
    ? ''
    : date.toISOString().slice(0, 19).replace('T', ' ');
}

function kstStart(day: string): string {
  return new Date(`${day}T00:00:00+09:00`).toISOString();
}
function kstEnd(day: string): string {
  return new Date(`${day}T23:59:59.999+09:00`).toISOString();
}

export async function GET(request: NextRequest) {
  if (!(await verifySessionToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const from = params.get('from');
  const to = params.get('to');

  const { members } = await getMembers({
    status: params.get('status') ?? undefined,
    search: params.get('q') ?? undefined,
    from: from ? kstStart(from) : undefined,
    to: to ? kstEnd(to) : undefined,
    // 내보내기는 페이지를 나누지 않습니다. 상한만 둡니다.
    limit: 5000,
  });

  const lines = [HEADERS.map(cell).join(',')];

  for (const member of members) {
    lines.push(
      [
        member.name,
        member.email,
        member.phone,
        STATUS_LABEL[member.status] ?? member.status,
        member.orderCount,
        member.totalSpent,
        member.postcode,
        member.address1,
        member.address2,
        yesNo(member.agreeAge14),
        yesNo(member.agreeTerms),
        yesNo(member.agreePrivacy),
        yesNo(member.agreeMarketing),
        formatDate(member.agreedAt),
        formatDate(member.lastLoginAt),
        formatDate(member.createdAt),
        formatDate(member.withdrawnAt),
        member.adminMemo,
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
      'Content-Disposition': `attachment; filename="jzl-members-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
