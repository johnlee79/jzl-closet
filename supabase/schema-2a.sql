-- ============================================================
-- JZL CLOSET — 2단계-A 스키마 (주문)
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (if not exists).
--
-- 실행 순서
--   1) supabase/schema.sql      (1-A · 상품)
--   2) supabase/settings.sql    (1-A · 사이트 설정)
--   3) supabase/schema-1b.sql   (1-B · 분류 · 브랜드)
--   4) supabase/seed-1b.sql     (1-B · 시드)
--   5) supabase/schema-2a.sql   ← 지금 이 파일
--   6) supabase/rls-2a.sql      (2-A · 접근 제어. 반드시 마지막)
-- ============================================================

create extension if not exists "pgcrypto";

-- ── 주문 ──────────────────────────────────────────────────
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_no           text unique not null,              -- ORD-20260814-0001
  status             text not null default 'pending_payment',
  -- pending_payment(입금대기) | paid(결제완료) | preparing(상품준비중)
  -- | shipping(배송중) | delivered(배송완료) | confirmed(구매확정)
  -- | cancelled(취소) | exchange(교환) | returned(반품) | failed(결제실패)

  -- 주문자
  orderer_name       text not null,
  orderer_phone      text not null,
  orderer_email      text,

  -- 배송지
  receiver_name      text not null,
  receiver_phone     text not null,
  postcode           text not null,
  address1           text not null,
  address2           text,
  delivery_memo      text,

  -- 결제
  depositor_name     text,                              -- 입금자명
  payment_method     text default 'bank_transfer',
  items_total        integer not null,                  -- 상품 합계
  shipping_fee       integer not null default 0,
  extra_shipping_fee integer default 0,                 -- 도서산간 추가
  discount           integer default 0,
  total_amount       integer not null,                  -- 최종 결제금액

  -- 현금영수증 (수동 발급용으로 보관합니다)
  cash_receipt_type  text default 'none',               -- none | personal | business
  cash_receipt_no    text,

  -- PG 연동 자리 (지금은 무통장입금만 쓰므로 비어 있습니다)
  pg_provider        text,
  pg_tid             text,                              -- PG 거래번호
  paid_at            timestamptz,

  -- 배송
  courier            text,                              -- 택배사 코드
  tracking_no        text,                              -- 송장번호

  admin_memo         text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

comment on table  public.orders                is '주문. 개인정보가 들어 있어 service_role 로만 접근합니다';
comment on column public.orders.order_no       is 'ORD-YYYYMMDD-NNNN. 당일 순번 4자리';
comment on column public.orders.total_amount   is '서버에서 다시 계산한 최종 금액. 클라이언트 값을 믿지 않습니다';
comment on column public.orders.pg_provider    is 'PG 연동 자리. 무통장입금은 null 입니다';

create index if not exists orders_status_idx     on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_order_no_idx   on public.orders (order_no);

-- ── 주문 상품 ─────────────────────────────────────────────
-- ★ 상품명·가격을 주문 시점 값으로 복사해 둡니다.
--   나중에 상품 가격이 바뀌어도 과거 주문 내역은 그대로여야 합니다.
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid,
  product_slug  text not null,
  product_name  text not null,                          -- 주문 시점 이름
  brand_label   text,
  option_key    text,                                   -- "블랙/M"
  unit_price    integer not null,                       -- 주문 시점 가격 (옵션 추가금액 포함)
  quantity      integer not null,
  line_total    integer not null,
  thumbnail_url text,
  item_status   text default 'normal',                  -- normal | cancelled (부분취소)
  created_at    timestamptz default now()
);

comment on column public.order_items.product_name is '주문 시점의 상품명. 상품이 바뀌어도 이 값은 유지됩니다';
comment on column public.order_items.item_status  is 'cancelled 이면 부분취소된 품목입니다';

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ── 상태 변경 이력 ────────────────────────────────────────
create table if not exists public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  memo        text,
  created_at  timestamptz default now()
);

create index if not exists order_status_history_order_id_idx
  on public.order_status_history (order_id);

-- ── updated_at 자동 갱신 ──────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ============================================================
-- 주문번호 생성 — ORD-YYYYMMDD-NNNN
--
-- 동시에 주문이 들어와도 번호가 겹치지 않아야 합니다.
-- order_no 에 unique 제약이 걸려 있으므로 겹치면 insert 가 실패합니다.
-- 그래서 번호를 별도 시퀀스 테이블에서 원자적으로 받아 갑니다.
--   1) 오늘 날짜 행을 잠그고(on conflict do update) 순번을 1 올린 뒤
--   2) 그 값을 돌려줍니다.
-- update ... returning 은 한 트랜잭션 안에서 행 잠금을 잡으므로
-- 동시에 들어와도 순번이 하나씩 늘어납니다.
-- (그래도 만일을 대비해 앱 쪽에서 unique 충돌 시 재시도합니다)
-- ============================================================
create table if not exists public.order_no_seq (
  day      date primary key,
  last_no  integer not null default 0
);

comment on table public.order_no_seq is '주문번호 당일 순번. next_order_no() 가 원자적으로 올립니다';

create or replace function public.next_order_no(at_date date default (now() at time zone 'Asia/Seoul')::date)
returns text as $$
declare
  seq integer;
begin
  insert into public.order_no_seq as s (day, last_no)
  values (at_date, 1)
  on conflict (day) do update set last_no = s.last_no + 1
  returning s.last_no into seq;

  return 'ORD-' || to_char(at_date, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
end;
$$ language plpgsql;

comment on function public.next_order_no(date) is '다음 주문번호를 원자적으로 발급합니다. ORD-YYYYMMDD-NNNN';

-- ── 확인 ──────────────────────────────────────────────────
-- select public.next_order_no();
-- select order_no, status, total_amount, created_at from public.orders order by created_at desc limit 10;
