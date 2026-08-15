-- ============================================================
-- JZL CLOSET — 3단계-E 스키마 (브랜드 로고)
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다. 기존 데이터에는 영향이 없습니다.
--
-- 실행 순서
--   ... schema-3c.sql → schema-3d.sql → schema-3e.sql ← 지금 이 파일
--   그 뒤 rls-2a · rls-2b · rls-3a · rls-3b · rls-3c 를 실행합니다. (RLS 는 항상 마지막)
--
-- 이 파일이 하는 일
--   · brands 에 로고 이미지 칸을 만듭니다.
--
-- ★ 왜 기존 image_url 을 쓰지 않는가
--   image_url 은 브랜드 페이지 상단에 21:9 로 크게 깔리는 "대표 사진" 입니다.
--   가로로 긴 사진을 필터의 작은 자리에 넣으면 알아볼 수 없습니다.
--   로고는 성격이 아주 다른 이미지라 칸을 따로 둡니다.
--   비워 두면 브랜드명을 글자로 보여 주므로, 채우지 않아도 사이트는 그대로 동작합니다.
-- ============================================================

alter table public.brands
  add column if not exists logo_url text;

comment on column public.brands.logo_url
  is '브랜드 로고. 상품 목록 필터와 브랜드 페이지 상단에 씁니다. 비우면 브랜드명을 글자로 보여 줍니다';

-- ── 확인 ──────────────────────────────────────────────────
-- select slug, label,
--        case when coalesce(logo_url, '') = '' then '글자로 표시' else '로고 표시' end as 표시방식,
--        display_order, is_visible
--   from public.brands
--  order by display_order;
