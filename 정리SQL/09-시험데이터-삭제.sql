-- ================================================================
--
--   ★★ 2026-08-27 알림 — 이 파일은 이미 한 번 돌렸습니다.
--
--   아래 건수는 **돌리기 전** 기준이라 지금과 다릅니다.
--   그 뒤 수익 관리 기능을 시험하며 만든 주문이 남아 있습니다.
--
--     ORD-20260826-0008   무통장 4,980원  → 취소완료 (취소 제외 시험)
--     ORD-20260826-0009   카드 250,000원  → 결제완료 (카드 수수료 시험)
--     ORD-20260826-0010   무통장           → 결제완료 + 부분취소 시험
--                          (아미 폴로 250,000원 줄만 취소 → 1,980원 남음)
--     주문자 이름이 전부 '수익시험' 으로 시작합니다.
--
--   ★ 지우시려면 ②번의 delete from public.orders; 한 줄이면 됩니다.
--     (order_items · order_status_history 는 함께 지워집니다)
--   ★ 상품은 건드리지 마세요. 53개 그대로입니다.
--
-- ================================================================

-- ================================================================
--
--   09. 시험 데이터 전부 삭제  (2026-08-26 다시 씀)
--
--   ██  이 파일은 되돌릴 수 없습니다.  ██
--
--   지운 손님 기록은 어디에도 남지 않습니다. 백업이 없습니다.
--   Supabase 대시보드에서 "되돌리기" 같은 것은 없습니다.
--
-- ----------------------------------------------------------------
--   ★ 반드시 이 순서로 하세요
--
--     1) ①번만 먼저 돌립니다. 아무것도 안 지워집니다. 보기만 합니다.
--     2) 나온 목록을 눈으로 확인합니다.
--     3) 아래 세 가지 중 하나라도 걸리면 **멈추고 알려 주세요.**
--
--        · 회원 목록에 모르는 이름·이메일이 있다
--        · 주문 목록에 진짜 손님 주문 같은 것이 섞여 있다
--        · 상품 표에 zz-test-do-not-order 말고 다른 것이 나온다   ← 특히 이것
--
--     4) 아무 문제 없을 때만 ②번의 주석을 풀어 돌립니다.
--     5) ③번으로 결과를 확인합니다.
--
-- ----------------------------------------------------------------
--   ★★ 상품은 건드리지 않습니다
--
--   상품 표(products)에는 사장님이 실제로 등록하신 상품이 들어 있습니다.
--   2026-08-26 기준 54개이고, 그중 **53개가 진짜 상품**입니다.
--   시험용 zz-test-do-not-order **하나만** 지웁니다.
--
--   ②번에 상품을 지우는 줄은 slug 를 정확히 박아 두었습니다.
--   그 줄을 고치지 마세요. where 절을 넓히면 가게가 통째로 날아갑니다.
--
-- ----------------------------------------------------------------
--   ★★ 관리자 계정은 지우지 않습니다
--
--   zlkim10@naver.com  (Supabase 가입 방식: email)
--
--   이 계정까지 지우면 관리자 이메일 로그인이 막힙니다.
--   (관리자 비밀번호 통로는 계정과 무관하게 살아 있으니 완전히 잠기지는
--    않지만, 굳이 그 상황을 만들 이유가 없습니다)
--
--   ②번의 auth.users 삭제 줄에 그 이메일을 빼는 조건이 들어 있습니다.
--   그 조건을 지우지 마세요.
--
-- ================================================================


-- ================================================================
-- ① 지워질 것을 눈으로 확인합니다  (아무것도 안 지웁니다)
-- ================================================================

-- ── 1-1. 표별 건수 요약 ─────────────────────────────────────
--   지워질 것과 남을 것을 한눈에 봅니다.
select '회원 profiles'            as 표, count(*) as 건수, '전부 지움' as 처리 from public.profiles
union all
select '주문 orders',              count(*), '전부 지움' from public.orders
union all
select '주문상품 order_items',     count(*), '주문 지우면 자동' from public.order_items
union all
select '주문이력 order_status_history', count(*), '주문 지우면 자동' from public.order_status_history
union all
select '문의 inquiries',           count(*), '전부 지움' from public.inquiries
union all
select '리뷰 reviews',             count(*), '전부 지움' from public.reviews
union all
select '포인트 point_transactions', count(*), '회원 지우면 자동' from public.point_transactions
union all
select '추천-방문 referral_visits', count(*), '회원 지우면 자동' from public.referral_visits
union all
select '추천-연결 referral_links',  count(*), '회원 지우면 자동' from public.referral_links
union all
select '추천-달성 referral_achievements', count(*), '회원 지우면 자동' from public.referral_achievements
union all
select '결제기록 payment_logs',     count(*), '전부 지움' from public.payment_logs
union all
select '재고이동 stock_moves',      count(*), '전부 지움' from public.stock_moves
union all
select 'auth 계정 (관리자 제외)',   count(*), '전부 지움'
  from auth.users where email is distinct from 'zlkim10@naver.com'
union all
select '★ 상품 products (남음)',    count(*), '건드리지 않음'
  from public.products where slug <> 'zz-test-do-not-order'
union all
select '★ 사은품 referral_gifts (남음)', count(*), '건드리지 않음' from public.referral_gifts
union all
select '★ 추천목표 referral_goals (남음)', count(*), '건드리지 않음' from public.referral_goals
order by 1;


-- ── 1-2. 지워질 회원 — 이름과 이메일을 눈으로 확인 ──────────
--   ★ 모르는 이름이 있으면 멈추세요.
select p.name        as 이름,
       p.email       as 이메일,
       p.provider    as 가입방식,
       p.status      as 상태,
       p.created_at  as 가입일
  from public.profiles p
 order by p.created_at;


-- ── 1-3. 지워질 auth 계정 ───────────────────────────────────
--   ★ 관리자 zlkim10@naver.com 이 이 목록에 **없어야** 합니다.
select u.email                          as 이메일,
       u.raw_app_meta_data->>'provider' as 가입방식,
       u.created_at                     as 만든날
  from auth.users u
 where u.email is distinct from 'zlkim10@naver.com'
 order by u.created_at;


-- ── 1-4. 지워질 주문 전부 ───────────────────────────────────
--   ★ 진짜 손님 주문 같은 것이 섞여 있으면 멈추세요.
select o.order_no      as 주문번호,
       o.status        as 상태,
       o.payment_method as 결제수단,
       o.total_amount  as 금액,
       o.orderer_name  as 주문자,
       o.orderer_phone as 연락처,
       o.created_at    as 주문일시
  from public.orders o
 order by o.created_at;


-- ── 1-5. ★★ 상품 표 — 시험용 하나만 나와야 합니다 ──────────
--   ★ 여기서 두 줄 이상 나오면 **즉시 멈추세요.**
--     ②번의 상품 삭제 줄을 절대 돌리지 마세요.
select p.name, p.slug, p.price, p.is_visible
  from public.products p
 where p.slug = 'zz-test-do-not-order';

--   그리고 남을 상품이 몇 개인지 (지금 53개여야 합니다)
select count(*) as "지운 뒤 남을 상품 수"
  from public.products
 where slug <> 'zz-test-do-not-order';



-- ================================================================
-- ② 실제 삭제  —  ①번을 확인한 뒤에만 주석을 푸세요
-- ================================================================
--
--   ★★ 지우는 순서가 중요합니다.
--     딸려 있는 기록부터 지우고 본체를 나중에 지웁니다.
--     순서를 틀리면 오류가 나거나, 오류 없이 찌꺼기만 남습니다.
--     찌꺼기가 남으면 나중에 대시보드 숫자가 이상해집니다.
--
--   ★ 자동으로 따라 지워지는 것과 아닌 것이 섞여 있습니다.
--     아래 주석에 어느 쪽인지 적어 두었습니다.
--     "자동" 이라고 적힌 것도 명시적으로 한 번 더 지웁니다.
--     스키마가 바뀌어 자동이 아니게 되어도 찌꺼기가 안 남게 하기 위해서입니다.
--
--   맨 앞의 -- 두 개를 지운 뒤 통째로 실행하세요.
--   begin/commit 으로 묶여 있어 중간에 실패하면 전부 되돌아갑니다.

-- begin;
--
-- -- (1) 주문에 딸린 기록 — 주문을 지우면 order_id 가 null 로만 바뀌고
-- --     행은 남습니다(on delete set null). 그래서 먼저 지웁니다.
-- delete from public.payment_logs;          -- 결제 기록 (KSNET 주고받은 원문)
-- delete from public.stock_moves;           -- 재고 이동 기록
--
-- -- (2) 주문·회원 양쪽에 걸려 있는 것 — 둘 다 set null 이라 안 지워집니다.
-- delete from public.reviews;               -- 리뷰
-- delete from public.inquiries;             -- 문의
--
-- -- (3) 주문 본체 — order_items 와 order_status_history 는 cascade 로 함께 지워집니다.
-- delete from public.orders;                -- 주문 (딸린 상품·이력 자동 삭제)
--
-- -- (4) 회원에 딸린 기록 — auth.users 를 지우면 cascade 로 따라가지만,
-- --     순서를 눈에 보이게 하려고 먼저 지웁니다.
-- delete from public.referral_achievements; -- 추천 목표 달성 기록
-- delete from public.referral_links;        -- 추천인-피추천인 연결
-- delete from public.referral_visits;       -- 추천 링크 방문 기록
-- delete from public.point_transactions;    -- 포인트 적립·사용 내역
--
-- -- (5) 회원 본체
-- delete from public.profiles;              -- 쇼핑몰 회원 정보
--
-- -- (6) 로그인 계정 — ★ 관리자만 남깁니다. 이 조건을 지우지 마세요.
-- --     auth.identities · auth.sessions · auth.refresh_tokens 는 cascade 로 함께 지워집니다.
-- --
-- --     ★ 여기서 권한 오류가 나면(permission denied for table users)
-- --       이 한 줄만 빼고 나머지를 먼저 돌린 뒤,
-- --       Supabase 대시보드 > Authentication > Users 에서 손으로 지우세요.
-- --       zlkim10@naver.com 만 남기면 됩니다. 결과는 똑같습니다.
-- delete from auth.users
--  where email is distinct from 'zlkim10@naver.com';
--
-- -- (7) ★★ 상품 — 시험용 하나만. slug 를 고치지 마세요.
-- delete from public.products
--  where slug = 'zz-test-do-not-order';
--
-- commit;


-- ── ②-보너스. 주문번호를 오늘부터 0001 로 (원하실 때만) ─────
--
--   ★ 안 해도 됩니다. 주문번호는 원래 날짜마다 0001 부터 시작합니다.
--     (ORD-YYYYMMDD-NNNN 형식. 내일이 되면 저절로 0001 입니다)
--   ★ 오늘 당장 0001 부터 받고 싶을 때만 돌리세요.
--     안 돌리면 오늘 다음 주문은 ORD-20260826-0008 이 됩니다.

-- begin;
-- delete from public.order_no_seq;    -- 주문번호 당일 순번
-- delete from public.inquiry_no_seq;  -- 문의번호 당일 순번
-- commit;



-- ================================================================
-- ③ 지운 뒤 확인  (아무것도 안 지웁니다)
-- ================================================================

-- ── 3-1. 전부 0 이어야 하는 것 ──────────────────────────────
-- select '회원 profiles' as 표, count(*) as 남은건수 from public.profiles
-- union all select '주문 orders',                    count(*) from public.orders
-- union all select '주문상품 order_items',           count(*) from public.order_items
-- union all select '주문이력 order_status_history',  count(*) from public.order_status_history
-- union all select '문의 inquiries',                 count(*) from public.inquiries
-- union all select '리뷰 reviews',                   count(*) from public.reviews
-- union all select '포인트 point_transactions',      count(*) from public.point_transactions
-- union all select '추천-방문 referral_visits',      count(*) from public.referral_visits
-- union all select '추천-연결 referral_links',       count(*) from public.referral_links
-- union all select '추천-달성 referral_achievements', count(*) from public.referral_achievements
-- union all select '결제기록 payment_logs',          count(*) from public.payment_logs
-- union all select '재고이동 stock_moves',           count(*) from public.stock_moves
-- order by 1;
--   ↑ 남은건수가 전부 0 이어야 합니다.

-- ── 3-2. ★ 상품이 그대로인지 ────────────────────────────────
-- select count(*) as "남은 상품 수" from public.products;
--   ↑ 53 이어야 합니다. (지우기 전 54 − 시험용 1)
--   ★ 이 숫자가 53 이 아니면 즉시 알려 주세요.

-- select count(*) as "시험용 상품" from public.products where slug = 'zz-test-do-not-order';
--   ↑ 0 이어야 합니다.

-- ── 3-3. ★ 관리자 계정이 살아 있는지 ────────────────────────
-- select email, raw_app_meta_data->>'provider' as 가입방식 from auth.users;
--   ↑ zlkim10@naver.com 한 줄만 나와야 합니다.
--   ★ 아무것도 안 나오면 관리자 이메일 로그인이 막힌 것입니다.
--     그때는 관리자 비밀번호 칸으로 들어가시고 바로 알려 주세요.

-- ── 3-4. 사은품·추천목표가 그대로인지 (설정이라 안 지웁니다) ─
-- select (select count(*) from public.referral_gifts) as 사은품,
--        (select count(*) from public.referral_goals) as 추천목표;
