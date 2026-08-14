-- ============================================================
-- JZL CLOSET — 3단계-B 접근 제어 (RLS)
-- schema-3b.sql 을 실행한 뒤 맨 마지막에 실행하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 3-B 에서는 새 테이블을 만들지 않았습니다. 늘어난 것은 컬럼과 함수뿐입니다.
-- 그래서 이 파일이 하는 일은 두 가지입니다.
--
--   1) 3-A 까지 걸어 둔 정책이 그대로 살아 있는지 다시 보장 (여러 번 실행해도 안전)
--   2) 새로 만든 포인트 함수의 실행 권한을 서버(service_role)로 좁힘
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

-- ── 3. 포인트 함수 실행 권한 ──────────────────────────────
-- ★ 이 함수들은 잔액을 직접 바꿉니다.
--   브라우저(anon · authenticated)에서 부를 수 있으면 포인트를 마음대로 만들 수 있으므로
--   실행 권한을 서버(service_role)에게만 줍니다.
revoke all on function public.apply_point_change(uuid, integer, text, text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.consume_point_lots(uuid, integer)   from public, anon, authenticated;
revoke all on function public.refresh_point_expiry(uuid)          from public, anon, authenticated;
revoke all on function public.expire_points()                     from public, anon, authenticated;

grant execute on function public.apply_point_change(uuid, integer, text, text, uuid, timestamptz)
  to service_role;
grant execute on function public.consume_point_lots(uuid, integer) to service_role;
grant execute on function public.refresh_point_expiry(uuid)        to service_role;
grant execute on function public.expire_points()                   to service_role;

-- 문의번호 발급 함수도 서버만 부르면 됩니다.
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'next_inquiry_no'
  ) then
    execute 'revoke all on function public.next_inquiry_no() from public, anon, authenticated';
    execute 'grant execute on function public.next_inquiry_no() to service_role';
  end if;
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
-- 함수 권한
-- select p.proname, pg_get_userbyid(p.proowner) as owner, p.proacl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('apply_point_change','expire_points','consume_point_lots',
--                      'refresh_point_expiry','next_inquiry_no');
--
-- ★ 실행한 뒤 확인할 것
--   1) 로그아웃 상태에서 상품 상세의 리뷰·Q&A 가 그대로 보이는지
--   2) 회원 A 로 로그인해 회원 B 의 포인트 내역이 보이지 않는지
--   3) 관리자에서 문의 답변을 저장하면 상태가 '답변완료'로 바뀌는지
--   4) 주문서에서 포인트 사용이 정상 처리되는지
