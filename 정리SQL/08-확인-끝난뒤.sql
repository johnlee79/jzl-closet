-- ============================================================
-- 08. 정리가 끝난 뒤 확인 (읽기만 합니다)
-- ============================================================

-- ── ① 계정 — 2줄이어야 합니다 ─────────────────────────────
select u.email, p.name, p.point_balance
  from auth.users u
  left join public.profiles p on p.id = u.id
 order by u.created_at;

-- ── ② 비었어야 하는 표 ────────────────────────────────────
select 'orders' as 표, count(*) as 건수 from public.orders
union all select 'order_items',           count(*) from public.order_items
union all select 'order_status_history',  count(*) from public.order_status_history
union all select 'point_transactions',    count(*) from public.point_transactions
union all select 'reviews',               count(*) from public.reviews
union all select 'inquiries',             count(*) from public.inquiries
union all select 'referral_achievements', count(*) from public.referral_achievements
union all select 'referral_visits',       count(*) from public.referral_visits
union all select 'referral_links',        count(*) from public.referral_links
union all select 'stock_moves',           count(*) from public.stock_moves
union all select 'order_no_seq',          count(*) from public.order_no_seq;
-- ↑ 전부 0 이어야 합니다.

-- ── ③ 남아 있어야 하는 것 ─────────────────────────────────
select 'products' as 표, count(*) as 건수 from public.products
union all select 'brands',          count(*) from public.brands
union all select 'categories',      count(*) from public.categories
union all select 'notices',         count(*) from public.notices
union all select 'popups',          count(*) from public.popups
union all select 'site_settings',   count(*) from public.site_settings
union all select 'referral_goals',  count(*) from public.referral_goals
union all select 'referral_gifts',  count(*) from public.referral_gifts
union all select 'payment_logs',    count(*) from public.payment_logs;
-- ↑ products·brands·categories·site_settings 는 0 이면 안 됩니다.
--   payment_logs 는 남기기로 했다면 그대로 있어야 합니다.

-- ── ④ 재고 — 06 을 돌렸다면 숫자로관리 가 0 ───────────────
select count(*) filter (where jsonb_typeof(c->'stock') = 'number')  as 숫자로관리,
       count(*) filter (where jsonb_typeof(c->'stock') <> 'number') as 미관리
  from public.products p
  cross join lateral jsonb_array_elements(
         case when jsonb_typeof(p.options->'combinations') = 'array'
              then p.options->'combinations' else '[]'::jsonb end) as c;
