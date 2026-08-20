-- ============================================================
-- JZL CLOSET 4단계-A 접근 제어 — 결제 로그
--
-- ★ 반드시 supabase/schema-4a.sql 을 먼저 실행한 뒤에 돌리세요.
--
-- payment_logs 에는 승인번호·거래번호가 들어 있습니다.
-- 밖에서 읽을 이유가 전혀 없는 표라 정책을 하나도 만들지 않습니다.
-- (RLS 를 켜고 정책이 없으면 service_role 만 접근할 수 있습니다.
--  우리 서버 코드는 전부 service_role 로 접근하므로 그대로 동작합니다)
-- ============================================================

alter table public.payment_logs enable row level security;

drop policy if exists payment_logs_public_read on public.payment_logs;
-- 정책 없음 = service_role 만 접근

-- ── 확인 ──────────────────────────────────────────────────
-- select relname, relrowsecurity
--   from pg_class
--  where relnamespace = 'public'::regnamespace
--    and relname = 'payment_logs';
--
-- select tablename, policyname from pg_policies
--  where schemaname = 'public' and tablename = 'payment_logs';
--  (결과가 0건이어야 정상입니다)
