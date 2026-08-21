-- ============================================================
-- JZL CLOSET 4단계-B 접근 제어 — 재고 이동 기록
--
-- ★ 반드시 supabase/schema-4b.sql 을 먼저 실행한 뒤에 돌리세요.
--
-- stock_moves 는 운영 기록입니다. 손님 화면에서 읽을 이유가 전혀 없고,
-- 어느 상품이 언제 몇 개 빠졌는지는 매입·판매량이 드러나는 값이라
-- 밖으로 열면 안 됩니다.
--
-- RLS 를 켜고 정책을 하나도 만들지 않습니다.
-- 정책이 없으면 service_role 만 접근할 수 있고, 우리 서버 코드는 전부
-- service_role 로 접근하므로 그대로 동작합니다. (payment_logs 와 같은 방식)
-- ============================================================

alter table public.stock_moves enable row level security;

drop policy if exists stock_moves_public_read on public.stock_moves;
-- 정책 없음 = service_role 만 접근

-- ── 확인 ──────────────────────────────────────────────────
-- select relname, relrowsecurity
--   from pg_class
--  where relnamespace = 'public'::regnamespace
--    and relname = 'stock_moves';
--
-- select tablename, policyname from pg_policies
--  where schemaname = 'public' and tablename = 'stock_moves';
--  (결과가 0건이어야 정상입니다)
