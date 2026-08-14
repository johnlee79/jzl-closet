-- ============================================================
-- JZL CLOSET — 2단계-B 스키마 (회원 · 1:1 문의)
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
--   7) supabase/schema-2b.sql   ← 지금 이 파일
--   8) supabase/rls-2b.sql      (2-B · 접근 제어. 반드시 마지막)
-- ============================================================

create extension if not exists "pgcrypto";

-- ── 회원 프로필 ───────────────────────────────────────────
-- 로그인 계정 자체(이메일·비밀번호)는 Supabase 가 auth.users 에 관리합니다.
-- 여기에는 쇼핑몰이 쓰는 정보만 담습니다.
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  name            text not null,
  phone           text,
  email           text,
  postcode        text,
  address1        text,
  address2        text,
  status          text default 'active',      -- active | inactive | withdrawn

  -- ★ 약관 동의는 분쟁이 생겼을 때 증거가 됩니다. 시각까지 남깁니다.
  agree_terms     boolean default false,      -- 이용약관 (필수)
  agree_privacy   boolean default false,      -- 개인정보 수집·이용 (필수)
  agree_age14     boolean default false,      -- 만 14세 이상 (필수)
  agree_marketing boolean default false,      -- 마케팅 수신 (선택)
  agreed_at       timestamptz,

  last_login_at   timestamptz,
  withdrawn_at    timestamptz,
  admin_memo      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

comment on table  public.profiles           is '회원 정보. auth.users 와 1:1 입니다';
comment on column public.profiles.status    is 'withdrawn 이면 탈퇴 회원. 개인정보는 마스킹하되 주문은 남깁니다';
comment on column public.profiles.agreed_at is '약관에 동의한 시각. 분쟁 시 증거로 씁니다';

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_email_idx  on public.profiles (email);

-- ── 주문에 회원 연결 ──────────────────────────────────────
-- ★ 기존 주문은 전부 null 입니다. 비회원 주문을 그대로 두기 위함입니다.
--   회원가입을 강제하지 않습니다.
alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

comment on column public.orders.user_id is '회원 주문이면 auth.users.id. 비회원 주문은 null';

create index if not exists orders_user_id_idx on public.orders (user_id);

-- ── 1:1 문의 ──────────────────────────────────────────────
create table if not exists public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  inquiry_no    text unique not null,                       -- INQ-20260814-0001
  user_id       uuid references auth.users(id) on delete set null,
  order_id      uuid references public.orders(id) on delete set null,
  product_id    uuid,                                       -- 상품 문의인 경우
  category      text not null,                              -- order | exchange | product | etc
  title         text not null,
  content       text not null,
  writer_name   text not null,
  writer_phone  text,
  writer_email  text,
  password_hash text,                                       -- 비회원 문의 조회용
  is_secret     boolean default true,
  status        text default 'pending',                     -- pending | answered | closed
  answer        text,
  answered_at   timestamptz,
  attachments   jsonb default '[]'::jsonb,                  -- 이미지 URL 배열 (최대 3장)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table  public.inquiries               is '1:1 문의. 회원·비회원 모두 남길 수 있습니다';
comment on column public.inquiries.password_hash is '비회원이 조회할 때 쓰는 비밀번호. 평문이 아니라 PBKDF2 해시입니다';
comment on column public.inquiries.is_secret     is '비밀글이면 상품 상세 목록에 제목을 가립니다';

create index if not exists inquiries_status_idx     on public.inquiries (status);
create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);
create index if not exists inquiries_user_id_idx    on public.inquiries (user_id);
create index if not exists inquiries_product_id_idx on public.inquiries (product_id);

-- ── updated_at 자동 갱신 ──────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists inquiries_set_updated_at on public.inquiries;
create trigger inquiries_set_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

-- ============================================================
-- 문의번호 생성 — INQ-YYYYMMDD-NNNN
-- 주문번호(next_order_no)와 같은 방식입니다.
-- 당일 순번을 별도 테이블에서 원자적으로 올려 중복을 막습니다.
-- ============================================================
create table if not exists public.inquiry_no_seq (
  day     date primary key,
  last_no integer not null default 0
);

comment on table public.inquiry_no_seq is '문의번호 당일 순번. next_inquiry_no() 가 원자적으로 올립니다';

create or replace function public.next_inquiry_no(at_date date default (now() at time zone 'Asia/Seoul')::date)
returns text as $$
declare
  seq integer;
begin
  insert into public.inquiry_no_seq as s (day, last_no)
  values (at_date, 1)
  on conflict (day) do update set last_no = s.last_no + 1
  returning s.last_no into seq;

  return 'INQ-' || to_char(at_date, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
end;
$$ language plpgsql;

comment on function public.next_inquiry_no(date) is '다음 문의번호를 원자적으로 발급합니다. INQ-YYYYMMDD-NNNN';

-- ── 확인 ──────────────────────────────────────────────────
-- select public.next_inquiry_no();
-- select id, name, email, status, created_at from public.profiles order by created_at desc limit 10;
-- select inquiry_no, category, status, title from public.inquiries order by created_at desc limit 10;
