-- ============================================================
-- JZL CLOSET — 3단계-C 접근 제어 (RLS)
-- schema-3c.sql 을 실행한 뒤 맨 마지막에 실행하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 3-C 에서는 새 테이블도, 새 DB 함수도 만들지 않았습니다.
--   · 팝업 기간은 컬럼 값만 정리했습니다
--   · 자동취소는 DB 함수가 아니라 앱(서버 라우트, service_role)이 합니다.
--     재고 되돌리기와 포인트 반환이 상품 옵션 JSON·포인트 함수와 얽혀 있어
--     SQL 로 옮기면 같은 로직이 두 벌이 됩니다. 어긋나면 재고가 틀어집니다.
--
-- 그래서 이 파일이 하는 일은 두 가지입니다.
--   1) 3-A · 3-B 정책이 그대로 살아 있는지 다시 보장
--   2) 서버 전용 함수 권한을 다시 잠금 (rls-3b.sql 과 같은 방식)
-- ============================================================

-- ── 1. 정책 재확인 ────────────────────────────────────────
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.popups               enable row level security;

drop policy if exists popups_public_read on public.popups;

create policy popups_public_read
  on public.popups for select
  to anon, authenticated
  using (is_visible = true);

-- ★ 주문에는 쓰기 정책을 만들지 않습니다.
--   자동취소를 포함한 모든 상태 변경은 서버(service_role)가 합니다.
drop policy if exists orders_select_own on public.orders;

create policy orders_select_own
  on public.orders for select
  to authenticated
  using (user_id is not null and auth.uid() = user_id);

-- ── 2. 서버 전용 함수 실행 권한 ───────────────────────────
-- ★ rls-3b.sql 과 같은 방식입니다.
--   인자 목록을 파일에 적어 두면 실제 DB 와 어긋나는 순간 실패하므로
--   pg_proc 에서 지금 존재하는 시그니처를 읽어 그대로 적용합니다.
--   오버로드가 여러 개여도 전부 처리하고, 없는 함수는 건너뜁니다.
do $$
declare
  fn record;
  signature text;
begin
  for fn in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in (
         'apply_point_change',
         'consume_point_lots',
         'refresh_point_expiry',
         'expire_points',
         'next_inquiry_no',
         'next_order_no'
       )
  loop
    signature := format('public.%I(%s)', fn.proname, fn.args);

    execute format(
      'revoke all on function %s from public, anon, authenticated', signature
    );
    execute format('grant execute on function %s to service_role', signature);

    raise notice '서버 전용으로 잠금: %', signature;
  end loop;
end $$;

-- ── 확인 ──────────────────────────────────────────────────
-- 함수 권한 (anon_can_run · user_can_run 이 false 여야 합니다)
-- select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
--        has_function_privilege('anon',          p.oid, 'execute') as anon_can_run,
--        has_function_privilege('authenticated', p.oid, 'execute') as user_can_run,
--        has_function_privilege('service_role',  p.oid, 'execute') as server_can_run
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('apply_point_change','expire_points','consume_point_lots',
--                      'refresh_point_expiry','next_inquiry_no','next_order_no')
--  order by 1;
--
-- ★ 실행한 뒤 확인할 것
--   1) 메인에서 팝업이 실제로 뜨는지 (노출 기간을 오늘로 걸고 확인)
--   2) 관리자 주문 목록에 들어갔을 때 기한 지난 입금대기 건이 자동취소되는지
--   3) 송장이 입력된 주문·자동취소 제외 주문은 그대로 남아 있는지
