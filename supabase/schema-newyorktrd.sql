-- ============================================================
-- JZL CLOSET — 뉴욕트렌딕 가져오기 지원 (범용 출처 컬럼)
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다. 기존 상품에는 영향이 없습니다.
--
-- 실행 순서
--   1) supabase/schema.sql        (1-A · 상품)
--   2) supabase/settings.sql      (1-A · 사이트 설정)
--   3) supabase/schema-1b.sql     (1-B · 분류 · 브랜드)
--   4) supabase/seed-1b.sql       (1-B · 시드)
--   5) supabase/schema-2a.sql     (2-A · 주문)
--   6) supabase/schema-2b.sql     (2-B · 회원 · 문의)
--   7) supabase/schema-3a.sql     (3-A · 리뷰 · 포인트 · 공지 · 팝업)
--   8) supabase/schema-3b.sql     (3-B · 가입경로 · 포인트 유효기간)
--   9) supabase/schema-3c.sql     (3-C · 팝업 기간 · 자동취소)
--  10) supabase/schema-3d.sql     (3-D · 셀스타 연동)
--  11) supabase/schema-newyorktrd.sql  ← 지금 이 파일
--  12) rls-2a · rls-2b · rls-3a · rls-3b · rls-3c  (RLS 는 항상 마지막)
--
-- 이 파일이 하는 일
--   · products 에 범용 출처 컬럼을 답니다 (source · source_product_no · source_url)
--   · 셀스타·뉴욕트렌딕 둘 다 같은 자리에 저장합니다
--   · 기존 셀스타 상품 (sellstar_id 가 채워진 행) 은 source='sellstar' 로 채워 넣습니다
--
-- ★ 왜 이렇게 하는가
--   기존에는 sellstar_id 하나로 중복 확인·다시 불러오기를 했습니다. 뉴욕트렌딕이
--   추가되면서 "어느 쇼핑몰에서 가져왔는가"를 함께 저장해야 합니다. sellstar_id 는
--   그대로 두고 (기존 코드가 아직 참조합니다) 범용 세 컬럼을 추가합니다.
-- ============================================================

-- ── 범용 출처 컬럼 ────────────────────────────────────────
alter table public.products
  add column if not exists source             text,
  add column if not exists source_product_no  integer,
  add column if not exists source_url         text;

comment on column public.products.source
  is '가져온 쇼핑몰 이름. sellstar · newyorktrd 중 하나. 손으로 등록한 상품은 비어 있습니다.';
comment on column public.products.source_product_no
  is '쇼핑몰 쪽 상품번호. 중복 확인에 씁니다.';
comment on column public.products.source_url
  is '원본 상품 주소. 운영자가 바로 열어볼 수 있게 저장합니다.';

-- ── 기존 셀스타 상품 백필 ─────────────────────────────────
-- sellstar_id 가 채워진 행은 source='sellstar' 로 맞춥니다.
-- source_url 은 셀스타 쪽 /store/{storeId}/product/{id} 를 모르는 상태라 비웁니다.
-- (관리자가 다시 불러오기를 누를 때 채워 넣습니다)
update public.products
   set source            = 'sellstar',
       source_product_no = sellstar_id
 where sellstar_id is not null
   and source is null;

-- ── 중복 확인용 인덱스 ────────────────────────────────────
-- 가져오기 화면이 (source, source_product_no) 로 "이미 등록된 상품입니다" 를 띄울 때 씁니다.
-- 유일 제약이 아닌 이유 — 운영자가 일부러 두 번 가져다 쓸 수도 있어서입니다.
create index if not exists products_source_idx
  on public.products (source, source_product_no)
  where source is not null;

-- ── 확인 ──────────────────────────────────────────────────
-- 출처별 상품 수
-- select source, count(*)
--   from public.products
--  group by source
--  order by source nulls last;
--
-- 같은 출처+상품번호가 두 번 들어간 것이 있는지
-- select source, source_product_no, count(*)
--   from public.products
--  where source is not null
--  group by source, source_product_no having count(*) > 1;
