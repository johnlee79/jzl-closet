-- ============================================================
-- JZL CLOSET — 3단계-B 접근 제어 (RLS)
-- schema-3b.sql 을 실행한 뒤 맨 마지막에 실행하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 3-B 에서는 새 테이블을 만들지 않았습니다. 늘어난 것은 컬럼과 함수뿐입니다.
-- 그래서 이 파일이 하는 일은 두 가지입니다.
--
--   1) 3-A 까지 걸어 둔 정책이 그대로 살아 있는지 다시 보장 (여러 번 실행해도 안전)
--   2) 서버 전용 함수(포인트 · 주문번호 · 문의번호)의 실행 권한을 service_role 로 좁힘
--      ★ 함수 인자는 파일에 적어 두지 않고 pg_proc 에서 실제 시그니처를 읽어 씁니다.
--        단계마다 인자가 바뀌어 왔기 때문에 손으로 적으면 곧 어긋납니다.
--
-- 원칙은 그대로입니다.
--   · service_role 은 RLS 를 우회합니다. 관리자 화면은 영향이 없습니다.
--   · 손님에게 보여 줄 것만 anon 에 읽기를 엽니다.
--   · 쓰기는 어디에도 열지 않습니다. 전부 서버가 합니다.
-- ============================================================

-- ── 1. 3-A 정책 재확인 ────────────────────────────────────
alter table public.reviews            enable row level security;
alter table public.point_transactions enable row level security;
alter table public.notices            enable row level security;
alter table public.popups             enable row level security;

drop policy if exists reviews_public_read            on public.reviews;
drop policy if exists point_transactions_select_own  on public.point_transactions;
drop policy if exists notices_public_read            on public.notices;
drop policy if exists popups_public_read             on public.popups;

create policy reviews_public_read
  on public.reviews for select
  to anon, authenticated
  using (is_visible = true);

create policy point_transactions_select_own
  on public.point_transactions for select
  to authenticated
  using (auth.uid() = user_id);

create policy notices_public_read
  on public.notices for select
  to anon, authenticated
  using (is_visible = true);

create policy popups_public_read
  on public.popups for select
  to anon, authenticated
  using (is_visible = true);

-- ── 2. 회원 프로필 재확인 ─────────────────────────────────
-- provider · birthday · point_expiring_soon 이 늘었지만 정책은 그대로입니다.
-- (본인 행만 읽고, 본인 행만 고칩니다)
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── 3. 서버 전용 함수 실행 권한 ───────────────────────────
-- ★ 아래 함수들은 포인트 잔액을 바꾸거나 주문·문의 번호를 발급합니다.
--   브라우저(anon · authenticated)에서 부를 수 있으면 포인트를 마음대로 만들거나
--   번호를 소진시킬 수 있으므로 실행 권한을 서버(service_role)에게만 줍니다.
--
-- ★ 인자 목록을 여기에 적어 두지 않습니다.
--   함수 시그니처는 단계가 올라가며 바뀌었습니다.
--     · next_inquiry_no(date) · next_order_no(date) — 날짜를 받습니다
--     · apply_point_change(uuid, integer, text, text, uuid, timestamptz) — 3-B 에서 인자가 하나 늘었습니다
--   손으로 적어 두면 실제 DB 와 어긋나는 순간 "함수를 찾을 수 없습니다" 로 실패합니다.
--   그래서 pg_proc 에서 지금 실제로 존재하는 시그니처를 읽어 그대로 적용합니다.
--   이름이 같은 함수가 여러 개(오버로드) 있어도 전부 처리하고,
--   없는 함수는 조용히 건너뜁니다. 여러 번 실행해도 안전합니다.
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
         'apply_point_change',
         'consume_point_lots',
         'refresh_point_expiry',
         'expire_points',
         'next_inquiry_no',
         'next_order_no'
       )
  loop
    signature := format('public.%I(%s)', fn.proname, fn.args);

    execute format(
      'revoke all on function %s from public, anon, authenticated', signature
    );
    execute format('grant execute on function %s to service_role', signature);

    raise notice '서버 전용으로 잠금: %', signature;
  end loop;
end $$;

-- ── 확인 ──────────────────────────────────────────────────
-- RLS 켜짐 여부
-- select relname, relrowsecurity
--   from pg_class
--  where relnamespace = 'public'::regnamespace
--    and relname in ('profiles','orders','order_items','inquiries',
--                    'reviews','point_transactions','notices','popups')
--  order by relname;
--
-- 정책 목록
-- select tablename, policyname, cmd, roles from pg_policies
--  where schemaname = 'public' order by tablename, policyname;
--
-- 함수 권한 — 실제 시그니처와 함께 확인합니다.
-- (has_function_privilege 가 false 로 나와야 브라우저에서 못 부릅니다)
-- select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
--        has_function_privilege('anon',          p.oid, 'execute') as anon_can_run,
--        has_function_privilege('authenticated', p.oid, 'execute') as user_can_run,
--        has_function_privilege('service_role',  p.oid, 'execute') as server_can_run
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('apply_point_change','expire_points','consume_point_lots',
--                      'refresh_point_expiry','next_inquiry_no','next_order_no')
--  order by 1;
--
-- ★ 실행한 뒤 확인할 것
--   1) 로그아웃 상태에서 상품 상세의 리뷰·Q&A 가 그대로 보이는지
--   2) 회원 A 로 로그인해 회원 B 의 포인트 내역이 보이지 않는지
--   3) 관리자에서 문의 답변을 저장하면 상태가 '답변완료'로 바뀌는지
--   4) 주문서에서 포인트 사용이 정상 처리되는지
