-- ============================================================
-- JZL CLOSET — 2단계-A 접근 제어 (RLS)
-- schema-2a.sql 을 실행한 뒤 마지막에 실행하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 왜 지금 켜는가
--   주문 데이터부터 손님의 개인정보(이름·연락처·주소)가 들어갑니다.
--   RLS 를 끈 채로 두면 브라우저에 노출되는 anon key 로 남의 주문을
--   읽을 수 있습니다. 그래서 이번 단계에서 반드시 켭니다.
--
-- 원칙
--   · service_role 은 RLS 를 우회합니다. 이 사이트의 서버 코드는
--     전부 service_role 로만 DB 를 읽고 씁니다. (lib/supabase/server.ts)
--   · 그래서 anon 에는 "공개해도 되는 것만" 읽기 권한을 줍니다.
--   · 주문 관련 3개 테이블은 anon 에 아무 정책도 주지 않습니다.
--     RLS 가 켜져 있고 정책이 없으면 전부 거부됩니다.
-- ============================================================

-- ── 1. 주문 — 아무에게도 열지 않습니다 (service_role 전용) ──
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_no_seq         enable row level security;

-- 혹시 예전에 만든 정책이 남아 있으면 지웁니다.
drop policy if exists orders_anon_select               on public.orders;
drop policy if exists order_items_anon_select          on public.order_items;
drop policy if exists order_status_history_anon_select on public.order_status_history;

-- ★ 정책을 하나도 만들지 않습니다.
--   RLS 활성화 + 정책 없음 = anon/authenticated 는 select/insert/update/delete 모두 거부.
--   주문 조회는 서버(service_role)가 주문번호 + 연락처를 대조한 뒤에만 돌려줍니다.

-- ── 2. 공개 읽기 — 상품·분류·브랜드·사이트 설정 ────────────
-- 손님에게 보여 주는 데이터입니다. 읽기만 허용하고 쓰기는 막습니다.

alter table public.products      enable row level security;
alter table public.categories    enable row level security;
alter table public.brands        enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists products_public_read      on public.products;
drop policy if exists categories_public_read    on public.categories;
drop policy if exists brands_public_read        on public.brands;
drop policy if exists site_settings_public_read on public.site_settings;

-- 전시 중인 상품만 공개합니다. 숨김 상품은 관리자(service_role)만 봅니다.
create policy products_public_read
  on public.products for select
  to anon, authenticated
  using (is_visible = true);

-- 노출 중인 분류·브랜드만 공개합니다.
create policy categories_public_read
  on public.categories for select
  to anon, authenticated
  using (is_visible = true);

create policy brands_public_read
  on public.brands for select
  to anon, authenticated
  using (is_visible = true);

-- ★ site_settings 는 key 하나에 값 하나입니다.
--   입금 계좌(payment)에는 계좌번호가 들어 있으므로 공개하면 안 됩니다.
--   푸터·메타데이터에 쓰이는 키만 골라서 엽니다.
create policy site_settings_public_read
  on public.site_settings for select
  to anon, authenticated
  using (key in ('store', 'shipping', 'design', 'copy', 'analytics', 'branding'));

-- ── 3. 문구 템플릿 — 관리자 전용 ──────────────────────────
alter table public.templates enable row level security;
drop policy if exists templates_public_read on public.templates;
-- 정책 없음 = service_role 만 접근

-- ── 확인 ──────────────────────────────────────────────────
-- RLS 가 켜졌는지 확인
-- select relname, relrowsecurity
--   from pg_class
--  where relnamespace = 'public'::regnamespace
--    and relname in ('orders','order_items','order_status_history','order_no_seq',
--                    'products','categories','brands','site_settings','templates')
--  order by relname;
--
-- 정책 목록 확인
-- select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by tablename;
--
-- ★ 이 파일을 실행한 뒤 사이트 전 페이지가 정상인지 확인하세요.
--   이 프로젝트의 서버 코드는 service_role 로만 DB 를 읽으므로
--   RLS 를 켜도 상품·분류·브랜드가 그대로 보입니다.
--   (브라우저용 anon 클라이언트 lib/supabase/client.ts 는 아직 어디에서도 쓰지 않습니다)
