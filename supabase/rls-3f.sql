-- ============================================================
-- JZL CLOSET — 3단계-F 접근 제어 (RLS)
-- schema-3f.sql 을 실행한 뒤 맨 마지막에 실행하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 실행 순서
--   schema-* 를 전부 실행한 다음
--   rls-2a → rls-2b → rls-3a → rls-3b → rls-3c → rls-3f ← 지금 이 파일
--
-- 이 파일이 하는 일
--   1) 새 테이블 다섯 개에 RLS 를 켭니다
--   2) 회원은 "자기 추천 실적"만 볼 수 있게 합니다
--   3) 새 DB 함수를 서버(service_role) 전용으로 잠급니다
--
-- ★ 쓰기 정책은 하나도 만들지 않습니다.
--   추천 실적·달성·지급은 전부 서버 라우트(service_role)가 씁니다.
--   브라우저에서 직접 쓸 수 있으면 실적을 마음대로 만들어 낼 수 있습니다.
-- ============================================================

-- ── 1. RLS 켜기 ───────────────────────────────────────────
alter table public.referral_visits       enable row level security;
alter table public.referral_links        enable row level security;
alter table public.referral_gifts        enable row level security;
alter table public.referral_goals        enable row level security;
alter table public.referral_achievements enable row level security;

-- ── 2. 읽기 정책 ──────────────────────────────────────────

-- 방문 기록 — 내 링크로 들어온 기록만
-- ★ 방문자가 누구인지는 내려보내지 않습니다. (visitor_key·ip_hash 는 관리자만 봅니다)
--   회원 화면에서는 숫자만 쓰므로 실제로는 profiles 의 집계값만 읽습니다.
drop policy if exists referral_visits_select_own on public.referral_visits;

create policy referral_visits_select_own
  on public.referral_visits for select
  to authenticated
  using (auth.uid() = referrer_id);

-- 추천 관계 — 내가 데려온 사람, 그리고 나를 데려온 사람
drop policy if exists referral_links_select_own on public.referral_links;

create policy referral_links_select_own
  on public.referral_links for select
  to authenticated
  using (auth.uid() = referrer_id or auth.uid() = invitee_id);

-- 사은품 — 노출 중인 것은 누구나 볼 수 있습니다. (무엇을 받는지 보여 주는 것이 목적)
drop policy if exists referral_gifts_public_read on public.referral_gifts;

create policy referral_gifts_public_read
  on public.referral_gifts for select
  to anon, authenticated
  using (is_visible = true);

-- 목표 — 진행 중인 목표는 누구나 볼 수 있습니다.
-- ★ 기간 판정은 앱이 한국시간으로 합니다. 여기서는 켜져 있는지만 봅니다.
--   DB 의 now() 는 UTC 라, 기간까지 여기서 자르면 한국시간 자정 근처가 어긋납니다.
drop policy if exists referral_goals_public_read on public.referral_goals;

create policy referral_goals_public_read
  on public.referral_goals for select
  to anon, authenticated
  using (is_active = true);

-- 달성 기록 — 내 기록만
drop policy if exists referral_achievements_select_own on public.referral_achievements;

create policy referral_achievements_select_own
  on public.referral_achievements for select
  to authenticated
  using (auth.uid() = user_id);

-- ── 3. 서버 전용 함수 실행 권한 ───────────────────────────
-- ★ rls-3b.sql 과 같은 방식입니다.
--   인자 목록을 파일에 적어 두면 실제 DB 와 어긋나는 순간 실패하므로
--   pg_proc 에서 지금 존재하는 시그니처를 읽어 그대로 적용합니다.
--   오버로드가 여러 개여도 전부 처리하고, 없는 함수는 건너뜁니다.
--
--   gen_referral_code 를 브라우저가 부를 수 있으면 코드를 계속 뽑아
--   코드 공간을 갉아먹을 수 있습니다. refresh_* 는 집계값을 건드립니다.
do $$
declare
  fn record;
  signature text;
begin
  for fn in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in (
         'gen_referral_code',
         'set_referral_code',
         'refresh_referral_counts',
         'refresh_all_referral_counts',
         'touch_updated_at'
       )
  loop
    signature := format('public.%I(%s)', fn.proname, fn.args);

    execute format(
      'revoke all on function %s from public, anon, authenticated', signature
    );
    execute format('grant execute on function %s to service_role', signature);

    raise notice '잠금 완료: %', signature;
  end loop;
end;
$$;

-- ★ 트리거가 부르는 함수까지 권한을 회수해도 트리거는 그대로 돕니다.
--   트리거는 테이블 소유자 권한으로 실행되기 때문입니다.
--   (set_referral_code · touch_updated_at 이 여기 해당합니다)

-- ── 확인 ──────────────────────────────────────────────────
-- select p.proname,
--        pg_get_function_identity_arguments(p.oid) as 인자,
--        has_function_privilege('anon',          p.oid, 'execute') as anon가능,
--        has_function_privilege('authenticated', p.oid, 'execute') as 회원가능,
--        has_function_privilege('service_role',  p.oid, 'execute') as 서버가능
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname like '%referral%'
--  order by p.proname;
--
-- select tablename, rowsecurity
--   from pg_tables
--  where schemaname = 'public' and tablename like 'referral%';
