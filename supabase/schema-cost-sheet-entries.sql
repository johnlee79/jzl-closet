-- ============================================================
-- JZL CLOSET — 단가표 전체 저장 (cost_sheet_entries)
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다. 기존 데이터에는 영향이 없습니다.
--
-- 실행 순서
--   1~14) 지금까지의 schema-*.sql + rls-*.sql 전부
--  15) supabase/schema-cost-sheet-entries.sql  ← 지금 이 파일
--
-- 이 파일이 하는 일 (사장님 지시 2026-10-06)
--   · 올린 단가표의 모든 상품 행 (상품명·품번·위탁가·엑셀 사진·단가표 날짜) 을 DB 에 저장
--   · 다음 달 엑셀을 올리면 **새 단가표가 current 로 바뀌고 옛것은 기록**으로 남음
--   · 손님 유출 금지 — service_role 전용 RLS
--
-- 다음 단계 자리 (쉽게 붙이기)
--   · note (비고) · stock_qty (수량/품절) 자리를 두어 색상·사이즈 매칭·품절 제안을
--     붙일 때 쓸 수 있게. 1단계에선 전부 null.
-- ============================================================

create table if not exists public.cost_sheet_entries (
  id                     uuid primary key default gen_random_uuid(),
  /** 'newyorktrd' · 'sellstar' */
  source                 text not null default 'newyorktrd',
  /** 엑셀에 적힌 단가표 날짜. 못 읽으면 올린 날짜. */
  sheet_date             date,
  /** 올린 시각 — 가장 최근 올린 것부터 보여줄 때 */
  uploaded_at            timestamptz not null default now(),
  uploaded_by            text,

  /** 지금 쓰이는 단가표인지 (true) 아니면 과거 기록인지 (false) */
  is_current             boolean not null default true,

  /** 매칭 열쇠 — lib/cost-sheet.ts normalizeExcelName 결과 */
  normalized_name        text not null,
  /** 손님(관리자) 눈에 보이는 상품명 — 엑셀 첫 줄 그대로 */
  raw_name               text not null,
  /** 엑셀에서 뽑은 품번들 */
  skus                   text[] not null default '{}'::text[],
  /** 위탁가 (부가세 포함가로 봄 — 명세) */
  cost_price             integer,

  /** R2 로 올린 축소본(가로 300px) 사진. 원본은 올리지 않음 (명세) */
  image_url              text,

  /** 짝지은 우리 상품 — null 이면 아직 안 지은 상태 */
  matched_product_id     uuid references public.products(id) on delete set null,

  /** 비고 — 다음 단계 "품절시 종료 / 입고예정" 자리. 1단계엔 비움 */
  note                   text,

  /** 시트 안 몇 번째 시트·몇 번째 줄 — 디버그·검증용 */
  sheet_name             text,
  row_start              integer,

  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

comment on table public.cost_sheet_entries
  is '단가표 엑셀 상품 행 저장. 손님 유출 금지라 RLS 로 service_role 전용으로 잠급니다.';

-- current 인 행 중 같은 (source, normalized_name) 이 두 번 들어가지 않도록
create unique index if not exists cost_sheet_entries_current_uniq
  on public.cost_sheet_entries (source, normalized_name)
  where is_current = true;

-- "단가표 보기" 페이지가 자주 쓰는 조회
create index if not exists cost_sheet_entries_current_idx
  on public.cost_sheet_entries (source, is_current, sheet_date desc)
  where is_current = true;

-- 상품 수정 화면이 "이 상품에 짝지어진 단가표 행" 을 찾을 때
create index if not exists cost_sheet_entries_matched_idx
  on public.cost_sheet_entries (matched_product_id)
  where matched_product_id is not null;

alter table public.cost_sheet_entries enable row level security;

-- ★ RLS 정책을 두지 않습니다 (손님 anon 키로는 자동 거부).
-- 관리자 서버 코드는 service_role 로 접근해 RLS 를 우회합니다.

-- ── 확인 ──
-- select count(*) from public.cost_sheet_entries;  -- 0 이어야 정상
-- select rowsecurity from pg_tables
--  where schemaname='public' and tablename='cost_sheet_entries';  -- t 이어야 함
