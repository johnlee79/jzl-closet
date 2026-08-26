-- ============================================================
-- 10. 회원이 실제로 몇 명인지 확인 (읽기 전용)
--
-- ★★ 이 파일은 조회만 합니다. 무엇도 바꾸지 않습니다.
--    delete · update · insert 가 한 줄도 없습니다.
--
-- ★ 왜 만들었나
--   관리자 회원 관리에서 탭 뱃지 숫자와 목록 건수가 어긋나 보인 일이
--   있었습니다. 화면을 고치기 전에 "진짜 몇 명인지" 를 DB 에서 직접
--   확인해 두면, 고친 뒤에 맞는지 틀리는지 바로 알 수 있습니다.
--
-- ★ 실행 순서 — Supabase → SQL Editor 에서 ①②③④ 를 위에서부터 하나씩.
--   한 번에 다 붙여 넣어도 되고, 하나씩 돌려도 됩니다.
-- ============================================================


-- ── ① 상태별 인원 (관리자 화면의 탭 뱃지와 같아야 합니다) ──
select status, count(*) as 인원
  from public.profiles
 group by status
 order by status;

-- 기대: active 가 몇 명, inactive·withdrawn 이 각각 몇 명인지 나옵니다.
-- 화면의  활성 / 비활성 / 탈퇴  뱃지와 이 숫자가 같아야 합니다.


-- ── ② 전체 인원 (「전체」 탭 뱃지와 같아야 합니다) ─────────
select count(*) as 전체인원 from public.profiles;

-- 기대: ①의 인원을 모두 더한 값과 같습니다.
-- 화면의 「전체」 뱃지, 그리고 조건을 아무것도 안 걸었을 때의
-- "조건에 맞는 회원 N명" 이 셋 다 이 숫자와 같아야 합니다.


-- ── ③ 회원 한 명씩 보기 ────────────────────────────────────
select email,
       name,
       status,
       provider,
       created_at as 가입일,
       last_login_at as 최근로그인
  from public.profiles
 order by created_at desc;

-- ★ 카카오로 가입한 계정이 여기 들어 있는지 눈으로 확인하세요.
--   hoonlee1013@kakao.com 이 보이면 회원 테이블에 정상 등록된 것입니다.


-- ── ④ 로그인 계정과 회원 정보가 어긋나지 않는지 ────────────
--
-- ★★ 이것이 중요한 이유
--   로그인 계정(auth.users)과 쇼핑몰 회원(profiles)은 다른 표입니다.
--   auth 에는 있는데 profiles 에 없는 계정이 생기면, 그 사람은 로그인은
--   되는데 마이페이지에서 "이 계정으로는 쓸 수 없습니다" 를 보게 됩니다.
--   관리자 이메일 계정이 대표적인 예입니다. (가입한 적이 없으니 정상입니다)

select u.email                             as 로그인계정,
       u.created_at                        as 계정생성일,
       case when p.id is null then '없음' else p.status end as 회원정보
  from auth.users u
  left join public.profiles p on p.id = u.id
 order by u.created_at desc;

-- 읽는 법
--   회원정보 = active   → 정상적인 쇼핑몰 회원
--   회원정보 = withdrawn→ 탈퇴한 회원 (정상)
--   회원정보 = 없음     → 로그인은 되지만 쇼핑몰 회원이 아닌 계정.
--                        관리자용 계정이면 정상입니다.
--                        손님 계정인데 '없음' 이면 알려 주세요.
