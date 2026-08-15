import { randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  REF_COOKIE,
  REF_COOKIE_DAYS,
  VISITOR_COOKIE,
  isReferralCode,
  normalizeReferralCode,
} from '@/lib/referral-code';
import { deviceKeyOf, ipHashOf, recordVisit } from '@/lib/referrals';
import { getCachedReferral } from '@/lib/settings';

/**
 * 추천 링크로 들어온 손님을 기록합니다.
 *
 * ★ 왜 페이지가 아니라 이 라우트에서 처리하는가
 *   상품·카테고리 페이지에서 주소의 `?ref=` 를 읽으면 그 페이지 전체가
 *   동적 렌더링으로 바뀝니다. 이 사이트는 SEO 가 최우선이라 그럴 수 없습니다.
 *   그래서 화면은 정적인 채로 두고, 브라우저가 이 라우트를 한 번 부릅니다.
 *   (로그인 상태를 /api/auth/me 로 따로 묻는 것과 같은 이유입니다)
 *
 * ★ 쿠키는 서버가 답니다.
 *   브라우저에서 달면 손님이 값을 마음대로 바꿔 코드를 갈아 끼울 수 있습니다.
 *   httpOnly 로 달아 두면 스크립트가 건드리지 못합니다.
 */
export const dynamic = 'force-dynamic';

const THIRTY_DAYS = REF_COOKIE_DAYS * 24 * 60 * 60;
/** 방문자 식별 쿠키는 더 길게 둡니다. 짧으면 같은 사람이 자꾸 새 방문자로 잡힙니다. */
const ONE_YEAR = 365 * 24 * 60 * 60;

export async function POST(request: Request) {
  const settings = await getCachedReferral();
  if (!settings.enabled) return NextResponse.json({ ok: false });

  let body: { code?: unknown; path?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const code = normalizeReferralCode(String(body.code ?? ''));
  if (!isReferralCode(code)) return NextResponse.json({ ok: false });

  const jar = cookies();

  // 방문자 식별값이 없으면 지금 만듭니다. 개인정보가 아니라 그냥 난수입니다.
  let visitorKey = jar.get(VISITOR_COOKIE)?.value ?? '';
  const isNewVisitor = !visitorKey;
  if (!visitorKey) visitorKey = randomUUID();

  const head = headers();
  const user = await getCurrentUser();

  const path = typeof body.path === 'string' ? body.path : '';
  const productSlug = path.startsWith('/products/') ? path.slice('/products/'.length) : '';

  const result = await recordVisit({
    code,
    visitorKey,
    ipHash: ipHashOf(head),
    deviceKey: deviceKeyOf(head),
    productSlug: productSlug.split('?')[0] ?? '',
    viewerId: user?.id ?? null,
  });

  const response = NextResponse.json({ ok: result.ok });

  if (isNewVisitor) {
    response.cookies.set(VISITOR_COOKIE, visitorKey, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ONE_YEAR,
    });
  }

  /*
   * ★ 본인 코드로 본인이 들어온 경우에는 쿠키도 달지 않습니다.
   *   달아 두면 나중에 그 브라우저에서 가입할 때 자기 추천으로 잡힙니다.
   *   어차피 가입 단계에서 막지만, 애초에 만들지 않는 편이 깔끔합니다.
   */
  if (result.ok) {
    response.cookies.set(REF_COOKIE, code, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: THIRTY_DAYS,
    });
  }

  return response;
}

/** 가입 화면이 "링크로 들어온 코드"를 미리 채우기 위해 씁니다. */
export async function GET() {
  const code = cookies().get(REF_COOKIE)?.value ?? '';
  return NextResponse.json(
    { code: isReferralCode(code) ? code : '' },
    { headers: { 'Cache-Control': 'no-store, private' } }
  );
}
