-- ============================================================
-- JZL CLOSET — 2단계-B 접근 제어 (RLS)
-- schema-2b.sql 을 실행한 뒤 마지막에 실행하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 2-A 에서는 주문 테이블을 아무에게도 열지 않았습니다(service_role 전용).
-- 이제 회원이 생겼으므로 "본인 것만" 볼 수 있는 길을 엽니다.
--
-- 원칙
--   · service_role 은 RLS 를 우회합니다. 관리자 화면은 계속 그대로 동작합니다.
--   · 로그인한 회원(authenticated)은 auth.uid() = 본인 행만 읽습니다.
--   · 비회원(anon)은 주문·문의를 전혀 읽지 못합니다.
--     비회원 주문 조회와 비회원 문의 조회는 서버가 주문번호+연락처(또는 비밀번호)를
--     대조한 뒤 service_role 로 읽어 돌려줍니다.
-- ============================================================

-- ── 1. 회원 프로필 ────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;

-- 본인 행만 읽습니다.
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- 본인 행만 고칩니다.
-- ★ status·admin_memo 같은 관리자 전용 항목까지 열리지만,
--   앱에서는 회원이 이 컬럼을 건드리는 경로를 만들지 않았습니다.
--   (회원정보 수정은 서버 액션이 허용된 컬럼만 골라 씁니다)
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 가입 직후 본인 행을 만드는 경우를 위해 열어 둡니다.
-- (지금은 서버가 service_role 로 만들지만, 나중에 클라이언트에서 만들 수도 있습니다)
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- ── 2. 주문 — 본인 주문만 읽기 ────────────────────────────
-- orders 는 2-A 에서 이미 RLS 가 켜져 있습니다. 정책만 추가합니다.
alter table public.orders enable row level security;

drop policy if exists orders_select_own on public.orders;

create policy orders_select_own
  on public.orders for select
  to authenticated
  using (user_id is not null and auth.uid() = user_id);

-- ★ insert/update/delete 정책은 만들지 않습니다.
--   주문 생성·상태 변경은 전부 서버(service_role)가 합니다.

-- ── 3. 주문 상품 · 상태 이력 — 본인 주문에 속한 것만 ──────
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists order_items_select_own          on public.order_items;
drop policy if exists order_status_history_select_own on public.order_status_history;

create policy order_items_select_own
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and o.user_id is not null
         and o.user_id = auth.uid()
    )
  );

create policy order_status_history_select_own
  on public.order_status_history for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_status_history.order_id
         and o.user_id is not null
         and o.user_id = auth.uid()
    )
  );

-- ── 4. 1:1 문의 — 본인 문의만 ─────────────────────────────
alter table public.inquiries     enable row level security;
alter table public.inquiry_no_seq enable row level security;

drop policy if exists inquiries_select_own on public.inquiries;
drop policy if exists inquiries_public_read on public.inquiries;

create policy inquiries_select_own
  on public.inquiries for select
  to authenticated
  using (user_id is not null and auth.uid() = user_id);

-- ★ 비회원 문의(user_id is null)는 어떤 정책에도 걸리지 않습니다.
--   문의번호 + 비밀번호를 서버가 대조한 뒤 service_role 로만 읽어 줍니다.
-- ★ 상품 상세의 문의 목록도 서버가 service_role 로 읽고,
--   비밀글이면 제목을 가려서 내려보냅니다.

-- ── 5. 2-A 에서 걸어 둔 공개 읽기 확인 ────────────────────
-- 상품·분류·브랜드·사이트 설정은 rls-2a.sql 에서 이미 열어 두었습니다.
-- 여기서 다시 걸어도 안전하도록 한 번 더 보장합니다.
alter table public.products      enable row level security;
alter table public.categories    enable row level security;
alter table public.brands        enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists products_public_read      on public.products;
drop policy if exists categories_public_read    on public.categories;
drop policy if exists brands_public_read        on public.brands;
drop policy if exists site_settings_public_read on public.site_settings;

create policy products_public_read
  on public.products for select
  to anon, authenticated
  using (is_visible = true);

create policy categories_public_read
  on public.categories for select
  to anon, authenticated
  using (is_visible = true);

create policy brands_public_read
  on public.brands for select
  to anon, authenticated
  using (is_visible = true);

-- 입금 계좌가 들어 있는 payment 키는 계속 제외합니다.
create policy site_settings_public_read
  on public.site_settings for select
  to anon, authenticated
  using (key in ('store', 'shipping', 'design', 'copy', 'analytics', 'branding'));

-- ── 확인 ──────────────────────────────────────────────────
-- RLS 상태
-- select relname, relrowsecurity
--   from pg_class
--  where relnamespace = 'public'::regnamespace
--    and relname in ('profiles','orders','order_items','order_status_history',
--                    'inquiries','inquiry_no_seq','products','categories',
--                    'brands','site_settings','templates')
--  order by relname;
--
-- 정책 목록
-- select tablename, policyname, cmd, roles from pg_policies where schemaname='public' order by tablename, policyname;
--
-- ★ 실행한 뒤 확인할 것
--   1) 로그아웃 상태에서 / 와 /products 에 상품이 그대로 보이는지
--   2) 회원 A 로 로그인해 회원 B 의 주문번호로 /mypage/orders 를 열 수 없는지
--   3) /admin 에서 모든 주문·회원이 그대로 보이는지 (service_role 이라 영향 없음)
