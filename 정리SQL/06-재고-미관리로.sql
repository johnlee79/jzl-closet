-- ============================================================
-- 06. 모든 옵션 조합의 재고를 "미관리" 로  ⭐ 권장
--
-- ★ 06 과 06b 중 하나만 돌리세요.
-- ★ 되돌릴 수 있습니다. (관리자 화면에서 숫자를 다시 넣으면 됩니다)
--
-- ★★ 왜 99 가 아니라 미관리(null)인가
--   stock 이 숫자면 주문마다 줄어듭니다. 99 도 언젠가 0 이 되고,
--   0 이 되면 그 조합이 다시 막힙니다. 늦춘 것일 뿐 없앤 것이 아닙니다.
--
--   stock 이 null 이면 apply_stock_changes 가 그 조합을 아예 건드리지
--   않고 지나갑니다. (schema-4c.sql — "재고를 관리하지 않는 조합입니다")
--   재고 때문에 주문이 막히는 일이 구조적으로 사라집니다.
--
--   관리자에서 새 옵션을 만들 때의 기본값(defaultCombination)도 null 입니다.
--   즉 이것이 원래 정해진 "재고를 안 쓰는" 방식입니다.
--   관리자 화면에도 빈칸에 "미관리" 라고 안내가 나옵니다.
--
-- ★ 품절은 이제 두 가지로만 정합니다.
--     · 조합별 품절 — 관리자 옵션 표에서 [판매중] 끄기 (isActive=false)
--     · 상품 전체   — 관리자 상품 화면에서 [품절] 체크 (is_sold_out=true)
-- ============================================================

-- ── 돌리기 전에 몇 개가 바뀔지 ────────────────────────────
select count(*) as 바뀔조합수
  from public.products p
  cross join lateral jsonb_array_elements(
         case when jsonb_typeof(p.options->'combinations') = 'array'
              then p.options->'combinations' else '[]'::jsonb end) as c
 where jsonb_typeof(c->'stock') = 'number';

begin;

update public.products p
   set options = jsonb_set(
         p.options,
         '{combinations}',
         (select coalesce(jsonb_agg(elem || '{"stock": null}'::jsonb), '[]'::jsonb)
            from jsonb_array_elements(p.options->'combinations') as elem)
       ),
       updated_at = now()
 where jsonb_typeof(p.options) = 'object'
   and jsonb_typeof(p.options->'combinations') = 'array'
   and jsonb_array_length(p.options->'combinations') > 0;

commit;

-- ── 확인 — 숫자로관리 가 0 이어야 합니다 ──────────────────
-- select count(*) filter (where jsonb_typeof(c->'stock') = 'number')  as 숫자로관리,
--        count(*) filter (where jsonb_typeof(c->'stock') <> 'number') as 미관리
--   from public.products p
--   cross join lateral jsonb_array_elements(
--          case when jsonb_typeof(p.options->'combinations') = 'array'
--               then p.options->'combinations' else '[]'::jsonb end) as c;
