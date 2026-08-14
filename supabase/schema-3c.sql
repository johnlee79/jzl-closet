-- ============================================================
-- JZL CLOSET — 3단계-C 스키마
-- (팝업 기간 날짜화 · 입금대기 자동취소)
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
--   8) supabase/schema-3b.sql   (3-B · 가입경로 · 포인트 유효기간)
--   9) supabase/schema-3c.sql   ← 지금 이 파일
--  10) supabase/rls-2a.sql · rls-2b.sql · rls-3a.sql · rls-3b.sql
--  11) supabase/rls-3c.sql     (반드시 마지막)
--
-- 이 파일이 하는 일
--   · 팝업 노출 기간을 날짜 단위로 정리합니다 (한국시간 00:00:00 ~ 23:59:59)
--   · 주문에 '자동취소 제외' 칸을 만듭니다
--   · 자동취소 대상을 빨리 찾기 위한 인덱스를 만듭니다
-- ============================================================

-- ── 1. 팝업 노출 기간 — 날짜 단위로 정리 ──────────────────
--
-- ★ 왜 필요한가
--   예전에는 관리자가 넣은 'YYYY-MM-DDTHH:mm' 을 앱이 그대로 new Date() 로 읽었습니다.
--   Vercel 서버는 UTC 라 한국시간으로 의도한 값이 9시간 밀렸습니다.
--   "오늘부터" 로 걸어 둔 팝업이 한국시간 오전 9시가 지나야 뜨는 식이었습니다.
--
--   이제 앱은 날짜만 받아 시작일 00:00:00(KST) · 종료일 23:59:59(KST) 로 저장합니다.
--   이미 저장된 값도 같은 규칙으로 맞춰 둡니다.
do $$
begin
  if to_regclass('public.popups') is null then
    raise notice 'popups 테이블이 없습니다. schema-3a.sql 을 먼저 실행하세요.';
    return;
  end if;

  -- 시작 시각 → 그날(한국시간) 0시
  update public.popups
     set starts_at = ((starts_at at time zone 'Asia/Seoul')::date::text || ' 00:00:00')
                       ::timestamp at time zone 'Asia/Seoul'
   where starts_at is not null
     and starts_at <> ((starts_at at time zone 'Asia/Seoul')::date::text || ' 00:00:00')
                        ::timestamp at time zone 'Asia/Seoul';

  -- 종료 시각 → 그날(한국시간) 23:59:59.999
  update public.popups
     set ends_at = ((ends_at at time zone 'Asia/Seoul')::date::text || ' 23:59:59.999')
                     ::timestamp at time zone 'Asia/Seoul'
   where ends_at is not null
     and ends_at <> ((ends_at at time zone 'Asia/Seoul')::date::text || ' 23:59:59.999')
                      ::timestamp at time zone 'Asia/Seoul';
end $$;

comment on column public.popups.starts_at is '노출 시작 — 그날 한국시간 0시. 비우면 제한 없음';
comment on column public.popups.ends_at   is '노출 종료 — 그날 한국시간 23:59:59. 비우면 무기한';

-- ── 2. 입금대기 자동취소 ──────────────────────────────────
--
-- ★ JZL CLOSET 은 위탁배송 구조입니다.
--   공급처에 이미 발송 요청이 나간 건을 자동으로 취소하면 배송 사고가 납니다.
--   그래서 관리자가 이 칸을 켜 둔 주문은 기한이 지나도 건드리지 않습니다.
--   (송장번호가 들어간 주문도 앱에서 자동으로 제외합니다)
alter table public.orders
  add column if not exists auto_cancel_excluded boolean default false;

comment on column public.orders.auto_cancel_excluded
  is '켜 두면 입금 기한이 지나도 자동취소하지 않습니다. 공급처에 발송 요청이 나간 주문에 씁니다';

-- 자동취소 대상(입금대기 + 오래된 주문)을 빨리 찾기 위한 인덱스
create index if not exists orders_pending_created_idx
  on public.orders (created_at)
  where status = 'pending_payment';

-- ── 확인 ──────────────────────────────────────────────────
-- 팝업 기간이 날짜 경계로 맞춰졌는지 (한국시간으로 보기)
-- select title,
--        starts_at at time zone 'Asia/Seoul' as 시작,
--        ends_at   at time zone 'Asia/Seoul' as 종료,
--        is_visible, show_on
--   from public.popups order by display_order;
--
-- 자동취소 대상 미리보기 (24시간 기준, 실제로 취소하지는 않습니다)
-- select order_no, created_at at time zone 'Asia/Seoul' as 주문일시,
--        tracking_no, auto_cancel_excluded
--   from public.orders
--  where status = 'pending_payment'
--    and created_at < now() - interval '24 hours'
--  order by created_at;
