-- ============================================================
-- JZL CLOSET — 3단계-F 스키마 (추천 코드)
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다. 기존 데이터에는 영향이 없습니다.
--
-- 실행 순서
--   ... schema-3c.sql → schema-3d.sql → schema-3e.sql → schema-3f.sql ← 지금 이 파일
--   그 뒤 rls-2a · rls-2b · rls-3a · rls-3b · rls-3c · rls-3f 를 실행합니다. (RLS 는 항상 마지막)
--
-- 이 파일이 하는 일
--   1) profiles 에 추천 코드와 집계 칸을 만듭니다
--   2) 방문 기록 · 추천 관계 · 사은품 · 목표 · 달성 기록 테이블을 만듭니다
--   3) 기존 회원 전원에게 추천 코드를 발급합니다
--   4) 집계값을 다시 계산하는 함수를 만듭니다
--
-- ★ 설계에서 반드시 지킨 것
--   방문·가입 자체로는 포인트를 주지 않습니다. 숫자만 셉니다.
--   보상은 관리자가 만든 "목표"를 달성했을 때만 나갑니다.
--   그래서 이 파일 어디에도 자동 지급 트리거가 없습니다.
--   지급은 앱이 목표를 확인한 뒤 apply_point_change 를 부르는 방식입니다.
-- ============================================================

-- ── 1. profiles 확장 ──────────────────────────────────────

alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles(id) on delete set null,
  add column if not exists referred_at timestamptz,
  -- 집계값. 조회할 때마다 세지 않고 여기 적어 둔 숫자만 읽습니다.
  -- (3-B 의 포인트 잔액과 같은 방식입니다)
  add column if not exists referral_visit_count integer not null default 0,
  add column if not exists referral_signup_count integer not null default 0,
  add column if not exists referral_purchase_count integer not null default 0,
  -- ★ 어뷰징 판별용. 이 회원이 마지막으로 초대 화면을 연 기기·회선의 해시입니다.
  --   원본 IP 나 브라우저 정보는 저장하지 않습니다. 해시라 되돌릴 수 없습니다.
  --   초대한 사람과 가입한 사람이 같은 기기·회선이면 보류로 잡아 냅니다.
  add column if not exists referral_device_key text,
  add column if not exists referral_ip_hash text;

comment on column public.profiles.referral_code
  is '이 회원의 추천 코드. 6자리, 헷갈리는 0 O 1 I L 은 쓰지 않습니다';
comment on column public.profiles.referred_by
  is '이 회원을 데려온 사람. 탈퇴해도 관계는 남기되 가리킬 곳이 없어지면 비웁니다';
comment on column public.profiles.referral_visit_count
  is '내 링크로 들어온 사람 수(중복 제외). 화면에서 세지 않고 이 값만 읽습니다';

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code)
  where referral_code is not null;

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by)
  where referred_by is not null;

-- ── 2. 코드 발급 함수 ─────────────────────────────────────
--
-- ★ 0 O 1 I L 을 뺀 31글자만 씁니다.
--   손으로 옮겨 적을 때 0/O, 1/I/L 을 잘못 보는 일이 실제로 많습니다.
--   오프라인에서 코드를 불러 주는 경우까지 생각한 선택입니다.

create or replace function public.gen_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt integer := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;

    -- 이미 쓰는 코드면 다시 뽑습니다.
    exit when not exists (
      select 1 from public.profiles where referral_code = candidate
    );

    attempt := attempt + 1;
    -- 31^6 = 8억 가지라 부딪힐 일이 거의 없지만, 무한 반복은 막아 둡니다.
    if attempt > 50 then
      raise exception '추천 코드를 만들지 못했습니다. 코드 자리수를 늘려야 합니다';
    end if;
  end loop;

  return candidate;
end;
$$;

-- 새로 가입하는 회원에게 자동으로 코드를 붙입니다.
-- 앱이 깜빡해도 코드 없는 회원이 생기지 않습니다.
create or replace function public.set_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null or new.referral_code = '' then
    new.referral_code := public.gen_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_referral_code on public.profiles;

create trigger profiles_set_referral_code
  before insert on public.profiles
  for each row execute function public.set_referral_code();

-- ── 3. 방문 기록 ──────────────────────────────────────────
--
-- ★ 같은 사람이 링크를 열 번 눌러도 1명으로 셉니다.
--   (추천인, 방문자키) 를 유일하게 묶어 두면 두 번째 기록이 들어가지 않습니다.
--   숫자를 부풀리는 가장 쉬운 어뷰징을 DB 차원에서 막는 자리입니다.

create table if not exists public.referral_visits (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references public.profiles(id) on delete cascade,
  -- 브라우저에 심어 둔 방문자 식별값. 개인정보가 아닙니다.
  visitor_key  text not null,
  -- ★ IP 는 원본을 저장하지 않고 해시만 남깁니다. 개인정보를 덜 갖고 있기 위함입니다.
  ip_hash      text,
  user_agent   text,
  product_slug text,
  created_at   timestamptz not null default now()
);

create unique index if not exists referral_visits_unique
  on public.referral_visits (referrer_id, visitor_key);

create index if not exists referral_visits_referrer_idx
  on public.referral_visits (referrer_id, created_at desc);

create index if not exists referral_visits_created_idx
  on public.referral_visits (created_at desc);

comment on table public.referral_visits
  is '추천 링크 방문 기록. 같은 방문자는 1회만 남습니다';

-- ── 4. 추천 관계 (가입·구매 실적) ─────────────────────────

create table if not exists public.referral_links (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references public.profiles(id) on delete cascade,
  -- 한 사람은 한 명에게만 추천받습니다. (unique)
  invitee_id    uuid not null references public.profiles(id) on delete cascade,

  -- signed_up : 가입까지 / purchased : 첫 구매까지 마침
  status        text not null default 'signed_up',

  -- approved : 실적 인정 / held : 보류(관리자 확인 대기) / rejected : 거절
  -- ★ 같은 기기·IP 로 보이는 가입은 자동으로 held 로 들어갑니다.
  --   자동으로 잘라 내지 않는 이유는, 가족이 같은 공유기를 쓰는 정상적인 경우가
  --   실제로 흔하기 때문입니다. 판단은 사람이 합니다.
  review_state  text not null default 'approved',
  hold_reason   text,

  ip_hash       text,
  device_key    text,

  first_order_id uuid,
  purchased_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint referral_links_status_check
    check (status in ('signed_up', 'purchased')),
  constraint referral_links_review_check
    check (review_state in ('approved', 'held', 'rejected')),
  constraint referral_links_not_self
    check (referrer_id <> invitee_id)
);

create unique index if not exists referral_links_invitee_key
  on public.referral_links (invitee_id);

create index if not exists referral_links_referrer_idx
  on public.referral_links (referrer_id, created_at desc);

create index if not exists referral_links_review_idx
  on public.referral_links (review_state)
  where review_state = 'held';

comment on table public.referral_links
  is '누가 누구를 데려왔는지. 가입 실적과 첫 구매 실적을 함께 들고 있습니다';

-- ── 5. 사은품 ─────────────────────────────────────────────

create table if not exists public.referral_gifts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text not null default '',
  -- R2 에 올린 이미지 주소. 회원이 뭘 받는지 눈으로 보게 하는 것이 목적입니다.
  image_url     text not null default '',
  link_url      text not null default '',
  is_visible    boolean not null default true,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists referral_gifts_order_idx
  on public.referral_gifts (display_order, created_at);

-- ── 6. 목표 이벤트 ────────────────────────────────────────
--
-- ★ 기간은 날짜만 받습니다. (3-C 팝업과 같은 방식)
--   시각까지 받으면 관리자가 적은 시각이 UTC 로 해석돼 9시간 어긋납니다.
--   판정은 앱에서 한국시간 하루 경계로 계산합니다.

create table if not exists public.referral_goals (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,

  -- signup : 친구가 가입하면 / purchase : 친구가 첫 구매를 마치면
  criteria      text not null default 'purchase',
  target_count  integer not null default 5,

  -- point : 포인트 자동 지급 / gift : 사은품(관리자가 확인 후 발송)
  reward_type   text not null default 'point',
  reward_points integer not null default 0,
  gift_id       uuid references public.referral_gifts(id) on delete set null,

  starts_on     date,
  ends_on       date,

  -- 달성할 때마다 계속 줄지, 한 사람당 1회만 줄지
  is_repeatable boolean not null default false,
  is_active     boolean not null default true,

  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint referral_goals_criteria_check
    check (criteria in ('signup', 'purchase')),
  constraint referral_goals_reward_check
    check (reward_type in ('point', 'gift')),
  constraint referral_goals_target_check
    check (target_count >= 1),
  constraint referral_goals_period_check
    check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create index if not exists referral_goals_active_idx
  on public.referral_goals (is_active, display_order);

-- ── 7. 달성·지급 기록 ─────────────────────────────────────

create table if not exists public.referral_achievements (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references public.referral_goals(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,

  -- 몇 번째 달성인지. 반복 지급 목표에서 1회차·2회차를 가릅니다.
  round         integer not null default 1,
  -- 달성 시점의 실적 수 (3명 목표를 7명일 때 처리했다면 7)
  achieved_count integer not null default 0,

  -- 목표를 나중에 고쳐도 지급 당시 조건이 남아 있어야 다툼이 없습니다.
  reward_type   text not null,
  reward_points integer not null default 0,
  gift_id       uuid references public.referral_gifts(id) on delete set null,

  -- pending  : 처리 대기 (사은품 신규 · 지급 실패)
  -- paid     : 포인트 지급 완료
  -- preparing: 사은품 발송 준비 중
  -- shipped  : 사은품 발송 완료
  -- held     : 월 한도 초과 등으로 보류 (관리자 확인 필요)
  -- rejected : 관리자가 거절
  status        text not null default 'pending',
  hold_reason   text,

  -- 받는 분 정보. 마지막 배송지를 가져와 채우되 관리자가 고칠 수 있습니다.
  ship_name     text not null default '',
  ship_phone    text not null default '',
  ship_postcode text not null default '',
  ship_address1 text not null default '',
  ship_address2 text not null default '',
  courier       text not null default '',
  tracking_no   text not null default '',
  shipped_at    timestamptz,

  memo          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint referral_achievements_status_check
    check (status in ('pending', 'paid', 'preparing', 'shipped', 'held', 'rejected'))
);

-- ★ 같은 목표를 같은 회차로 두 번 지급하지 못하게 막습니다.
--   앱이 두 번 불려도(새로고침·동시 요청) 두 번째는 DB 가 막습니다.
create unique index if not exists referral_achievements_round_key
  on public.referral_achievements (goal_id, user_id, round);

create index if not exists referral_achievements_user_idx
  on public.referral_achievements (user_id, created_at desc);

create index if not exists referral_achievements_status_idx
  on public.referral_achievements (status, created_at desc);

comment on table public.referral_achievements
  is '목표 달성·보상 처리 기록. 포인트는 자동, 사은품은 관리자가 발송 처리합니다';

-- ── 8. 집계값 다시 계산 ───────────────────────────────────
--
-- ★ 화면은 profiles 의 숫자 세 개만 읽습니다.
--   그 숫자를 실제 기록에서 다시 세어 맞추는 함수입니다.
--   방문·가입·구매가 생길 때와, 취소·반품으로 실적을 되돌릴 때 부릅니다.
--   보류(held)·거절(rejected) 건은 실적에서 빼고 셉니다.

create or replace function public.refresh_referral_counts(p_user_id uuid)
returns void
language sql
as $$
  update public.profiles p
     set referral_visit_count = (
           select count(*) from public.referral_visits v
            where v.referrer_id = p.id
         ),
         referral_signup_count = (
           select count(*) from public.referral_links l
            where l.referrer_id = p.id
              and l.review_state = 'approved'
         ),
         referral_purchase_count = (
           select count(*) from public.referral_links l
            where l.referrer_id = p.id
              and l.review_state = 'approved'
              and l.status = 'purchased'
         )
   where p.id = p_user_id;
$$;

-- 전원 다시 계산 (관리자 화면에서 한 번씩 부르는 용도)
create or replace function public.refresh_all_referral_counts()
returns integer
language plpgsql
as $$
declare
  touched integer;
begin
  with counted as (
    select p.id,
           (select count(*) from public.referral_visits v where v.referrer_id = p.id) as visits,
           (select count(*) from public.referral_links l
             where l.referrer_id = p.id and l.review_state = 'approved') as signups,
           (select count(*) from public.referral_links l
             where l.referrer_id = p.id and l.review_state = 'approved'
               and l.status = 'purchased') as purchases
      from public.profiles p
  )
  update public.profiles p
     set referral_visit_count    = c.visits,
         referral_signup_count   = c.signups,
         referral_purchase_count = c.purchases
    from counted c
   where p.id = c.id
     and (p.referral_visit_count    is distinct from c.visits
       or p.referral_signup_count   is distinct from c.signups
       or p.referral_purchase_count is distinct from c.purchases);

  get diagnostics touched = row_count;
  return touched;
end;
$$;

-- ── 9. 기존 회원 일괄 발급 ────────────────────────────────
--
-- 트리거는 새로 들어오는 행에만 걸립니다. 이미 있는 회원은 여기서 채웁니다.
-- 코드가 이미 있는 회원은 건드리지 않으므로 여러 번 실행해도 안전합니다.

do $$
declare
  member record;
begin
  for member in
    select id from public.profiles
     where referral_code is null or referral_code = ''
  loop
    update public.profiles
       set referral_code = public.gen_referral_code()
     where id = member.id;
  end loop;
end;
$$;

-- ── 10. updated_at 자동 갱신 ──────────────────────────────
-- 앞선 단계에서 만들어 둔 공용 함수를 그대로 씁니다. 없으면 만듭니다.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists referral_links_touch on public.referral_links;
create trigger referral_links_touch
  before update on public.referral_links
  for each row execute function public.touch_updated_at();

drop trigger if exists referral_gifts_touch on public.referral_gifts;
create trigger referral_gifts_touch
  before update on public.referral_gifts
  for each row execute function public.touch_updated_at();

drop trigger if exists referral_goals_touch on public.referral_goals;
create trigger referral_goals_touch
  before update on public.referral_goals
  for each row execute function public.touch_updated_at();

drop trigger if exists referral_achievements_touch on public.referral_achievements;
create trigger referral_achievements_touch
  before update on public.referral_achievements
  for each row execute function public.touch_updated_at();

-- ── 확인 ──────────────────────────────────────────────────
-- select count(*) as 회원수,
--        count(referral_code) as 코드발급,
--        count(*) filter (where referral_code is null) as 미발급
--   from public.profiles;
--
-- select name, criteria, target_count, reward_type, is_active
--   from public.referral_goals order by display_order;
