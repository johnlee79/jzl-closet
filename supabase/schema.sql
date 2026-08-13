-- ============================================================
-- JZL CLOSET — 관리자 1-A 스키마
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (if not exists).
-- ============================================================

create extension if not exists "pgcrypto";

-- ── 상품 ──────────────────────────────────────────────────
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,          -- URL용. 영문 소문자+하이픈
  name              text not null,
  brand_slug        text,
  category_slug     text not null,
  sub_category_slug text,
  price             integer not null,
  original_price    integer,                       -- 할인 전 가격
  summary           text,
  origin            text,                          -- 원산지
  manufacturer      text,                          -- 제조사
  gender            text default 'women',          -- women | men | unisex
  season            text,
  thumbnails        jsonb default '[]'::jsonb,     -- 이미지 URL 배열
  options           jsonb default '[]'::jsonb,     -- [{name, values[], soldOutValues[]}]
  detail_blocks     jsonb default '[]'::jsonb,     -- 상세 본문 블록 배열
  measurements      jsonb default '[]'::jsonb,     -- [{label, value}]
  is_new            boolean default false,
  is_sale           boolean default false,
  is_sold_out       boolean default false,
  is_visible        boolean default true,          -- 전시 여부
  free_shipping     boolean default false,
  display_order     integer default 0,             -- 진열 순서. 작을수록 앞
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

comment on column public.products.slug is 'URL 주소에 쓰입니다. 한 번 정하면 바꾸지 마세요 (검색 색인 유지)';
comment on column public.products.detail_blocks is 'DetailBlock 배열: image | text | spec';

create index if not exists products_category_slug_idx on public.products (category_slug);
create index if not exists products_brand_slug_idx    on public.products (brand_slug);
create index if not exists products_is_visible_idx    on public.products (is_visible);
create index if not exists products_display_order_idx on public.products (display_order);

-- ── 문구 템플릿 (상세 편집기에서 사용) ─────────────────────
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  created_at timestamptz default now()
);

-- ── updated_at 자동 갱신 ──────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────
-- 1-A 단계에서는 켜지 않습니다. 관리자(service_role)만 쓰기 때문입니다.
-- 다음 단계에서 공개 읽기 정책과 함께 활성화합니다.
-- alter table public.products enable row level security;
