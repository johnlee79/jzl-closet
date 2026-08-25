-- ============================================================
-- 02. 지워질 계정과 남을 계정 미리보기 (읽기만 합니다)
--
-- ★★ 04 번을 돌리기 전에 반드시 이것부터 보세요.
--   아래 "지워질 계정" 목록에 남겨야 할 두 주소가 보이면
--   멈추고 알려 주세요. 04 번을 돌리면 안 됩니다.
-- ============================================================

-- ── 남을 계정 (이 둘만 남아야 합니다) ─────────────────────
select u.id, u.email, u.created_at, p.name, p.point_balance
  from auth.users u
  left join public.profiles p on p.id = u.id
 where lower(u.email) in ('zlkim10@naver.com', 'hoonlee1013@gmail.com')
 order by u.created_at;
-- ↑ 결과가 2줄이어야 합니다. 1줄이면 한쪽 주소가 다릅니다. 멈추세요.

-- ── 지워질 계정 ───────────────────────────────────────────
select u.id, u.email, u.created_at, p.name, p.point_balance
  from auth.users u
  left join public.profiles p on p.id = u.id
 where lower(coalesce(u.email, '')) not in ('zlkim10@naver.com', 'hoonlee1013@gmail.com')
 order by u.created_at;
-- ↑ 이 목록에 위 두 주소가 있으면 절대 04 번을 돌리지 마세요.

-- ── 숫자만 빠르게 ─────────────────────────────────────────
select count(*) filter (where lower(coalesce(email,'')) in
         ('zlkim10@naver.com','hoonlee1013@gmail.com'))               as 남을계정,
       count(*) filter (where lower(coalesce(email,'')) not in
         ('zlkim10@naver.com','hoonlee1013@gmail.com'))               as 지워질계정
  from auth.users;
