import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';
import { ADMIN_COOKIE, isAdminEmail, verifySessionToken } from '@/lib/admin-auth';
import { isJustLoggedOut } from '@/lib/member-session';
import { createAdminAuthClient } from '@/lib/supabase/auth-server';

/**
 * ============================================================
 * 관리자인지 확인하는 단 하나의 문
 * ============================================================
 *
 * ★★ 왜 한 곳으로 모았는가
 *   예전에는 똑같은 3줄짜리 assertAdmin 이 서버 액션 파일 9곳에 복사되어
 *   있었고, /api/admin/* 8곳은 또 각자 인라인으로 같은 검사를 하고 있었습니다.
 *   전부 17벌입니다. 방식을 바꿀 때 하나라도 빠뜨리면 그게 그대로 구멍입니다.
 *   막는 방법이 여럿인 것보다, 하나뿐이고 그게 확실한 편이 낫습니다.
 *
 * ★★ 두 가지 길을 모두 인정합니다. (전환 중)
 *
 *   1) 옛 길 — 비밀번호 하나로 받은 서명 쿠키 (jzl_admin_session)
 *   2) 새 길 — Supabase 로그인 + 이메일이 ADMIN_EMAILS 목록에 있음
 *
 *   둘 중 하나만 통과해도 관리자입니다. 전환하는 동안 어느 쪽으로도
 *   들어갈 수 있어야 잠기는 일이 없습니다.
 *   옛 길은 4단계에서 지웁니다. 이 파일과 middleware 두 곳만 고치면 됩니다.
 *
 * ★★ 순서가 중요합니다. 옛 쿠키를 먼저 봅니다.
 *   그쪽은 네트워크를 쓰지 않는 계산이라 즉시 끝납니다.
 *   Supabase 확인은 매번 Supabase 서버에 물어보는 왕복이 있습니다.
 *   옛 쿠키로 이미 들어와 있는 동안에는 그 왕복이 아예 일어나지 않습니다.
 *
 * ★ 한 요청 안에서 여러 번 불러도 실제 확인은 한 번만 합니다. (React cache)
 *   한 화면이 액션을 여러 개 부르는 일이 흔합니다.
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  /* ── 1. 옛 길 — 비밀번호로 받은 서명 쿠키 ── */
  if (await verifySessionToken(cookies().get(ADMIN_COOKIE)?.value)) return true;

  /* ── 2. 새 길 — Supabase 로그인 + 관리자 이메일 ── */
  return isAdminBySupabase();
});

/**
 * Supabase 로 로그인한 사람이 관리자 이메일인지.
 *
 * ★ 로그인 자체는 손님과 같은 구조를 씁니다. 관리자용 회원가입을 따로
 *   만들지 않습니다. 관리자 계정도 Supabase 계정 하나일 뿐이고,
 *   "관리자인가" 는 오직 환경변수 목록이 정합니다.
 *
 * ★ getUser() 를 씁니다. getSession() 이 아닙니다.
 *   getSession 은 쿠키에 든 토큰을 그대로 믿습니다. getUser 는 Supabase
 *   서버에 다시 물어 확인합니다. 관리자 문에서 쿠키만 믿으면 안 됩니다.
 *
 * ★ 실패는 전부 "관리자 아님" 입니다. 돌려주는 값은 언제나 false 입니다.
 *
 * ============================================================
 * ★★ 왜 실패했는지 반드시 남깁니다 (2026-08-26)
 * ============================================================
 *
 * ★★ 전에는 이 함수 전체가 이랬습니다.
 *     if (error || !data.user) return false;
 *     ...
 *     } catch { return false; }
 *   아무 데도 아무것도 남지 않았습니다.
 *
 * ★★ 여기가 [저장] 을 눌렀을 때 「로그인이 필요합니다」 가 뜨는 자리입니다.
 *   상품 등록 화면에서 튕기는 일이 실제로 있었는데, 그때 무슨 일이
 *   있었는지 알아낼 방법이 전혀 없었습니다. 미들웨어에는 로그를 넣었지만
 *   서버 액션·API 는 미들웨어를 거치지 않고 이 문으로 옵니다.
 *
 * ★★ 세 가지를 구분합니다. 원인이 완전히 다릅니다.
 *   (가) 세션이 아예 없음        — 만료됐거나 로그아웃된 상태
 *   (나) 세션은 있는데 관리자 아님 — 손님 계정으로 덮어써진 상태
 *   (다) 조회 자체가 실패        — Supabase 와 통신이 안 된 상태
 *
 * ★★ error 만 믿지 않습니다. 회원 뱃지에서 배운 것입니다.
 *   그때 없는 표를 조회하니 HTTP 204 에 **error 는 null** 이었습니다.
 *   "값이 비었는데 오류도 없는" 경우를 따로 봅니다.
 *
 * ★ "그냥 로그인 안 함" 은 남기지 않습니다.
 *   관리자 주소를 우연히 연 손님에게마다 찍히면 진짜 문제가 묻힙니다.
 *
 * ★ 이메일은 남기지 않습니다. id 앞 8자리만 남깁니다.
 *   어느 계정인지 대조는 되어야 하고, 손님 이메일이 로그에 쌓이면 안 됩니다.
 *
 * ★ 로그가 폭주하지 않습니다. isAdmin() 이 cache() 로 감싸져 있어
 *   한 요청에 실제로는 한 번만 돕니다. 그리고 이 문을 부르는 곳은
 *   app/admin/** 과 app/api/admin|upload/** 뿐입니다. 손님 경로에서는
 *   한 곳도 부르지 않습니다.
 */
async function isAdminBySupabase(): Promise<boolean> {
  const supabase = createAdminAuthClient();
  if (!supabase) {
    console.warn('[auth] 관리자 확인 — 로그인 설정이 없습니다. (환경변수 미설정)');
    return false;
  }

  try {
    const { data, error } = await supabase.auth.getUser();

    /* (다) 조회 자체가 실패 */
    if (error && !isJustLoggedOut(error)) {
      console.warn(
        `[auth] 관리자 확인 실패 (서버): ${error.message || '(오류 메시지 없음)'}`
      );
      return false;
    }

    /* (가) 세션이 아예 없음 */
    if (!data.user) {
      if (!error) {
        console.warn(
          '[auth] 관리자 확인 — 값이 비었는데 오류도 없습니다. ' +
            'Supabase 응답이 비어 온 경우입니다. 자주 보이면 알려 주세요.'
        );
      }
      return false;
    }

    /* (나) 세션은 있는데 관리자 이메일이 아님 */
    if (!isAdminEmail(data.user.email)) {
      console.warn(
        '[auth] 관리자 아닌 계정이 관리자 기능을 불렀습니다. ' +
          `손님으로 로그인한 상태입니다. (id ${data.user.id.slice(0, 8)})`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn(
      '[auth] 관리자 확인 중 오류:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

/**
 * 서버 액션에서 쓰는 형태.
 *
 * ★ 관리자가 아니면 결과 객체를 돌려줍니다. 예외를 던지지 않습니다.
 *   액션은 화면에 메시지를 보여 줘야 하는데, 예외를 던지면 그 자리가
 *   빈 오류 화면으로 바뀝니다. 쓰던 내용도 함께 사라집니다.
 */
export async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
  if (await isAdmin()) return null;
  return { ok: false, error: '로그인이 필요합니다. 다시 로그인해 주세요.' };
}
