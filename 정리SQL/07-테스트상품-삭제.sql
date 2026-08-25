-- ============================================================
-- 07. 1,000원짜리 테스트 상품 삭제
--
-- ❌ 되돌릴 수 없습니다.
-- ★ 03(주문 삭제)을 먼저 돌린 뒤에 하세요.
--   주문이 남아 있는 상품을 지우면 그 주문 화면에 상품 이름만 남습니다.
--   (order_items 는 상품 이름·가격을 값으로 복사해 두므로 깨지지는 않습니다)
--
-- ★★ products 를 지워도 다음은 남습니다 (외래키가 없습니다)
--     reviews.product_id    · stock_moves.product_id
--   03 번에서 둘 다 이미 비웠으므로 이번에는 신경 쓰지 않아도 됩니다.
-- ============================================================

-- ── ① 먼저 무엇이 지워질지 눈으로 확인하세요 ──────────────
-- ★★ 이 결과에 진짜 판매 상품이 섞여 있으면 멈추세요.
--   가격이 1,000원 이하인 진짜 상품이 있을 수 있습니다.
select id, name, slug, price, is_visible, is_sold_out, created_at
  from public.products
 where price <= 1000
    or name ilike '%테스트%'
    or slug ilike '%test%'
 order by created_at;

-- ── ② 확인한 뒤에만 아래를 돌리세요 ───────────────────────
--
-- ★★ 조건으로 한꺼번에 지우지 마세요.
--   위 목록에서 실제로 지울 상품의 slug 를 눈으로 골라 적으세요.
--   조건(price <= 1000)으로 지우면 나중에 저가 상품을 올렸을 때
--   같은 실수가 반복됩니다.
--
-- 아래 'test-product' 자리에 위에서 확인한 slug 를 넣고,
-- 맨 앞의 -- 두 개를 지운 뒤 실행하세요. 여러 개면 콤마로 나열합니다.

-- begin;
-- delete from public.products
--  where slug in ('test-product');
-- commit;

-- ── 확인 ──────────────────────────────────────────────────
-- select count(*) from public.products;
-- select name, slug, price from public.products order by created_at;
