-- ============================================================
-- 09. 2026-08-25 개발 시험으로 만든 데이터 삭제
--
-- ★ 만든 것
--     상품  [테스트] 주문하지 마세요 · 개발용   slug: zz-test-do-not-order
--     주문  ORD-20260825-0007  (무통장 1,000원, 비회원)
--
-- ★ 상품은 이미 "숨김" 으로 바꿔 두어 손님에게 보이지 않습니다.
--   완전히 지우려면 아래를 돌리거나, 관리자 상품 목록에서 [삭제] 를 누르세요.
--
-- ★ 주문은 관리자 화면에 삭제 기능이 없습니다. 아래 SQL 로만 지울 수 있습니다.
-- ============================================================

-- ── ① 먼저 무엇이 지워질지 확인하세요 (읽기만) ────────────
select order_no, status, total_amount, orderer_name, created_at
  from public.orders
 where order_no = 'ORD-20260825-0007';

select name, slug, price, is_visible
  from public.products
 where slug = 'zz-test-do-not-order';

-- ↑ 각각 1줄씩만 나와야 합니다. 다른 것이 섞여 있으면 멈추세요.


-- ── ② 확인한 뒤에만 아래를 돌리세요 ───────────────────────
--
-- ★ order_items 와 order_status_history 는 cascade 로 함께 지워집니다.
-- ★ payment_logs 는 이 주문에 없습니다. (무통장이라 PG 를 안 탔습니다)
-- ★ 재고는 되돌릴 것이 없습니다. 이 상품의 옵션은 전부 "미관리" 였습니다.
-- ★ 포인트도 없습니다. 비회원 주문이라 적립 대상이 아니었습니다.
--
-- 맨 앞의 -- 두 개를 지운 뒤 실행하세요.

-- begin;
-- delete from public.orders   where order_no = 'ORD-20260825-0007';
-- delete from public.products where slug     = 'zz-test-do-not-order';
-- commit;


-- ── ③ 지운 뒤 확인 (읽기만) ───────────────────────────────
-- select count(*) from public.orders   where order_no = 'ORD-20260825-0007';  -- 0
-- select count(*) from public.products where slug = 'zz-test-do-not-order';   -- 0
-- select count(*) from public.products;                                        -- 37 로 돌아옵니다
