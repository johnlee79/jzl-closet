-- ============================================================
-- 04. 회원 계정 삭제 — 남길 두 계정만 빼고
--
-- ❌ 되돌릴 수 없습니다.
-- ★ 반드시 02 번으로 "지워질 계정" 목록을 먼저 확인하세요.
-- ★ 03 번(주문 삭제)을 먼저 돌린 뒤에 하세요.
--
-- ★★ 남길 계정
--     zlkim10@naver.com       관리자
--     hoonlee1013@gmail.com   테스트용
--
-- ★★ auth.users 를 지우면 다음이 함께 지워집니다 (on delete cascade)
--     public.profiles          (schema-2b.sql:23)
--     public.point_transactions(schema-3a.sql:61)
--   그래서 profiles 를 따로 지울 필요가 없습니다.
--
-- ★★ 더 안전한 방법이 있습니다
--   계정 수가 적다면 Supabase 대시보드 → Authentication → Users 에서
--   하나씩 눌러 지우는 편이 실수할 여지가 적습니다.
--   그때도 위 두 계정만 남기시면 됩니다.
-- ============================================================

begin;

-- ★ 이메일이 비어 있는 계정도 지웁니다. (coalesce 로 빈 문자열 취급)
--   남길 두 주소는 lower() 로 비교하므로 대소문자가 달라도 안전합니다.
delete from auth.users
 where lower(coalesce(email, '')) not in (
   'zlkim10@naver.com',
   'hoonlee1013@gmail.com'
 );

commit;

-- ── 확인 — 반드시 2줄이어야 합니다 ────────────────────────
-- select email from auth.users order by created_at;
-- select id, name, email, point_balance from public.profiles;
