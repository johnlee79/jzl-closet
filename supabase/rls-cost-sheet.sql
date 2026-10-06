-- ============================================================
-- JZL CLOSET — 단가표 테이블 RLS (반드시 schema-cost-sheet.sql 뒤에 실행)
--
-- 원가 테이블은 손님에게 유출되면 안 됩니다. 네 테이블 전부 service_role 만 읽고
-- 쓸 수 있게 잠그고, anon·authenticated 는 **아무 정책도 안 둬서 자동으로 거부**됩니다.
-- (schema-cost-sheet.sql 끝의 ALTER TABLE ... enable row level security 와 짝)
--
-- ★ 왜 anon · authenticated 정책을 "아예 안 만드는가"
--   RLS 가 켜져 있고 정책이 없는 테이블은 **그 역할로 접근하는 모든 쿼리가 0 행**을
--   돌려줍니다. 손님 브라우저가 쓰는 anon 키로는 아예 보이지 않습니다. 관리자 서버
--   코드는 service_role 키를 쓰므로 RLS 자체를 우회해 그대로 작동합니다.
--
-- ★ 상품 상세·목록 쿼리는 products 를 읽을 뿐 product_costs 를 조인하지 않습니다.
--   손님 Supabase 클라이언트가 가능한 쿼리는 안전합니다.
-- ============================================================

-- product_costs — 완전 잠금
-- (정책을 안 두면 anon/authenticated 는 접근 불가)

-- product_cost_history — 완전 잠금

-- excel_product_match — 완전 잠금

-- brand_aliases — 완전 잠금
-- ★ 관리자 전용 데이터. 손님 쪽에서 쓸 일이 없습니다.

-- ── 안전 더블체크 ──
-- 네 테이블의 RLS 가 켜져 있는지 확인
-- select tablename, rowsecurity from pg_tables
--  where schemaname='public'
--    and tablename in ('product_costs','product_cost_history','excel_product_match','brand_aliases');
-- rowsecurity 가 모두 t(true) 여야 합니다.

do $$
begin
  if exists (
    select 1 from pg_tables
     where schemaname='public'
       and tablename in ('product_costs','product_cost_history','excel_product_match','brand_aliases')
       and rowsecurity = false
  ) then
    raise exception '네 테이블 중 RLS 가 꺼진 것이 있습니다. schema-cost-sheet.sql 끝의 ALTER TABLE ... enable row level security 가 돌았는지 확인하세요.';
  end if;
end $$;
