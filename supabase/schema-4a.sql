-- ============================================================
-- JZL CLOSET 4단계-A 스키마 — KSNET 카드결제 연동
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (if not exists / or replace).
--
-- 실행 순서
--   1) supabase/schema.sql       (1-A · 상품)
--   2) supabase/settings.sql     (1-A · 사이트 설정)
--   3) supabase/schema-1b.sql    (1-B · 분류 · 브랜드)
--   4) supabase/seed-1b.sql      (1-B · 시드)
--   5) supabase/schema-2a.sql    (2-A · 주문)
--   6) supabase/schema-2b.sql … schema-3k.sql  (이미 돌린 것들)
--   7) supabase/schema-4a.sql    ← 지금 이 파일
--   8) supabase/rls-4a.sql       (4-A · 접근 제어. 반드시 이 파일 다음)
--
-- ★ 이 SQL 을 돌리기 전에도 사이트는 그대로 뜹니다.
--   코드가 없는 컬럼을 견디도록 되어 있습니다. 다만 카드결제는
--   이 파일을 돌린 뒤에야 승인 결과를 저장할 수 있습니다.
-- ============================================================

-- ── 1. 주문 테이블에 결제 정보 칸을 추가합니다 ─────────────
--
-- 왜 필요한가
--   취소·정산·분쟁 처리에 전부 필요한 값들입니다.
--   특히 trno(거래번호)와 승인번호는 취소를 대행사에 요청할 때 반드시 있어야 합니다.
--   KSNET 은 가맹점에 취소 API 권한을 주지 않기 때문에, 이 값이 없으면
--   "취소해 달라"는 말조차 전할 수 없습니다.
--
-- 기존 컬럼과의 관계
--   pg_provider  이미 있습니다 → 'ksnet' 이 들어갑니다
--   pg_tid       이미 있습니다 → KSNET 거래번호(trno) 를 여기에 넣습니다
--   paid_at      이미 있습니다 → 승인 확인이 끝난 시각
alter table public.orders
  add column if not exists pg_auth_no        text,
  add column if not exists pg_trade_at       text,
  add column if not exists pg_amount         integer,
  add column if not exists pg_issuer_code    text,
  add column if not exists pg_acquirer_code  text,
  add column if not exists pg_installment    integer,
  add column if not exists pg_result_code    text,
  add column if not exists pg_message        text,
  add column if not exists cash_receipt_issued    boolean default false,
  add column if not exists cash_receipt_issued_at timestamptz,
  add column if not exists cancel_requested_at    timestamptz,
  add column if not exists cancel_done_at         timestamptz,
  add column if not exists cancel_memo            text;

comment on column public.orders.pg_tid            is 'KSNET 거래번호(trno). 취소·조회의 키값입니다. 대행사에 취소를 요청할 때 반드시 필요합니다';
comment on column public.orders.pg_auth_no        is '승인번호(authno). 실패하면 에러코드가 들어옵니다';
comment on column public.orders.pg_trade_at       is 'KSNET 거래일시 trddt+trdtm 원문 (YYYYMMDDHHMMSS). 형식을 바꾸지 않고 받은 그대로 둡니다';
comment on column public.orders.pg_amount         is 'PG 가 알려 준 승인 금액. total_amount 와 다르면 검토필요 상태가 됩니다';
comment on column public.orders.pg_issuer_code    is '발급사 코드(isscd)';
comment on column public.orders.pg_acquirer_code  is '매입사 코드(aqucd)';
comment on column public.orders.pg_installment    is '할부개월(halbu). 0 이면 일시불';
comment on column public.orders.pg_result_code    is '응답 코드. 실패 원인을 남겨 둡니다';
comment on column public.orders.pg_message        is '응답 메시지(msg1 msg2). EUC-KR 로 오는 값을 UTF-8 로 바꿔 저장합니다';
comment on column public.orders.cash_receipt_issued    is 'PG 가 현금영수증을 지원하지 않아 운영자가 홈택스에서 직접 발급합니다. 발급을 마치면 체크합니다';
comment on column public.orders.cancel_requested_at    is '취소 요청을 접수한 시각. 실제 환불은 대행사를 통해 사람이 처리합니다';
comment on column public.orders.cancel_done_at         is '실제 환불까지 끝난 시각';
comment on column public.orders.cancel_memo            is '취소 처리 메모 (대행사 접수번호 등)';

-- 관리자 목록의 "현금영수증 신청 건만 보기" 필터에 씁니다.
create index if not exists orders_cash_receipt_idx
  on public.orders (cash_receipt_type)
  where cash_receipt_type <> 'none';

-- 결제수단별로 골라 볼 일이 생깁니다. (카드 건만, 무통장 건만)
create index if not exists orders_payment_method_idx
  on public.orders (payment_method);

-- ── 2. 결제 원문 로그 ──────────────────────────────────────
--
-- 왜 필요한가
--   ① 노티(거래내역통보) 규격을 아직 확정할 수 없습니다.
--      받은 원문을 그대로 남겨 두어야 나중에 실제 데이터를 보고 파싱을 맞출 수 있습니다.
--   ② 돈이 오가는 기능이라 "그때 PG 가 뭐라고 답했는지" 를 반드시 남겨야 합니다.
--      분쟁이 났을 때 이 표가 유일한 근거입니다.
--   ③ 승인 확인에 실패한 건을 나중에 되짚어 볼 수 있어야 합니다.
--
-- ★ 이 표는 절대 지우지 마세요. 용량보다 근거가 중요합니다.
create table if not exists public.payment_logs (
  id          uuid primary key default gen_random_uuid(),
  -- 주문을 못 찾은 노티도 남겨야 하므로 둘 다 null 을 허용합니다.
  order_id    uuid references public.orders(id) on delete set null,
  order_no    text,
  -- approve(승인확인) | approve_retry(재시도) | notify(노티) | return(결제창 복귀)
  -- | mismatch(대조 실패) | error(통신·파싱 실패)
  kind        text not null,
  -- 성공/실패를 한눈에 보기 위한 값. 'O' / 'X' / '' 입니다.
  authyn      text,
  amount      integer,
  trno        text,
  -- 받은 원문 그대로. 손대지 않습니다.
  raw         text,
  -- 우리가 해석한 결과. 해석에 실패하면 null 입니다.
  parsed      jsonb,
  -- 노티는 인증이 없어 누가 보냈는지 남겨 둡니다.
  remote_ip   text,
  note        text,
  created_at  timestamptz default now()
);

comment on table  public.payment_logs      is 'KSNET 과 주고받은 원문. 분쟁·정산의 근거라 지우지 않습니다';
comment on column public.payment_logs.raw  is 'PG 가 보낸 원문 그대로. 파싱이 틀려도 이 값만 있으면 다시 맞출 수 있습니다';
comment on column public.payment_logs.kind is 'approve | approve_retry | notify | return | mismatch | error';

create index if not exists payment_logs_order_no_idx   on public.payment_logs (order_no);
create index if not exists payment_logs_created_at_idx on public.payment_logs (created_at desc);
create index if not exists payment_logs_kind_idx       on public.payment_logs (kind);

-- ── 3. 확인 ───────────────────────────────────────────────
-- 아래를 실행하면 새 컬럼이 다 들어갔는지 볼 수 있습니다.
--
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'orders'
--    and column_name like 'pg_%' or column_name like 'cash_receipt%'
--       or column_name like 'cancel_%'
--  order by column_name;
--
-- select count(*) from public.payment_logs;
