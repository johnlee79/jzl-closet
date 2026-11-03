-- ============================================================
-- 15. 같은 뉴욕트렌딕 상품을 두 번 등록하지 못하게 — DB 유일 인덱스 (2026-11-03)
-- ============================================================
--
-- ★ 14번 (275번 중복 정리) 을 먼저 끝내야 합니다. 중복이 남아 있으면 이 인덱스가 만들어지지 않습니다.
-- ★ 코드(app/admin/import-actions.ts)도 등록 전에 막지만, 두 번 빠르게 누르는 경우까지
--   확실히 막는 최종 문입니다. 걸리면 화면에 「이미 등록된 뉴욕트렌딕 상품」 으로 나옵니다.
-- ★ 셀스타는 걸지 않았습니다 — sellstar_id 338 이 이름이 다른 두 상품에 쓰여 있어 (아래 [참고])
--   먼저 확인이 필요합니다.
-- ============================================================

-- [1] 확인 — 읽기만. 0줄이어야 [2] 를 실행할 수 있습니다
select source_product_no, count(*), string_agg(slug, ' | ')
  from public.products
 where source = 'newyorktrd' and source_product_no is not null
 group by source_product_no
having count(*) > 1;

-- [2] 인덱스 만들기
create unique index if not exists products_newyorktrd_source_uniq
  on public.products (source, source_product_no)
  where source = 'newyorktrd' and source_product_no is not null;

-- [참고] 셀스타 같은 번호 — 읽기만
-- select sellstar_id, string_agg(slug || ' / ' || name, ' | ')
--   from public.products where sellstar_id is not null and sellstar_id > 0
--  group by sellstar_id having count(*) > 1;
