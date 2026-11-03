-- ============================================================
-- 14. 뉴욕트렌딕 275번 중복 정리 (2026-11-03)
-- ============================================================
--
--   A  polo-ralph-lauren-pony-logo-embroidered-hoodie    id ad5be9cb-0344-4345-8662-9f82ef19f4bc  (2026-10-07 등록)  ← 남김
--   B  polo-ralph-lauren-pony-logo-embroidered-hoodie-2  id ff0ca5a0-a1a0-45ef-a710-add9df9ffb9c  (2026-11-02 등록)  ← 정리
--
-- ★ 권장: SQL 대신 관리자 화면으로 하세요 (이번 배포 뒤)
--   상품 목록 → B 의 「삭제」 → 「후기를 다른 상품으로 옮기기」 에서 ★ 표시된 A 선택
--   → 후기 #11354 가 A 로 옮겨지고, B 가 지워지고, 손님 페이지도 바로 새로 그립니다.
--   주문이 붙어 있으면 화면이 삭제를 막고 숨김을 권합니다.
--
-- 화면을 못 쓸 때만 아래 SQL. 순서: [1] 확인 → [2] 정리 → [3] 확인
-- ============================================================


-- [1] 확인 — 읽기만 -------------------------------------------------
select p.slug, p.id, p.is_visible as 노출, p.price as 판매가, p.cost_price as 원가칸,
       (select count(*) from public.order_items oi where oi.product_id = p.id) as 주문줄,
       (select count(*) from public.reviews r where r.product_id = p.id)      as 후기,
       (select count(*) from public.inquiries i where i.product_id = p.id)    as 문의,
       (select count(*) from public.stock_moves s where s.product_id = p.id)  as 재고이동
  from public.products p
 where p.id in ('ad5be9cb-0344-4345-8662-9f82ef19f4bc', 'ff0ca5a0-a1a0-45ef-a710-add9df9ffb9c')
 order by p.created_at;
-- 기대 (2026-11-03 조회): A 주문0 후기0 문의0 / B 주문0 후기1(#11354) 문의0
-- ★ B 의 주문줄이 0 이 아니면 [2] 를 하지 말고 [2-숨김] 만 하세요.


-- [2] 정리 — B 에 주문이 없을 때 ------------------------------------
begin;

-- 후기 B → A
update public.reviews
   set product_id = 'ad5be9cb-0344-4345-8662-9f82ef19f4bc',
       product_slug = 'polo-ralph-lauren-pony-logo-embroidered-hoodie'
 where product_id = 'ff0ca5a0-a1a0-45ef-a710-add9df9ffb9c'
returning source, source_review_id;   -- 1줄 (#11354)

-- 문의가 있었다면 같이 옮김 (지금은 0건)
update public.inquiries
   set product_id = 'ad5be9cb-0344-4345-8662-9f82ef19f4bc'
 where product_id = 'ff0ca5a0-a1a0-45ef-a710-add9df9ffb9c';

-- B 삭제 — 주문이 붙어 있으면 지우지 않게 조건을 걸었습니다
delete from public.products
 where id = 'ff0ca5a0-a1a0-45ef-a710-add9df9ffb9c'
   and not exists (select 1 from public.order_items where product_id = 'ff0ca5a0-a1a0-45ef-a710-add9df9ffb9c')
returning slug;   -- 1줄이면 지워진 것. 0줄이면 주문이 있어 안 지운 것 → 아래 [2-숨김]

commit;


-- [2-숨김] B 에 주문이 있을 때만 — 지우지 않고 숨김 ------------------
-- update public.products set is_visible = false
--  where id = 'ff0ca5a0-a1a0-45ef-a710-add9df9ffb9c';


-- [3] 확인 — 읽기만 -------------------------------------------------
select slug, is_visible,
       (select count(*) from public.reviews r where r.product_id = p.id) as 후기
  from public.products p
 where source = 'newyorktrd' and source_product_no = 275;
-- 기대: A 한 줄, 후기 1

-- ★ B 의 사진 7장 + 상세 이미지는 R2 에 남습니다 (용량만 차지, 손님에게 안 보임).
-- ★ 정리가 끝나면 15번 (DB 유일 인덱스) 을 실행하세요.
