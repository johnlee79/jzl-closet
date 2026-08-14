-- ============================================================
-- JZL CLOSET — 3단계-A 스키마 (리뷰 · 포인트 · 공지 · 팝업)
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (if not exists).
--
-- 실행 순서
--   1) supabase/schema.sql      (1-A · 상품)
--   2) supabase/settings.sql    (1-A · 사이트 설정)
--   3) supabase/schema-1b.sql   (1-B · 분류 · 브랜드)
--   4) supabase/seed-1b.sql     (1-B · 시드)
--   5) supabase/schema-2a.sql   (2-A · 주문)
--   6) supabase/rls-2a.sql      (2-A · 접근 제어)
--   7) supabase/schema-2b.sql   (2-B · 회원 · 문의)
--   8) supabase/rls-2b.sql      (2-B · 접근 제어)
--   9) supabase/schema-3a.sql   ← 지금 이 파일
--  10) supabase/rls-3a.sql      (3-A · 접근 제어. 반드시 마지막)
-- ============================================================

create extension if not exists "pgcrypto";

-- ── 리뷰 ──────────────────────────────────────────────────
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null,
  product_slug  text not null,
  -- 관리자가 대신 등록한 체험단 후기는 user_id 가 null 입니다.
  user_id       uuid references auth.users(id) on delete set null,
  order_id      uuid references public.orders(id) on delete set null,
  writer_name   text not null,
  rating        integer not null,                       -- 1~5
  tags          jsonb default '[]'::jsonb,              -- 선택한 긍정 태그 배열
  content       text not null,
  attachments   jsonb default '[]'::jsonb,              -- 이미지·동영상 URL 배열
  -- ★ 체험단·무상제공 여부. true 면 프론트에 반드시 표시 문구가 나갑니다.
  is_sponsored  boolean default false,
  is_visible    boolean default true,
  admin_reply   text,
  replied_at    timestamptz,
  helpful_count integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table  public.reviews              is '상품 리뷰. user_id 가 null 이면 관리자가 대신 등록한 후기입니다';
comment on column public.reviews.is_sponsored is '체험단·무상제공 후기. 표시광고법상 프론트에 사실을 표시해야 합니다';
comment on column public.reviews.tags         is '선택한 긍정 태그 배열. 목록은 site_settings 의 review 키에서 관리합니다';

create index if not exists reviews_product_id_idx on public.reviews (product_id);
create index if not exists reviews_created_at_idx on public.reviews (created_at desc);
create index if not exists reviews_is_visible_idx on public.reviews (is_visible);

-- 같은 주문의 같은 상품에는 리뷰를 한 번만 씁니다.
-- (관리자 등록분은 order_id 가 null 이라 이 제약에 걸리지 않습니다)
create unique index if not exists reviews_order_product_uniq
  on public.reviews (order_id, product_id)
  where order_id is not null;

-- ── 포인트 ────────────────────────────────────────────────
create table if not exists public.point_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     integer not null,                          -- 적립 +, 사용 -
  balance    integer not null,                          -- 이 거래 후 잔액
  -- signup | review_text | review_photo | order_use | admin | cancel
  reason     text not null,
  memo       text,
  ref_id     uuid,                                      -- 관련 리뷰·주문 id
  created_at timestamptz default now()
);

comment on table  public.point_transactions         is '포인트 적립·사용 내역. 잔액은 profiles.point_balance 와 항상 함께 갱신합니다';
comment on column public.point_transactions.balance is '이 거래를 반영한 뒤의 잔액. 내역 화면에 그대로 보여 줍니다';

create index if not exists point_transactions_user_idx
  on public.point_transactions (user_id, created_at desc);

-- 회원 잔액
alter table public.profiles
  add column if not exists point_balance integer default 0;

comment on column public.profiles.point_balance is '보유 포인트. point_transactions 와 어긋나지 않게 apply_point_change() 로만 바꿉니다';

-- ============================================================
-- 포인트 적립·사용
--
-- ★ 잔액(profiles.point_balance)과 내역(point_transactions)이 어긋나면
--   나중에 어느 쪽이 맞는지 알 수 없게 됩니다.
--   그래서 둘을 한 트랜잭션 안에서 함께 바꾸는 함수를 두고,
--   앱은 이 함수만 부릅니다.
--
--   · 회원 행을 잠그고(for update) 잔액을 읽습니다
--   · 사용(음수)일 때 잔액이 모자라면 예외를 던져 통째로 되돌립니다
--   · 잔액을 갱신하고 같은 트랜잭션에서 내역을 남깁니다
--
-- 돌려주는 값: 바뀐 뒤의 잔액
-- ============================================================
create or replace function public.apply_point_change(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text,
  p_memo    text default null,
  p_ref_id  uuid default null
)
returns integer as $$
declare
  current_balance integer;
  next_balance    integer;
begin
  -- 같은 회원의 포인트가 동시에 바뀌지 않도록 행을 잠급니다.
  select coalesce(point_balance, 0) into current_balance
    from public.profiles
   where id = p_user_id
   for update;

  if not found then
    raise exception '회원을 찾을 수 없습니다: %', p_user_id;
  end if;

  next_balance := current_balance + p_amount;

  if next_balance < 0 then
    raise exception '포인트가 모자랍니다. 보유 %, 요청 %', current_balance, p_amount;
  end if;

  update public.profiles
     set point_balance = next_balance
   where id = p_user_id;

  insert into public.point_transactions (user_id, amount, balance, reason, memo, ref_id)
  values (p_user_id, p_amount, next_balance, p_reason, p_memo, p_ref_id);

  return next_balance;
end;
$$ language plpgsql;

comment on function public.apply_point_change(uuid, integer, text, text, uuid)
  is '포인트 잔액과 내역을 한 트랜잭션에서 함께 바꿉니다. 잔액이 모자라면 예외를 던집니다';

-- ── 공지사항 ──────────────────────────────────────────────
create table if not exists public.notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  content    text not null,                             -- 편집기에서 만든 HTML
  is_pinned  boolean default false,                     -- 상단 고정
  is_visible boolean default true,
  view_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.notices is '공지사항. is_pinned 인 글이 목록 맨 위에 옵니다';

create index if not exists notices_visible_pinned_idx on public.notices (is_visible, is_pinned);
create index if not exists notices_created_at_idx     on public.notices (created_at desc);

-- ── 팝업 ──────────────────────────────────────────────────
create table if not exists public.popups (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  image_url     text,
  content       text,                                   -- 이미지가 없을 때 보여 줄 글
  link_url      text,
  position      text default 'center',                  -- center | left | right
  width         integer default 400,
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_visible    boolean default true,
  show_on       text default 'home',                    -- home | all
  display_order integer default 0,
  created_at    timestamptz default now()
);

comment on table  public.popups          is '메인 팝업. 모바일에서는 위치·폭 설정을 무시하고 화면 중앙에 띄웁니다';
comment on column public.popups.starts_at is '비워 두면 시작 제한 없음';
comment on column public.popups.ends_at   is '비워 두면 종료 제한 없음';

create index if not exists popups_is_visible_idx    on public.popups (is_visible);
create index if not exists popups_display_order_idx on public.popups (display_order);

-- ── updated_at 자동 갱신 ──────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

drop trigger if exists notices_set_updated_at on public.notices;
create trigger notices_set_updated_at
  before update on public.notices
  for each row execute function public.set_updated_at();

-- ── 확인 ──────────────────────────────────────────────────
-- select product_slug, rating, is_sponsored, is_visible from public.reviews order by created_at desc limit 10;
-- select id, point_balance from public.profiles order by point_balance desc limit 10;
-- select * from public.point_transactions order by created_at desc limit 10;
