-- ============================================================
-- JZL CLOSET — 뉴욕트렌딕 후기 가져오기 지원
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다. 기존 리뷰에는 영향이 없습니다.
--
-- 실행 순서
--   1~10) 지금까지의 schema-*.sql 전부
--  11) supabase/schema-newyorktrd.sql       (뉴욕트렌딕 상품 가져오기 — 이미 돌리셨죠)
--  12) supabase/schema-newyorktrd-reviews.sql  ← 지금 이 파일
--  13) RLS 는 항상 마지막
--
-- 이 파일이 하는 일
--   · reviews 에 범용 출처 세 칸을 답니다 (source · source_review_id · source_url)
--   · 같은 외부 후기를 두 번 가져오지 않도록 유일 인덱스를 만듭니다
--   · 관리자 리뷰 관리 화면이 출처로 거를 수 있게 복합 인덱스를 만듭니다
--
-- ★ 왜 user_id 를 안 쓰나
--   JZL 회원이 아닌 뉴욕트렌딕 쪽 후기라 user_id 는 null 로 둡니다.
--   기존 reviews 테이블은 user_id 가 nullable 이고, user_id = null 이면
--   포인트 지급 로직이 호출되지 않습니다 (points.ts). 그래서 추가 변경 없이
--   표시광고법상 지급 금지 조건을 자연스레 지킵니다.
-- ============================================================

alter table public.reviews
  add column if not exists source           text,
  add column if not exists source_review_id text,
  add column if not exists source_url       text;

comment on column public.reviews.source
  is '리뷰를 어디서 가져왔나. newyorktrd · sellstar · null(우리 손님). ★ 표시광고법상 null 이 아니면 손님 화면에 반드시 ‘뉴욕트렌딕 구매 후기’ 처럼 출처 배지를 띄워야 합니다. 평균 별점과 리뷰 개수에는 섞이지 않습니다 (lib/reviews.ts summarize·getRatingsByProduct 가 source IS NULL 로 거릅니다).';
comment on column public.reviews.source_review_id
  is '원본 쇼핑몰의 리뷰 번호. 같은 후기를 두 번 가져오지 않도록 유일 인덱스에 묶입니다.';
comment on column public.reviews.source_url
  is '원본 리뷰 주소. 운영자가 원본을 바로 열어볼 때 씁니다.';

-- 같은 외부 후기를 두 번 들여오지 않도록 유일 인덱스.
-- source 가 null (우리 손님) 인 행은 이 인덱스에 포함되지 않습니다.
create unique index if not exists reviews_source_dedup
  on public.reviews (source, source_review_id)
  where source is not null and source_review_id is not null;

-- 관리자 리뷰 관리의 '출처로 걸러보기' 성능용.
create index if not exists reviews_source_product_idx
  on public.reviews (source, product_id)
  where source is not null;

-- ── 확인 ──────────────────────────────────────────────────
-- 출처별 리뷰 수
-- select coalesce(source, '(우리 손님)') as source, count(*)
--   from public.reviews
--  group by source
--  order by count(*) desc;
--
-- 어떤 상품에 외부 후기가 몇 건씩 들어가 있는지
-- select p.name, r.source, count(*)
--   from public.reviews r
--   join public.products p on p.id = r.product_id
--  where r.source is not null
--  group by p.name, r.source
--  order by count(*) desc;
