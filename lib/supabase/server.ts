import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 서버 전용 Supabase 클라이언트. SERVICE_ROLE_KEY 를 사용하므로
 * 클라이언트 컴포넌트에서 import 하면 안 됩니다.
 * 최상단 import 'server-only' 가 실수로 섞이는 것을 빌드 단계에서 막아 줍니다.
 */
let cached: SupabaseClient | null = null;

/** 환경변수가 없으면 null 을 돌려줍니다. (빌드가 죽지 않게) */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** 반드시 연결이 필요한 곳(관리자 저장 등)에서 사용합니다. */
export function requireSupabaseAdmin(): SupabaseClient {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error(
      'Supabase 연결 정보가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 설정한 뒤 서버를 다시 시작해 주세요.'
    );
  }
  return client;
}

/* ------------------------------------------------------------------
 * 관리자 화면 전용 — 저장된 답을 절대 쓰지 않는 클라이언트
 * ------------------------------------------------------------------ */

let cachedFresh: SupabaseClient | null = null;

/**
 * ============================================================
 * ★★★ 관리자 목록 조회 전용. 저장된 답을 절대 쓰지 않습니다 — 지우지 마세요
 * ============================================================
 *
 * ★★ 무슨 일이 있었는가 (2026-08-26)
 *   관리자 회원 목록에 **DB 에 없는 사람이 11명** 떴습니다.
 *   이서윤 · Hannah · 김연 · 아무개 · 김명천 · 아이원페이먼트 …
 *   회원 표에 존재한 적이 없는 이름들이고, 눌러 보면 404 가 났습니다.
 *   (상세 화면은 그 id 로 DB 를 다시 읽으니 없어서 404 입니다)
 *
 *   서버는 멀쩡했습니다. 같은 순간에
 *     Supabase SQL Editor 로 센 것        → 3명
 *     CSV 내보내기                        → 3줄
 *     문서 요청 · RSC 직접 요청           → 3행
 *   그런데 사이드바에서 눌러 들어오면 11행이었습니다.
 *   Next 가 「바뀐 조각만」 달라고 보내는 요청(Next-Router-State-Tree 헤더가
 *   붙은 요청)에서만 그랬고, 그것은 100% 재현됐습니다.
 *
 * ★★ Vercel 이 그 조회 결과를 저장하고 있었습니다.
 *   Vercel 대시보드에서 Runtime and Data Cache 를 Purge 하니 3행으로
 *   돌아왔습니다. 저장돼 있었다는 것이 이것으로 확정됐습니다.
 *
 * ★★ 그런데 이미 막아 두었다고 생각한 것이 둘 있었습니다. 둘 다 안 먹었습니다.
 *     app/admin/(dashboard)/layout.tsx  export const fetchCache = 'force-no-store'
 *     app/admin/(dashboard) 아래 각 page.tsx   export const dynamic = 'force-dynamic'
 *   Next 문서상 이 둘은 "모든 fetch 에 cache: 'no-store' 를 건다" 는 뜻입니다.
 *   그런데도 저장됐습니다. **왜 안 먹었는지는 아직 모릅니다.**
 *   (supabase-js 가 fetch 를 붙들고 있어서가 아닌 것은 확인했습니다.
 *    resolveFetch 는 호출할 때마다 전역 fetch 를 찾습니다)
 *
 *   그래서 화면 설정에 기대지 않고 **조회하는 자리에 직접 못을 박습니다.**
 *   여기서 나가는 모든 요청에 cache: 'no-store' 가 붙습니다.
 *
 * ★★ 왜 getSupabaseAdmin 을 그대로 두고 따로 만들었는가
 *   그 클라이언트는 손님 화면도 씁니다 — lib/products.ts · settings.ts ·
 *   reviews.ts · notices.ts. 거기에 no-store 를 걸면 상품·분류·브랜드
 *   페이지의 정적 생성이 깨집니다. 이 사이트는 SEO 가 최우선이라
 *   그 경계는 건드리지 않습니다.
 *
 * ★★ 관리자 숫자는 틀리면 안 됩니다.
 *   주문·회원·재고를 보고 물건을 내보내는 화면입니다. 옛 목록을 보고
 *   판단하면 물건이 잘못 나갑니다. 조금 느린 것과 바꿀 수 없습니다.
 */
export function getSupabaseAdminFresh(): SupabaseClient | null {
  if (cachedFresh) return cachedFresh;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  cachedFresh = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      /*
       * ★ 여기가 못입니다. 이 클라이언트가 내보내는 모든 조회에
       *   cache: 'no-store' 를 붙입니다. 저장된 답을 쓰지도, 만들지도 않습니다.
       */
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return cachedFresh;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
