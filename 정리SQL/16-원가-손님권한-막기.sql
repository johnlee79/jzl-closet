-- ============================================================
-- 16. 원가(cost_price) 가 손님(anon) 권한으로 읽히는 것 막기 (2026-11-03, 급함)
-- ============================================================
--
-- ★ 무엇이 새고 있나 (2026-11-03 실제 시험)
--   공개 키(anon) 로 /rest/v1/products?select=slug,cost_price → HTTP 200, 원가 값이 그대로 나옴.
--   공개 키는 손님 브라우저에 실려 있어서 누구나 볼 수 있습니다. 노출 상품 65개의 원가가 읽혔습니다.
--   원인: products_public_read 정책이 "줄" 은 막아도 "칸" 은 못 막음 → 모든 칸이 다 보임.
--
-- ★ 막는 방법: 손님 권한에서 products 읽기를 통째로 뺍니다.
--   가게 화면(상품 목록·상세)은 서버에서 service role 로 읽으므로 영향이 없습니다.
--   (코드 확인: 공개 키 클라이언트는 로그인·회원 기능에만 쓰고 products 를 읽지 않습니다.)
--
-- 순서: [1] 막기 → [2] 확인 → 가게 화면 / 와 상품 하나를 열어 보기
-- ============================================================

-- [1] 막기 ---------------------------------------------------------
revoke select on public.products from anon, authenticated;

-- [2] 확인 — 읽기만. 두 줄 모두 false 여야 합니다 --------------------
select has_column_privilege('anon',          'public.products', 'cost_price', 'select') as anon_원가_읽기,
       has_column_privilege('authenticated', 'public.products', 'cost_price', 'select') as 회원_원가_읽기;

-- ★ 되돌리기 (가게 화면이 깨질 때만):
--   grant select on public.products to anon, authenticated;
--   원가만 빼고 열어 두려면 원하는 칸만 나열해 grant select (id, slug, name, ...) on public.products to anon;
