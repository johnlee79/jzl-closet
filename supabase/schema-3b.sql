-- ============================================================
-- JZL CLOSET — 3단계-B 스키마
-- (가입 경로 · 생일 · 리뷰 작성일 · 포인트 유효기간)
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 실행 순서
--   1) supabase/schema.sql      (1-A · 상품)
--   2) supabase/settings.sql    (1-A · 사이트 설정)
--   3) supabase/schema-1b.sql   (1-B · 분류 · 브랜드)
--   4) supabase/seed-1b.sql     (1-B · 시드)
--   5) supabase/schema-2a.sql   (2-A · 주문)
--   6) supabase/schema-2b.sql   (2-B · 회원 · 문의)
--   7) supabase/schema-3a.sql   (3-A · 리뷰 · 포인트 · 공지 · 팝업)
--   8) supabase/schema-3b.sql   ← 지금 이 파일
--   9) supabase/rls-2a.sql      (2-A · 접근 제어)
--  10) supabase/rls-2b.sql      (2-B · 접근 제어)
--  11) supabase/rls-3a.sql      (3-A · 접근 제어)
--  12) supabase/rls-3b.sql      (3-B · 접근 제어. 반드시 마지막)
--
-- 이 파일이 하는 일
--   · profiles 에 가입 경로(provider)·생일·소멸예정 포인트 칸을 만듭니다
--   · reviews 에 표시·정렬용 작성일(written_at)을 만듭니다
--   · point_transactions 에 유효기간(expires_at)과 남은 금액(remaining)을 만듭니다
--   · 포인트 적립·사용을 선입선출(먼저 만료되는 것부터)로 처리하도록 함수를 바꿉니다
--   · 만료 포인트를 털어 내는 expire_points() 배치 함수를 만듭니다
-- ============================================================

create extension if not exists "pgcrypto";

-- ── 1. 회원 ───────────────────────────────────────────────
alter table public.profiles
  add column if not exists provider            text    default 'email',
  add column if not exists birthday            date,
  add column if not exists birthday_point_year integer,
  add column if not exists point_expiring_soon integer default 0;

comment on column public.profiles.provider
  is '가입 경로. email | google | kakao | naver. 간편가입 회원에게는 비밀번호 변경 화면을 보여 주지 않습니다';
comment on column public.profiles.birthday_point_year
  is '생일 축하 포인트를 마지막으로 받은 연도. 연 1회만 지급하기 위한 값입니다';
comment on column public.profiles.point_expiring_soon
  is '30일 안에 소멸될 포인트. 화면에서 다시 계산하지 않도록 미리 채워 둡니다';

-- 이미 가입한 회원의 provider 를 auth.users 값으로 한 번 채웁니다.
update public.profiles p
   set provider = coalesce(nullif(u.raw_app_meta_data ->> 'provider', ''), 'email')
  from auth.users u
 where u.id = p.id
   and (p.provider is null or p.provider = 'email');

create index if not exists profiles_birthday_idx on public.profiles (birthday);

-- ── 2. 리뷰 — 표시·정렬용 작성일 ──────────────────────────
-- ★ created_at 은 감사 기록이라 그대로 둡니다.
--   관리자가 체험단 후기의 실제 작성일을 지정하면 written_at 만 바뀝니다.
alter table public.reviews
  add column if not exists written_at timestamptz;

update public.reviews set written_at = created_at where written_at is null;

alter table public.reviews alter column written_at set default now();

comment on column public.reviews.written_at
  is '화면에 보여 주고 정렬에 쓰는 작성일. 관리자가 지정할 수 있습니다. 실제 등록 시각은 created_at 에 남습니다';

create index if not exists reviews_written_at_idx on public.reviews (written_at desc);

-- ── 3. 주문 — 구매 적립 중복 방지 ─────────────────────────
alter table public.orders
  add column if not exists points_earned integer default 0;

comment on column public.orders.points_earned
  is '이 주문으로 지급한 구매 적립 포인트. 0 보다 크면 이미 지급한 주문이라 다시 주지 않습니다';

-- ── 4. 포인트 유효기간 ────────────────────────────────────
alter table public.point_transactions
  add column if not exists expires_at timestamptz,
  add column if not exists remaining  integer;

comment on column public.point_transactions.expires_at
  is '적립 건의 만료 시각. 사용·차감 건은 비어 있습니다';
comment on column public.point_transactions.remaining
  is '이 적립 건에서 아직 쓰지 않고 남은 금액. 사용은 먼저 만료되는 건부터 빠집니다';

create index if not exists point_transactions_lot_idx
  on public.point_transactions (user_id, expires_at)
  where amount > 0;

-- ============================================================
-- 5. 선입선출 차감
--
-- 포인트를 쓰면 "먼저 만료되는 적립분"부터 remaining 을 깎습니다.
-- 잔액(profiles.point_balance)은 apply_point_change 가 따로 관리하므로
-- 이 함수는 적립 건의 남은 금액만 손댑니다.
-- ============================================================
create or replace function public.consume_point_lots(
  p_user_id uuid,
  p_amount  integer
)
returns void as $$
declare
  need integer := p_amount;
  lot  record;
  take integer;
begin
  if need is null or need <= 0 then
    return;
  end if;

  for lot in
    select id, remaining
      from public.point_transactions
     where user_id = p_user_id
       and amount > 0
       and coalesce(remaining, 0) > 0
     order by coalesce(expires_at, 'infinity'::timestamptz) asc, created_at asc
     for update
  loop
    exit when need <= 0;
    take := least(lot.remaining, need);
    update public.point_transactions
       set remaining = remaining - take
     where id = lot.id;
    need := need - take;
  end loop;
end;
$$ language plpgsql;

comment on function public.consume_point_lots(uuid, integer)
  is '포인트 사용분을 먼저 만료되는 적립 건부터 깎습니다 (선입선출)';

-- ============================================================
-- 6. 30일 내 소멸 예정 금액 다시 계산
--
-- ★ 화면에서 내역을 매번 합산하지 않도록 profiles 에 미리 채워 둡니다.
--   포인트가 바뀔 때마다, 그리고 expire_points() 를 돌릴 때 갱신됩니다.
-- ============================================================
create or replace function public.refresh_point_expiry(p_user_id uuid)
returns void as $$
declare
  soon integer;
begin
  select coalesce(sum(remaining), 0) into soon
    from public.point_transactions
   where user_id = p_user_id
     and amount > 0
     and coalesce(remaining, 0) > 0
     and expires_at is not null
     and expires_at > now()
     and expires_at <= now() + interval '30 days';

  update public.profiles
     set point_expiring_soon = coalesce(soon, 0)
   where id = p_user_id;
end;
$$ language plpgsql;

-- ============================================================
-- 7. 포인트 적립·사용 (3-A 함수 교체)
--
-- 인자가 하나 늘어 다른 함수로 취급되므로 예전 것을 먼저 지웁니다.
-- ============================================================
drop function if exists public.apply_point_change(uuid, integer, text, text, uuid);
drop function if exists public.apply_point_change(uuid, integer, text, text, uuid, timestamptz);

create or replace function public.apply_point_change(
  p_user_id    uuid,
  p_amount     integer,
  p_reason     text,
  p_memo       text        default null,
  p_ref_id     uuid        default null,
  p_expires_at timestamptz default null
)
returns integer as $$
declare
  current_balance integer;
  next_balance    integer;
begin
  -- 같은 회원의 포인트가 동시에 바뀌지 않도록 행을 잠급니다.
  select coalesce(point_balance, 0) into current_balance
    from public.profiles
   where id = p_user_id
   for update;

  if not found then
    raise exception '회원을 찾을 수 없습니다: %', p_user_id;
  end if;

  next_balance := current_balance + p_amount;

  if next_balance < 0 then
    raise exception '포인트가 모자랍니다. 보유 %, 요청 %', current_balance, p_amount;
  end if;

  update public.profiles
     set point_balance = next_balance
   where id = p_user_id;

  insert into public.point_transactions
    (user_id, amount, balance, reason, memo, ref_id, expires_at, remaining)
  values (
    p_user_id, p_amount, next_balance, p_reason, p_memo, p_ref_id,
    case when p_amount > 0 then p_expires_at else null end,
    case when p_amount > 0 then p_amount     else null end
  );

  -- 사용·차감은 먼저 만료되는 적립분부터 깎습니다.
  if p_amount < 0 then
    perform public.consume_point_lots(p_user_id, -p_amount);
  end if;

  perform public.refresh_point_expiry(p_user_id);

  return next_balance;
end;
$$ language plpgsql;

comment on function public.apply_point_change(uuid, integer, text, text, uuid, timestamptz)
  is '포인트 잔액과 내역을 한 트랜잭션에서 함께 바꿉니다. 사용분은 선입선출로 깎고 소멸예정 금액을 다시 계산합니다';

-- ============================================================
-- 8. 기존 내역 보정
--
-- 3-A 때 쌓인 내역에는 만료일과 남은 금액이 없습니다.
-- 적립 건에 유효기간 12개월을 매기고, 이미 쓴 만큼을 오래된 것부터 깎아 둡니다.
-- 한 번만 돌면 되고, 다시 돌려도 아무 일도 하지 않습니다.
-- ============================================================
do $$
declare
  member record;
  spent  integer;
begin
  if not exists (
    select 1 from public.point_transactions where amount > 0 and remaining is null
  ) then
    return;
  end if;

  update public.point_transactions
     set remaining  = amount,
         expires_at = coalesce(expires_at, created_at + interval '12 months')
   where amount > 0
     and remaining is null;

  for member in
    select user_id, coalesce(sum(-amount), 0) as used
      from public.point_transactions
     where amount < 0
     group by user_id
  loop
    spent := member.used;
    perform public.consume_point_lots(member.user_id, spent);
  end loop;

  for member in select id from public.profiles loop
    perform public.refresh_point_expiry(member.id);
  end loop;
end $$;

-- ============================================================
-- 9. 만료 포인트 정리 배치
--
-- 만료된 적립분을 0으로 만들고 같은 금액을 잔액에서 빼며 소멸 내역을 남깁니다.
-- 돌려주는 값: 정리된 회원 수
--
-- ★ 손으로 한 번 돌려보기
--     select public.expire_points();
--
-- ★ 매일 자동으로 돌리려면 (Supabase 대시보드 > Database > Extensions 에서
--   pg_cron 을 먼저 켠 뒤) 아래 두 줄의 주석을 풀고 실행하세요.
--   한국시간 새벽 4시 = UTC 19시입니다.
--
--   create extension if not exists pg_cron;
--   select cron.schedule('jzl-expire-points', '0 19 * * *', $cron$ select public.expire_points(); $cron$);
--
--   등록된 작업 확인:  select * from cron.job;
--   삭제:              select cron.unschedule('jzl-expire-points');
-- ============================================================
create or replace function public.expire_points()
returns integer as $$
declare
  member  record;
  touched integer := 0;
begin
  for member in
    select user_id, coalesce(sum(remaining), 0) as expired
      from public.point_transactions
     where amount > 0
       and coalesce(remaining, 0) > 0
       and expires_at is not null
       and expires_at <= now()
     group by user_id
  loop
    if member.expired <= 0 then
      continue;
    end if;

    update public.point_transactions
       set remaining = 0
     where user_id = member.user_id
       and amount > 0
       and coalesce(remaining, 0) > 0
       and expires_at is not null
       and expires_at <= now();

    update public.profiles
       set point_balance = greatest(0, coalesce(point_balance, 0) - member.expired)
     where id = member.user_id;

    insert into public.point_transactions (user_id, amount, balance, reason, memo)
    select member.user_id,
           -member.expired,
           coalesce(p.point_balance, 0),
           'expire',
           '유효기간 만료'
      from public.profiles p
     where p.id = member.user_id;

    perform public.refresh_point_expiry(member.user_id);
    touched := touched + 1;
  end loop;

  return touched;
end;
$$ language plpgsql;

comment on function public.expire_points()
  is '유효기간이 지난 포인트를 잔액에서 빼고 소멸 내역을 남깁니다. pg_cron 으로 하루 한 번 돌리세요';

-- ── 확인 ──────────────────────────────────────────────────
-- select id, provider, birthday, point_balance, point_expiring_soon from public.profiles;
-- select reason, amount, remaining, expires_at from public.point_transactions order by created_at desc limit 20;
-- select product_slug, rating, written_at, created_at from public.reviews order by written_at desc limit 10;
