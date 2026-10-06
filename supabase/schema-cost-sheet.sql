-- ============================================================
-- JZL CLOSET — 뉴욕트렌딕 단가표 엑셀 ↔ 원가 등록 (1단계)
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다. 기존 데이터에는 영향이 없습니다.
--
-- 실행 순서
--   1~12) 지금까지의 schema-*.sql 전부
--  13) supabase/schema-cost-sheet.sql  ← 지금 이 파일
--  14) RLS 는 항상 마지막
--
-- 이 파일이 하는 일
--   · 상품에 **품번(sku)** 칸을 더합니다. 짝 지은 뒤 엑셀 품번을 저장해 두어
--     다음 달엔 이름이 바뀌어도 품번으로 찾아 들어갑니다.
--   · **원가 전용 테이블** product_costs 를 만들고 RLS 로 service_role 전용으로
--     잠급니다. products 에 원가 칸을 두면 손님 화면이 상품을 읽을 때 함께 끌려
--     나올 위험이 있어 **일부러 다른 표**로 뗍니다. (newyorktrd-cost-sheet.md 6번)
--   · **원가 변경 기록** product_cost_history — 언제 얼마에서 얼마로 바뀌었는지.
--     마진을 되짚을 때 씁니다.
--   · **엑셀 상품명 ↔ 우리 상품 짝** excel_product_match — 사람이 한 번 짝지어 두면
--     다음 달 자동 매칭의 열쇠가 됩니다 (newyorktrd-cost-sheet.md 5-①).
--   · **브랜드 줄임말** brand_aliases — 「S → STÜSSY」 같은 줄임말을 코드 아닌 데이터로.
--     사장님이 관리자에서 바로 추가할 수 있습니다 (명세 4번).
--
-- ★ 다음 단계 (색상·사이즈 매칭 · 품절 제안 · 실측 · 월 비교) 를 붙이기 쉽게 둔 자리
--   · product_costs 에 option_combination_key (현재는 NULL) — 옵션별 원가 저장할 때 씀
--   · excel_product_match 에 color_match jsonb (현재는 비움) — 색상 매칭 기억용
--   · 테이블 전부 (상품명+단가가 아닌) 외부 쇼핑몰 범용으로 설계. source='newyorktrd'
--     외에 'sellstar' 도 올 수 있게. 지금은 뉴욕트렌딕만 입니다.
-- ============================================================

/* ------------------------------------------------------------------
 * 1. products.sku 추가
 * ------------------------------------------------------------------
 * 품번은 "엑셀 품번 ↔ 우리 품번" 매칭의 가장 확실한 열쇠입니다.
 * 손님이 보는 자리에서도 쓸 수 있어 (스킵 메타) 상품 표 안에 둡니다.
 */
alter table public.products
  add column if not exists sku text;

comment on column public.products.sku
  is '상품 품번 (SKU). 뉴욕트렌딕 단가표에서 품번으로 매칭할 때 열쇠입니다. ' ||
     '같은 상품을 두 번 등록하면 사람 눈으로 알아보기도 쉽습니다.';

create index if not exists products_sku_idx on public.products (sku)
  where sku is not null and sku <> '';

/* ------------------------------------------------------------------
 * 2. 원가 — 손님 유출 금지 전용 테이블
 * ------------------------------------------------------------------
 * ★ 왜 products 가 아니라 다른 표인가 (newyorktrd-cost-sheet.md 6번)
 *   products 는 손님 화면에서 읽히는 자리입니다. 원가 칸을 거기 두면 손님 브라우저가
 *   함께 끌어 올 위험이 늘 있습니다. 완전히 다른 표로 떼고 RLS 로 service_role 만
 *   읽게 잠그면 손님 쪽 Supabase 클라이언트(anon key)로는 **아예 눈에 안 띕니다**.
 *
 * ★ option_combination_key 는 지금 비어 있습니다. 다음 단계(색상·사이즈별 원가)에서
 *   채우면 됩니다. 지금은 상품 단위 하나만 저장합니다 (샘플 데이터도 그 모양).
 */
create table if not exists public.product_costs (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references public.products(id) on delete cascade,
  /** 'newyorktrd' · 'sellstar' · 'manual' */
  source                 text not null default 'newyorktrd',
  /** 옵션별로 원가가 다를 때 쓰는 조합키. null 이면 상품 단위 원가입니다. */
  option_combination_key text,
  /** 부가세 포함. 명세 "위탁가는 무조건 부가세 포함가" (2026-10-05) */
  cost_price             integer not null,
  /** 엑셀에 적힌 날짜. 못 읽으면 올린 날짜. */
  sheet_date             date,
  /** 올린 사람(관리자) 이메일 — 바뀐 기록 남기기용 */
  uploaded_by            text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

comment on table  public.product_costs
  is '상품 원가. 손님 유출 금지라 products 와 분리하고 RLS 로 service_role 전용으로 잠급니다.';
comment on column public.product_costs.source
  is '단가표 출처. 지금은 newyorktrd 만 쓰이고 추후 셀스타 등 추가 가능합니다.';
comment on column public.product_costs.option_combination_key
  is '색상/사이즈별 원가 저장용. null = 상품 단위. 1단계에선 null 만 씁니다.';
comment on column public.product_costs.cost_price
  is '부가세 포함가. 명세: 뉴욕트렌딕이 VAT 미포함이라 적어 보내도 포함가로 봅니다.';

-- 한 상품 · 한 옵션조합당 "현재 원가" 한 건
create unique index if not exists product_costs_current_uniq
  on public.product_costs (product_id, source, coalesce(option_combination_key, ''));

/* ------------------------------------------------------------------
 * 3. 원가 변경 기록
 * ------------------------------------------------------------------
 * ★ 매번 bulk 로 올라오지만 바뀐 것만 기록. 언제 얼마에서 얼마로 바뀌었는지 봅니다.
 *   원가가 올랐는데 판매가가 그대로면 마진 경고 (명세 7번) 를 띄울 근거가 됩니다.
 */
create table if not exists public.product_cost_history (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references public.products(id) on delete cascade,
  source                 text not null default 'newyorktrd',
  option_combination_key text,
  prev_cost_price        integer,
  new_cost_price         integer not null,
  sheet_date             date,
  uploaded_by            text,
  created_at             timestamptz default now()
);

comment on table public.product_cost_history
  is '원가 변경 이력. 상품별로 언제 얼마에서 얼마로 바뀌었는지 추적합니다.';

create index if not exists product_cost_history_product_idx
  on public.product_cost_history (product_id, created_at desc);

/* ------------------------------------------------------------------
 * 4. 엑셀 상품명 ↔ 우리 상품 짝 (매칭 기억)
 * ------------------------------------------------------------------
 * ★ 명세 5-① — 핵심 자리입니다. 사람이 한 번 짝지은 (정리된 엑셀 상품명) 과 상품 id 를
 *   저장해 두면 다음 달 같은 이름이 와도 묻지 않고 바로 매칭됩니다.
 *
 *   정리 방법 (lib 안의 normalizeExcelName 과 일치해야 합니다):
 *     첫 줄만 · 공백 제거 · 앞뒤 기호 제거 · 소문자 통일
 *     "S 베이직 후드집업 (기모)" → "s베이직후드집업(기모)"
 *
 * ★ color_match 는 다음 단계 — 지금은 빈 jsonb 로 둡니다. 색상 매칭도 사람이 한 번
 *   짝지으면 기억하도록 할 자리입니다.
 */
create table if not exists public.excel_product_match (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null default 'newyorktrd',
  /** 정규화한 엑셀 상품명 (lib/cost-sheet.ts normalizeExcelName 결과) */
  normalized_name        text not null,
  /** 매칭된 상품. null 이면 사장님이 「해당 없음」 으로 둔 경우 */
  product_id             uuid references public.products(id) on delete cascade,
  /** 엑셀에서 뽑은 품번들 — 다음 번 매칭 참고용 (상품명 바뀌어도 품번으로 재매칭) */
  excel_skus             text[] default '{}'::text[],
  /** 다음 단계 — 색상 매칭 기억 ({엑셀 색상}: {우리 옵션값}). 지금은 비움 */
  color_match            jsonb default '{}'::jsonb,
  matched_by             text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

comment on table public.excel_product_match
  is '단가표 엑셀 상품명과 우리 상품의 짝 — 다음 달 자동 매칭의 열쇠입니다.';

create unique index if not exists excel_product_match_uniq
  on public.excel_product_match (source, normalized_name);

create index if not exists excel_product_match_product_idx
  on public.excel_product_match (product_id)
  where product_id is not null;

/* ------------------------------------------------------------------
 * 5. 브랜드 줄임말
 * ------------------------------------------------------------------
 * 명세 4번. 「S → STÜSSY」 같은 뉴욕 쪽 줄임말을 데이터로 두어 코드 수정 없이 사장님이
 * 추가/수정합니다. 관리자 > 설정 > 브랜드 줄임말 화면이 이 표를 읽고 씁니다.
 *
 * ★ brand_slug = null 이면 「미취급 브랜드」 표시로 둡니다 — 아페쎄·타미·뉴발란스 등.
 */
create table if not exists public.brand_aliases (
  id            uuid primary key default gen_random_uuid(),
  /** 엑셀에서 쓰는 줄임말/약어 (대소문자 통일해 저장) */
  alias         text not null,
  /** 우리 브랜드 slug. null = 취급하지 않는 브랜드 */
  brand_slug    text,
  /** 메모 — "뉴욕이 10월부터 쓰기 시작" 같은 */
  note          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table public.brand_aliases
  is '뉴욕트렌딕 단가표의 브랜드 줄임말 → 우리 브랜드 slug. 관리자가 바로 추가/수정합니다.';
comment on column public.brand_aliases.brand_slug
  is '우리 brands 테이블의 slug. null 로 두면 「취급하지 않는 브랜드」로 분류됩니다.';

create unique index if not exists brand_aliases_alias_uniq
  on public.brand_aliases (lower(alias));

/* ------------------------------------------------------------------
 * 6. 처음 쓸 브랜드 줄임말 시드 (명세 4번 표)
 * ------------------------------------------------------------------
 * ★ 중복이면 그대로 둡니다 (ON CONFLICT DO NOTHING).
 *   brand_slug 는 실제 brands 테이블에 있는 slug 를 참고하세요. 사장님 환경과 다르면
 *   관리자 > 설정 > 브랜드 줄임말 에서 바로 고치시면 됩니다.
 */
insert into public.brand_aliases (alias, brand_slug) values
  ('S',            'stussy'),
  ('스투시',       'stussy'),
  ('PL',           'polo-ralph-lauren'),
  ('폴로',         'polo-ralph-lauren'),
  ('폴',           'polo-ralph-lauren'),
  ('랄프로렌',     'polo-ralph-lauren'),
  ('아미',         'ami'),
  ('꼼데',         'comme-des-garcons'),
  ('꼼데가르송',   'comme-des-garcons'),
  ('메종',         'maison-kitsune'),
  ('메종키츠네',   'maison-kitsune'),
  ('라코',         'lacoste'),
  ('라코스테',     'lacoste'),
  ('아크',         'arcteryx'),
  ('아크테릭스',   'arcteryx'),
  ('파타',         'patagonia'),
  ('파타고니아',   'patagonia'),
  ('알로',         'alo'),
  ('가니',         'ganni'),
  ('단톤',         'danton'),
  ('휴먼메이드',   'human-made'),
  ('비비안웨스트우드','vivienne-westwood'),
  ('CK',           'calvin-klein'),
  ('캘빈클라인',   'calvin-klein'),
  -- 「미취급」 — brand_slug null
  ('아페쎄',       null),
  ('타미',         null),
  ('뉴발란스',     null),
  ('디젤',         null),
  ('이미스',       null),
  ('BAE',          null)
on conflict (lower(alias)) do nothing;

-- ── RLS ──
-- ★ 손님에게 유출될 수 있는 테이블(product_costs · product_cost_history)은 RLS 로
--   완전히 잠급니다. 아래 ALTER 는 바로 돌리고, 정책은 rls-cost-sheet.sql 로 분리.
alter table public.product_costs           enable row level security;
alter table public.product_cost_history    enable row level security;
alter table public.excel_product_match     enable row level security;
alter table public.brand_aliases           enable row level security;

/* ------------------------------------------------------------------
 * 확인 쿼리 (주석 — 돌릴 땐 지우고 Run)
 * ------------------------------------------------------------------
 * 1) products.sku 가 생겼는지
 *    select column_name from information_schema.columns
 *     where table_schema='public' and table_name='products' and column_name='sku';
 *
 * 2) 원가 테이블이 생겼는지
 *    select count(*) from public.product_costs;        -- 0 이어야 정상
 *
 * 3) 브랜드 줄임말이 들어갔는지
 *    select alias, brand_slug from public.brand_aliases order by alias;
 */
