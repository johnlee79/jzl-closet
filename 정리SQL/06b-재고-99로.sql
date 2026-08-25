-- ============================================================
-- 06b. 모든 옵션 조합의 재고를 99 로  (06 대신 이것을 쓰실 경우)
--
-- ★ 06 과 06b 중 하나만 돌리세요.
--
-- ⚠️ 알고 쓰셔야 합니다
--   99 는 주문이 들어올 때마다 줄어듭니다. 98, 97 … 그리고 0 이 되면
--   그 조합이 다시 막힙니다. 그때 또 이 SQL 을 돌려야 합니다.
--   "재고가 모자라 주문이 막히는 일이 없게" 하시려면 06 번(미관리)이 맞습니다.
--
--   그래도 숫자가 보이는 편이 낫다고 판단하시면 이걸 쓰세요.
--   그때는 가끔(예: 한 달에 한 번) 다시 돌려 99 로 채워 주셔야 합니다.
-- ============================================================

-- ── 돌리기 전에 몇 개가 바뀔지 ────────────────────────────
select count(*) as 바뀔조합수
  from public.products p
  cross join lateral jsonb_array_elements(
         case when jsonb_typeof(p.options->'combinations') = 'array'
              then p.options->'combinations' else '[]'::jsonb end) as c;

begin;

update public.products p
   set options = jsonb_set(
         p.options,
         '{combinations}',
         (select coalesce(jsonb_agg(elem || '{"stock": 99}'::jsonb), '[]'::jsonb)
            from jsonb_array_elements(p.options->'combinations') as elem)
       ),
       updated_at = now()
 where jsonb_typeof(p.options) = 'object'
   and jsonb_typeof(p.options->'combinations') = 'array'
   and jsonb_array_length(p.options->'combinations') > 0;

commit;

-- ── 확인 — 전부 99 여야 합니다 ────────────────────────────
-- select distinct c->>'stock' as 재고값
--   from public.products p
--   cross join lateral jsonb_array_elements(
--          case when jsonb_typeof(p.options->'combinations') = 'array'
--               then p.options->'combinations' else '[]'::jsonb end) as c;
