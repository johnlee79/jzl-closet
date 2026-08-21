-- ============================================================
-- JZL CLOSET 4단계-B 스키마 — 미완결 카드 주문 처리
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (if not exists).
--
-- 실행 순서
--   1) supabase/schema.sql       (1-A · 상품)
--   2) supabase/settings.sql     (1-A · 사이트 설정)
--   3) supabase/schema-1b.sql    (1-B · 분류 · 브랜드)
--   4) supabase/seed-1b.sql      (1-B · 시드)
--   5) supabase/schema-2a.sql    (2-A · 주문)
--   6) supabase/schema-2b.sql … schema-3k.sql  (이미 돌린 것들)
--   7) supabase/schema-4a.sql    (4-A · KSNET 카드결제)
--   8) supabase/rls-4a.sql       (4-A · 접근 제어)
--   9) supabase/schema-4b.sql    ← 지금 이 파일
--  10) supabase/rls-4b.sql       (4-B · 접근 제어. 반드시 이 파일 다음)
--
-- ★ 이 SQL 을 돌리기 전에도 사이트는 그대로 뜹니다.
--   재고 되돌림 기록만 남지 않고, 중복 방지는 상태 검사로 한 겹만 동작합니다.
--   돌리고 나면 DB 수준에서 한 번만 되돌아가도록 잠깁니다.
-- ============================================================

-- ── 1. 재고를 이미 되돌렸는지 표시하는 칸 ──────────────────
--
-- 왜 필요한가
--   같은 주문의 재고를 두 번 되돌리면 없는 물건이 있는 것으로 잡힙니다.
--   그 상태로 주문을 받으면 손님에게 사과하고 취소해야 합니다.
--
--   지금도 "취소 상태가 아니었다가 취소 상태가 되었을 때만" 되돌리도록
--   막고 있지만, 그것만으로는 부족합니다.
--     결제대기 → 결제실패(되돌림) → 취소완료(또 되돌림)
--   처럼 되돌림이 일어나는 상태 사이를 오가면 두 번 일어납니다.
--   4-B 에서 결제실패도 재고를 되돌리게 되면서 실제로 생길 수 있는 길입니다.
--
-- 어떻게 막는가
--   이 칸이 비어 있을 때만 값을 채우는 조건부 UPDATE 로 자리를 먼저 잡고,
--   자리를 잡은 요청 하나만 재고를 건드립니다. (lib/orders.ts releaseOrderStock)
--   두 요청이 같은 순간에 들어와도 DB 가 하나만 통과시킵니다.
alter table public.orders
  add column if not exists stock_released_at timestamptz;

comment on column public.orders.stock_released_at is
  '이 주문 때문에 재고를 되돌린 시각. 채워져 있으면 다시 되돌리지 않습니다.';


-- ── 2. 재고가 움직인 기록 ──────────────────────────────────
--
-- 왜 필요한가
--   재고 숫자가 실제와 안 맞을 때 지금은 단서가 하나도 없습니다.
--   상품 테이블의 options 안에 숫자만 덮어써 왔기 때문에, 언제 왜 바뀌었는지
--   알 방법이 없었습니다. 이 표가 그 유일한 단서가 됩니다.
--
-- ★ 상품이 지워져도 기록은 남아야 합니다. 그래서 외래키를 걸지 않고
--   product_id·product_slug 를 값으로 적어 둡니다. (주문 상품 줄과 같은 방식)
-- ★ 재고를 관리하지 않는 옵션(stock = null)은 여기에 남지 않습니다.
--   움직인 것이 없기 때문입니다.
create table if not exists public.stock_moves (
  id            uuid primary key default gen_random_uuid(),
  -- 주문이 지워져도 기록은 남습니다.
  order_id      uuid references public.orders(id) on delete set null,
  order_no      text,
  product_id    uuid,
  product_slug  text,
  option_key    text,
  -- 'release' 되돌림(+) | 'deduct' 차감(-)
  direction     text not null,
  -- 움직인 수량. 언제나 양수입니다. 방향은 direction 이 말합니다.
  quantity      integer not null,
  -- 움직이기 전후의 재고. 어긋남을 추적할 때 이 두 값이 핵심입니다.
  stock_before  integer,
  stock_after   integer,
  -- '결제창 취소' · '미승인 자동정리' 처럼 사람이 읽을 이유
  reason        text,
  created_at    timestamptz default now()
);

create index if not exists stock_moves_order_id_idx  on public.stock_moves (order_id);
create index if not exists stock_moves_product_idx   on public.stock_moves (product_id, created_at desc);
create index if not exists stock_moves_created_idx   on public.stock_moves (created_at desc);

comment on table public.stock_moves is
  '재고가 움직인 기록. 재고 숫자가 안 맞을 때 추적하는 유일한 단서입니다.';


-- ── 3. 결제대기 카드 주문을 빨리 찾기 위한 인덱스 ──────────
--
-- 10분마다 도는 정리 작업이 "결제대기이면서 무통장입금이 아니고 오래된" 주문을
-- 찾습니다. 주문이 쌓이면 이 조건이 매번 전체를 훑게 됩니다.
create index if not exists orders_pending_sweep_idx
  on public.orders (status, payment_method, created_at);


-- ── 확인용 ─────────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'orders' and column_name = 'stock_released_at';
-- select count(*) from public.stock_moves;


-- ══════════════════════════════════════════════════════════
-- 4-B 수정본에서 더한 칸들
-- ══════════════════════════════════════════════════════════

-- ── 4. 결제 Key (reCommConId) ──────────────────────────────
--
-- ★★ 이것이 없으면 승인 재조회 자체가 불가능합니다.
--   KSNET 의 recv_post.jsp(sndActionType=1)는 sndCommConId 로만 조회됩니다.
--   주문번호로는 물어볼 수 없습니다.
--
--   4-A 는 이 값을 결제창 복귀 시점에 받아 승인 확인에만 쓰고 버렸습니다.
--   그래서 손님이 결제창을 닫고 나간 주문은 나중에 확인할 방법이 없었습니다.
--   이제 받는 즉시 주문 행에 적어 둡니다. 이 칸이 생긴 뒤의 주문부터
--   "승인이 났는데 우리만 모르는" 상태를 되살릴 수 있습니다.
--
-- ★★ pg_tid 에 같이 넣어 돌려쓰면 안 됩니다.
--   pg_tid 는 KSNET 거래번호(trno) 자리입니다. 취소를 대행사에 요청할 때
--   넘겨야 하는 값이라, 결제 Key 와 섞이면 엉뚱한 거래를 취소하게 됩니다.
alter table public.orders
  add column if not exists pg_comm_con_id text;

comment on column public.orders.pg_comm_con_id is
  'KSNET 결제 Key(reCommConId). 승인 재조회(recv_post.jsp)의 유일한 열쇠입니다. 거래번호(pg_tid)와 다릅니다.';


-- ── 5. 자동정리 알림을 이미 보냈는지 ───────────────────────
--
-- 왜 필요한가
--   카드 정리는 10분마다 돕니다. 승인확인실패로 바뀐 주문은 그 상태로 남으므로
--   표시가 없으면 같은 주문으로 하루 144번 알림이 갑니다.
--   알림이 잦으면 정작 중요한 것을 놓칩니다.
--
-- ★ 이 칸이 비어 있을 때만 채우는 조건부 UPDATE 로 한 번만 보냅니다.
alter table public.orders
  add column if not exists sweep_notified_at timestamptz;

comment on column public.orders.sweep_notified_at is
  '카드 자동정리 알림을 보낸 시각. 채워져 있으면 같은 주문으로 다시 알리지 않습니다.';


-- ── 6. 재고 기록에 "제외됨" 을 남길 자리 ───────────────────
--
-- 왜 필요한가
--   되돌리지 않고 건너뛴 품목이 있습니다.
--     · stock 이 null 인 조합 — 차감한 적이 없어 되돌리면 없던 재고가 생깁니다
--     · item_status = 'cancelled' — 부분취소가 이미 되돌렸습니다
--   조용히 건너뛰면 나중에 재고가 안 맞을 때 "왜 안 돌아왔는지" 를 알 수 없습니다.
--   건너뛴 사실과 이유를 남깁니다. direction 에 'skip' 이 들어갑니다.
alter table public.stock_moves
  add column if not exists excluded_reason text;

comment on column public.stock_moves.excluded_reason is
  'direction = skip 일 때 왜 되돌리지 않았는지. 재고가 안 맞을 때 이 줄이 단서가 됩니다.';


-- ── 확인용 ─────────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'orders'
--    and column_name in ('stock_released_at', 'pg_comm_con_id', 'sweep_notified_at');
