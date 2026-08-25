-- ============================================================
-- 03. 주문과 손님이 만든 데이터 삭제
--
-- ❌ 되돌릴 수 없습니다. 백업을 먼저 받으세요.
-- ★ 04(계정 삭제)보다 반드시 먼저 돌리세요.
--
-- ★★ 재고에 대하여
--   주문을 지워도 재고는 돌아오지 않습니다. 재고를 되돌리는 것은 DB 가 아니라
--   코드(releaseOrderStock)이기 때문입니다.
--   다만 06 번에서 모든 재고를 미관리(또는 99)로 덮어쓰므로, 이번 정리에서는
--   재고가 얼마로 남든 상관이 없습니다. 06 번을 반드시 돌리세요.
-- ============================================================

begin;

-- ── ① 포인트 ──────────────────────────────────────────────
-- 내역을 전부 지우고 잔액도 0 으로 맞춥니다.
-- ★ 남기는 두 계정도 0 으로 만듭니다. (요청하신 대로)
-- ★ point_transactions.ref_id 는 외래키가 아니라, 주문을 지워도 남습니다.
--   그래서 여기서 직접 지웁니다.
delete from public.point_transactions;
update public.profiles set point_balance = 0 where point_balance <> 0;

-- ── ② 리뷰 ────────────────────────────────────────────────
delete from public.reviews;

-- ── ③ 1:1 문의 ────────────────────────────────────────────
delete from public.inquiries;
delete from public.inquiry_no_seq;      -- 문의번호도 처음부터

-- ── ④ 추천 실적 ───────────────────────────────────────────
-- ★ referral_goals(목표)와 referral_gifts(선물)는 관리자가 만든 설정이라 남깁니다.
--   지우면 관리자 화면에서 다시 만들어야 합니다.
delete from public.referral_achievements;
delete from public.referral_visits;
delete from public.referral_links;

-- ── ⑤ 재고 이동 기록 ──────────────────────────────────────
delete from public.stock_moves;

-- ── ⑥ 주문 ────────────────────────────────────────────────
-- ★ order_items 와 order_status_history 는 cascade 로 함께 지워집니다.
--   따로 지울 필요가 없습니다.
delete from public.orders;

-- ── ⑦ 결제 기록 ───────────────────────────────────────────
-- ★★ 기본은 "남기기" 입니다. 아래 줄이 -- 으로 막혀 있습니다.
--
--   payment_logs 에는 실제로 1,000원이 오간 기록이 들어 있습니다.
--   주문을 지워도 order_no 가 글자로 남아 나중에 되짚을 수 있습니다.
--   KSNET 쪽에는 그 거래가 그대로 남아 있으므로, 우리 쪽 기록만 없애면
--   나중에 "이 돈이 왜 나갔지" 를 확인할 방법이 사라집니다.
--
--   그래도 지우시겠다면 아래 줄 맨 앞의 -- 두 개를 지우세요.
-- delete from public.payment_logs;

commit;

-- ── 확인 ──────────────────────────────────────────────────
-- select count(*) from public.orders;              -- 0 이어야 합니다
-- select count(*) from public.point_transactions;  -- 0
-- select count(*) from public.payment_logs;        -- 남겼다면 그대로
