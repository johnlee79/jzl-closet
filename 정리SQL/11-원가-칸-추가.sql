-- ================================================================
--
--   11. 수익 관리 — 원가 칸 두 개를 추가합니다  (2026-08-27)
--
--   ★ 이것은 지우는 SQL 이 아닙니다. 칸을 **더하기만** 합니다.
--     기존 데이터는 하나도 바뀌지 않습니다. 되돌리기도 쉽습니다.
--
--   ★ 두 칸 다 비워 둘 수 있습니다(null).
--     그래서 이 SQL 을 돌리기 전에도 가게는 그대로 돌아가고,
--     돌린 뒤에는 수익 계산이 저절로 켜집니다.
--
-- ----------------------------------------------------------------
--   ★★ 왜 칸이 두 개인가
--
--   products.cost_price      원가의 원본. 관리자가 넣고 고칩니다.
--   order_items.unit_cost    주문한 그 순간의 원가를 복사해 둔 값.
--
--   상품 원가는 환율과 뉴욕 단가표에 따라 바뀝니다.
--   복사본이 없으면, 원가를 한 번 고치는 순간 **지나간 주문의 마진이
--   전부 소급해서 달라집니다.** 그런데 아무 데도 오류가 안 나서
--   나중에 "지난달 수익이 왜 어제랑 다르지" 를 추적할 방법이 없습니다.
--
--   판매가도 이미 같은 방식입니다. order_items.unit_price 가
--   "주문 시점 가격" 을 복사해 두고 있습니다. 원가만 다르게 두면
--   같은 파일 안에서 규칙이 두 개가 됩니다.
--
-- ================================================================


-- ── ① 돌리기 전 확인 (읽기만) ───────────────────────────────
--   지금 그 칸이 없어야 정상입니다. 0줄이 나오면 아직 안 돌린 것입니다.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and (table_name = 'products'    and column_name = 'cost_price'
     or table_name = 'order_items' and column_name = 'unit_cost')
 order by table_name;


-- ── ② 칸 추가 ───────────────────────────────────────────────
--   ★ if not exists 라 여러 번 돌려도 안전합니다.

begin;

alter table public.products
  add column if not exists cost_price integer;

alter table public.order_items
  add column if not exists unit_cost integer;

comment on column public.products.cost_price is
  '매입 원가(원). 뉴욕 원가 + 택배비 합계. 비어 있으면 수익 계산에서 제외하고 화면에 "원가 미입력" 으로 셉니다';

comment on column public.order_items.unit_cost is
  '주문 시점의 개당 원가 복사본. products.cost_price 가 나중에 바뀌어도 지나간 주문의 마진이 안 틀어집니다. unit_price 와 같은 방식입니다';

commit;


-- ── ③ 돌린 뒤 확인 (읽기만) ─────────────────────────────────
--   ★ 2줄이 나와야 합니다.
--     order_items | unit_cost  | integer
--     products    | cost_price | integer

-- select table_name, column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and (table_name = 'products'    and column_name = 'cost_price'
--      or table_name = 'order_items' and column_name = 'unit_cost')
--  order by table_name;

--   ★ 상품이 그대로인지 (53개)
-- select count(*) as 상품수, count(cost_price) as 원가입력된수 from public.products;
--   ↑ 돌린 직후에는 상품수 53 · 원가입력된수 0 입니다.


-- ── ④ 되돌리려면 (지금은 쓸 일 없습니다) ────────────────────
--   ★ 칸을 지우면 넣어 둔 원가가 전부 사라집니다. 되돌릴 수 없습니다.

-- begin;
-- alter table public.products    drop column if exists cost_price;
-- alter table public.order_items drop column if exists unit_cost;
-- commit;
