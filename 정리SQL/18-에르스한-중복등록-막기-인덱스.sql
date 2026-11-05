-- ============================================================
-- 18. 같은 에르스한 상품을 두 번 등록하지 못하게 — DB 유일 인덱스 (2026-11-05)
-- ============================================================
--
-- ★ 꼭 돌려야 하는 것은 아닙니다. 에르스한 가져오기는 이 파일 없이도 동작합니다.
--   products.source 는 글자 칸이라 'aershan' 을 그대로 받습니다 (테이블 구조 변경 없음).
-- ★ 코드(app/admin/import-actions.ts) 가 등록 전에 막지만, 두 번 빠르게 누르는 경우까지
--   확실히 막는 최종 문입니다. 걸리면 화면에 「이미 등록된 에르스한 상품」 으로 나옵니다.
-- ★ 뉴욕트렌딕 쪽(15번) 과 따로입니다 — 뉴욕 33번과 에르스한 33번은 서로 막지 않습니다.
-- ★ 아직 에르스한 상품이 하나도 없을 때 돌리면 [1] 은 반드시 0줄입니다.
-- ============================================================

-- [1] 확인 — 읽기만. 0줄이어야 [2] 를 실행할 수 있습니다
select source_product_no, count(*), string_agg(slug, ' | ')
  from public.products
 where source = 'aershan' and source_product_no is not null
 group by source_product_no
having count(*) > 1;

-- [2] 인덱스 만들기
create unique index if not exists products_aershan_source_uniq
  on public.products (source, source_product_no)
  where source = 'aershan' and source_product_no is not null;

-- [3] 확인 — 출처별 상품 수 (읽기만)
-- select source, count(*) from public.products group by source order by source nulls last;
