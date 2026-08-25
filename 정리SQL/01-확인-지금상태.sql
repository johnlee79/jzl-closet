-- ============================================================
-- 01. 지금 무엇이 있는지 (읽기만 합니다 · 아무것도 바꾸지 않습니다)
-- ============================================================

-- ── 주문 24건의 내용 ──────────────────────────────────────
-- ★ pg_comm_con_id 가 있으면 카드결제가 실제로 일어난 주문입니다.
-- ★ stock_released_at 이 비어 있으면 아직 재고를 잡고 있습니다.
select order_no, created_at, status, payment_method, total_amount,
       pg_comm_con_id, stock_released_at, user_id
  from public.orders
 order by created_at;

-- ── 표마다 몇 건씩 있나 ───────────────────────────────────
select 'orders' as 표, count(*) from public.orders
union all select 'order_items',           count(*) from public.order_items
union all select 'order_status_history',  count(*) from public.order_status_history
union all select 'payment_logs',          count(*) from public.payment_logs
union all select 'stock_moves',           count(*) from public.stock_moves
union all select 'point_transactions',    count(*) from public.point_transactions
union all select 'profiles',              count(*) from public.profiles
union all select 'reviews',               count(*) from public.reviews
union all select 'inquiries',             count(*) from public.inquiries
union all select 'referral_links',        count(*) from public.referral_links
union all select 'referral_visits',       count(*) from public.referral_visits
union all select 'referral_achievements', count(*) from public.referral_achievements
union all select 'products',              count(*) from public.products;

-- ── 재고가 지금 어떻게 들어가 있나 ────────────────────────
-- ★ options 는 {groups:[...], combinations:[{key, stock, isActive, extraPrice}]} 입니다.
-- ★ stock 이 null 이면 "재고 미관리" 라 주문을 막지 않습니다.
select p.name,
       p.slug,
       p.is_sold_out                          as 상품전체품절,
       c->>'key'                              as 옵션조합,
       c->>'stock'                            as 재고,
       c->>'isActive'                         as 판매중
  from public.products p
  cross join lateral jsonb_array_elements(
         case when jsonb_typeof(p.options->'combinations') = 'array'
              then p.options->'combinations' else '[]'::jsonb end) as c
 order by p.name, c->>'key';

-- ── 재고를 숫자로 관리하는 조합이 몇 개인가 ───────────────
select count(*) filter (where jsonb_typeof(c->'stock') = 'number') as 숫자로관리,
       count(*) filter (where jsonb_typeof(c->'stock') <> 'number') as 미관리
  from public.products p
  cross join lateral jsonb_array_elements(
         case when jsonb_typeof(p.options->'combinations') = 'array'
              then p.options->'combinations' else '[]'::jsonb end) as c;

-- ── 1,000원짜리 테스트 상품 찾기 ──────────────────────────
select id, name, slug, price, is_visible, is_sold_out, created_at
  from public.products
 where price <= 1000
    or name ilike '%테스트%'
    or slug ilike '%test%'
 order by created_at;
