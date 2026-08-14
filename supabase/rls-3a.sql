-- ============================================================
-- JZL CLOSET — 3단계-A 접근 제어 (RLS)
-- schema-3a.sql 을 실행한 뒤 마지막에 실행하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 원칙 (2-A · 2-B 와 같습니다)
--   · service_role 은 RLS 를 우회합니다. 관리자 화면은 그대로 동작합니다.
--   · 손님에게 보여 주는 것만 anon 에 읽기를 엽니다.
--   · 쓰기는 어디에도 열지 않습니다. 전부 서버(service_role)가 합니다.
-- ============================================================

-- ── 1. 리뷰 — 노출 중인 것만 공개 읽기 ────────────────────
alter table public.reviews enable row level security;

drop policy if exists reviews_public_read on public.reviews;

-- ★ is_visible = false 인 리뷰(관리자가 숨긴 부적절한 글)는 보이지 않습니다.
create policy reviews_public_read
  on public.reviews for select
  to anon, authenticated
  using (is_visible = true);

-- insert/update/delete 정책은 만들지 않습니다. 서버만 씁니다.

-- ── 2. 포인트 내역 — 본인 것만 ────────────────────────────
alter table public.point_transactions enable row level security;

drop policy if exists point_transactions_select_own on public.point_transactions;

create policy point_transactions_select_own
  on public.point_transactions for select
  to authenticated
  using (auth.uid() = user_id);

-- ── 3. 공지사항 — 노출 중인 것만 공개 읽기 ────────────────
alter table public.notices enable row level security;

drop policy if exists notices_public_read on public.notices;

create policy notices_public_read
  on public.notices for select
  to anon, authenticated
  using (is_visible = true);

-- ── 4. 팝업 — 노출 중인 것만 공개 읽기 ────────────────────
-- 기간(starts_at ~ ends_at) 판단은 서버에서 합니다.
-- 정책에 시간 조건을 넣으면 캐시된 결과와 어긋날 수 있습니다.
alter table public.popups enable row level security;

drop policy if exists popups_public_read on public.popups;

create policy popups_public_read
  on public.popups for select
  to anon, authenticated
  using (is_visible = true);

-- ── 확인 ──────────────────────────────────────────────────
-- select relname, relrowsecurity
--   from pg_class
--  where relnamespace = 'public'::regnamespace
--    and relname in ('reviews','point_transactions','notices','popups')
--  order by relname;
--
-- select tablename, policyname, cmd, roles from pg_policies
--  where schemaname = 'public' and tablename in ('reviews','point_transactions','notices','popups');
--
-- ★ 실행한 뒤 확인할 것
--   1) 로그아웃 상태에서 상품 상세의 리뷰가 그대로 보이는지
--   2) /notice 목록과 상세가 열리는지
--   3) 메인에서 팝업이 뜨는지
--   4) 관리자에서 숨긴 리뷰가 손님 화면에서 사라지는지
