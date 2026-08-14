-- ============================================================
-- JZL CLOSET — 관리자 1단계-B 스키마
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (if not exists).
--
-- 실행 순서
--   1) supabase/schema.sql      (1-A · 상품)
--   2) supabase/settings.sql    (1-A · 사이트 설정)
--   3) supabase/schema-1b.sql   ← 지금 이 파일
--   4) supabase/seed-1b.sql     (기존 lib/*.ts 데이터 옮기기)
--
-- 이 파일을 실행하기 전에도 사이트는 정상 동작합니다.
-- 테이블이 없거나 비어 있으면 lib/categories.ts · lib/brands.ts 값을
-- 임시로 쓰는 폴백이 코드에 들어 있습니다.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── 분류 (대분류 · 소분류를 한 테이블에 담습니다) ──────────
-- parent_slug 가 null 이면 대분류, 값이 있으면 그 대분류의 소분류입니다.
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,           -- URL 전용. 등록 후 변경 불가
  label         text not null,                  -- 화면에 보이는 글자
  name_ko       text not null,                  -- h1·메타데이터용 한글
  parent_slug   text,                           -- null 이면 대분류
  display_order integer default 0,
  is_visible    boolean default true,
  description   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table  public.categories              is '상품 분류. parent_slug 가 null 이면 대분류입니다';
comment on column public.categories.slug         is 'URL 주소에 쓰입니다. 등록 후에는 바꾸지 마세요 (검색 색인 유지)';
comment on column public.categories.parent_slug  is '소분류일 때 부모 대분류의 slug';
comment on column public.categories.description  is '카테고리 페이지 상단에 나오는 설명 문구';

-- ★ 모음 카테고리 규칙 (컬럼 대신 slug 약속으로 처리합니다)
--   slug = 'all'  → 전체 상품을 보여 줍니다
--   slug = 'sale' → is_sale = true 인 상품만 보여 줍니다
--   그 밖의 slug  → category_slug 가 일치하는 상품을 보여 줍니다

create index if not exists categories_parent_slug_idx   on public.categories (parent_slug);
create index if not exists categories_display_order_idx on public.categories (display_order);

-- ── 브랜드 ────────────────────────────────────────────────
create table if not exists public.brands (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,           -- URL 전용. 등록 후 변경 불가
  label         text not null,                  -- 화면에 보이는 글자
  name          text not null,                  -- JSON-LD·alt 용 정식 표기
  name_ko       text,
  tagline       text,                           -- 한 줄 소개
  story         text,                           -- 브랜드 스토리. 빈 줄로 문단을 나눕니다
  origin        text,
  since         text,
  image_url     text,                           -- 대표 이미지
  display_order integer default 0,
  is_visible    boolean default true,
  is_featured   boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table  public.brands            is '취급 브랜드. /brand 목록과 /brand/{slug} 상세에 쓰입니다';
comment on column public.brands.slug       is 'URL 주소에 쓰입니다. 등록 후에는 바꾸지 마세요';
comment on column public.brands.name       is '메타데이터·JSON-LD·이미지 alt 에 쓰는 정식 명칭';
comment on column public.brands.story      is '브랜드 상세 페이지에 실제 텍스트로 출력됩니다 (SEO 유입 경로)';

create index if not exists brands_display_order_idx on public.brands (display_order);
create index if not exists brands_is_visible_idx    on public.brands (is_visible);

-- ── site_settings ─────────────────────────────────────────
-- 1-A 에서 이미 만들었습니다. 없으면 여기서 함께 만듭니다.
-- 1-B 에서 새로 쓰는 key
--   store      스토어 정보 (브랜드명·슬로건·소개·고객센터·사업자 정보)
--   shipping   배송·반품 설정
--   design     메인 배너 · 자동 슬라이드 간격
--   copy       사이트 문구 (약관·개인정보·안내 등)
--   analytics  GA4 측정 ID
--   branding   파비콘·로고 (1-A 에서 만든 key 를 이어서 씁니다)
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz default now()
);

-- ── updated_at 자동 갱신 ──────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────
-- 아직 켜지 않습니다. 읽기·쓰기 모두 service_role 로만 이루어집니다.
-- alter table public.categories enable row level security;
-- alter table public.brands     enable row level security;
