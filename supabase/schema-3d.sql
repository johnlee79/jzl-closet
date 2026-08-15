-- ============================================================
-- JZL CLOSET — 3단계-D 스키마 (셀스타 상품 가져오기)
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다. 기존 상품에는 영향이 없습니다.
--
-- 실행 순서
--   1) supabase/schema.sql      (1-A · 상품)
--   2) supabase/settings.sql    (1-A · 사이트 설정)
--   3) supabase/schema-1b.sql   (1-B · 분류 · 브랜드)
--   4) supabase/seed-1b.sql     (1-B · 시드)
--   5) supabase/schema-2a.sql   (2-A · 주문)
--   6) supabase/schema-2b.sql   (2-B · 회원 · 문의)
--   7) supabase/schema-3a.sql   (3-A · 리뷰 · 포인트 · 공지 · 팝업)
--   8) supabase/schema-3b.sql   (3-B · 가입경로 · 포인트 유효기간)
--   9) supabase/schema-3c.sql   (3-C · 팝업 기간 · 자동취소)
--  10) supabase/schema-3d.sql   ← 지금 이 파일
--  11) rls-2a · rls-2b · rls-3a · rls-3b · rls-3c  (RLS 는 항상 마지막)
--
-- 이 파일이 하는 일
--   · products 에 셀스타 연동 정보를 답니다 (상품번호 · 동기화 시각 · 원본 가격)
--   · 같은 셀스타 상품을 두 번 가져오지 않도록 중복 확인용 인덱스를 만듭니다
--
-- ★ 상세설명 블록의 이미지 원본 크기(width·height)는 별도 컬럼이 아니라
--   detail_blocks(jsonb) 안에 그대로 들어갑니다. 3-C 에서 도입한 구조를 그대로 씁니다.
--   스키마 변경이 필요 없습니다.
-- ★ 글 템플릿과 공통 블록도 새 테이블 없이 site_settings 에 JSON 으로 저장합니다.
--   (키: 'import') 설정은 이미 site_settings 로 통일돼 있어 같은 방식을 따릅니다.
-- ============================================================

-- ── 셀스타 연동 정보 ──────────────────────────────────────
alter table public.products
  add column if not exists sellstar_id         integer,
  add column if not exists sellstar_synced_at  timestamptz,
  add column if not exists sellstar_price      integer,
  add column if not exists sellstar_sale_price integer;

comment on column public.products.sellstar_id
  is '셀스타 상품번호. 중복 확인과 다시 불러오기에 씁니다. 손으로 등록한 상품은 비어 있습니다';
comment on column public.products.sellstar_synced_at
  is '셀스타에서 마지막으로 가져온 시각';
comment on column public.products.sellstar_price
  is '가져올 당시의 셀스타 정가. 우리 판매가와 견주어 볼 때 씁니다';
comment on column public.products.sellstar_sale_price
  is '가져올 당시의 셀스타 판매가. 마진 계산의 기준입니다';

-- ★ 같은 셀스타 상품을 두 번 가져오면 사이트에 같은 상품이 두 개 생깁니다.
--   유일 인덱스로 막지는 않습니다. (일부러 두 벌 만들 수도 있어서)
--   대신 가져오기 화면이 이 인덱스로 빠르게 찾아 "이미 등록된 상품입니다" 를 띄웁니다.
create index if not exists products_sellstar_id_idx
  on public.products (sellstar_id)
  where sellstar_id is not null;

-- ── 확인 ──────────────────────────────────────────────────
-- 가져온 상품 목록
-- select sellstar_id, slug, name, price, sellstar_sale_price,
--        is_visible,
--        sellstar_synced_at at time zone 'Asia/Seoul' as 마지막동기화
--   from public.products
--  where sellstar_id is not null
--  order by sellstar_synced_at desc;
--
-- 같은 셀스타 상품이 두 번 들어간 것이 있는지
-- select sellstar_id, count(*)
--   from public.products
--  where sellstar_id is not null
--  group by sellstar_id having count(*) > 1;
