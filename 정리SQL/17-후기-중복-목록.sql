-- ============================================================
-- 17. 이미 들어간 후기 중복 — 목록 (2026-11-03)
-- ============================================================
--
-- ★ 기준 (코드와 같음, lib/review-dedup.ts):
--   같은 상품 + 같은 작성자 + 같은 날짜(한국 시간) + 같은 글 (글자·숫자만 남겨 비교 — 이모지·공백·문장부호 무시)
-- ★ [1] 은 읽기만입니다. [2] [3] 은 주석으로 막아 두었습니다. 보시고 정하세요.
-- ★ 2026-11-03 조회: 8쌍 (스투시 베이직 후드티 7쌍 · 아미 옥스포드 셔츠 1쌍). 전부 뉴욕트렌딕 · 5점 · 사진 없음.
--   7쌍은 번호가 바로 이웃이고 같은 분(3분 이내) 에 쓰인 것 → 뉴욕트렌딕 쪽에서 두 번 올라간 것으로 보입니다.
--   ★ #10917 / #10890 (김**** 10-14) 한 쌍만 19시간 떨어져 있습니다. 「만족해요. 꽤 좋은 선택이었던 것 같아요」
--     는 뉴욕트렌딕이 손님에게 골라 쓰게 주는 문장이라, 같은 성(김)의 다른 손님일 수도 있습니다.
-- ============================================================

-- [1] 목록 — 읽기만. 묶음마다 먼저 저장된 줄이 「남김」, 나머지가 「중복」
with r as (
  select id, product_id, product_slug, writer_name, rating, is_visible, source, source_review_id,
         coalesce(written_at, created_at) as ts, created_at,
         jsonb_array_length(coalesce(attachments, '[]'::jsonb)) as photos,
         content,
         regexp_replace(lower(content), '[^[:alnum:]가-힣]', '', 'g') as norm
    from public.reviews
), g as (
  select r.*,
         (ts at time zone 'Asia/Seoul')::date as day_kst,
         row_number() over (partition by product_id, replace(writer_name, ' ', ''),
                                         (ts at time zone 'Asia/Seoul')::date, norm
                            order by created_at, id) as n,
         count(*)     over (partition by product_id, replace(writer_name, ' ', ''),
                                         (ts at time zone 'Asia/Seoul')::date, norm) as cnt
    from r
   where norm <> ''
)
select product_slug, writer_name, day_kst,
       case when n = 1 then '남김' else '중복' end as 구분,
       source, source_review_id, to_char(ts at time zone 'Asia/Seoul', 'HH24:MI') as 시각,
       rating, photos, is_visible, id, left(content, 40) as 글
  from g
 where cnt > 1
 order by product_slug, day_kst, writer_name, n;
-- ★ SQL 의 [:alnum:] 과 코드의 \p{L}\p{N} 은 아주 드문 글자에서 다를 수 있습니다. 결과는 위 8쌍과 같아야 합니다.


-- [2] (정하신 뒤에만) 중복 쪽을 숨기기 — 지우지 않고 손님 화면에서만 뺍니다. 되돌리기 쉽습니다.
-- update public.reviews set is_visible = false
--  where id in (
--    '4e91a551-0e19-4891-9c8a-a54584ea8122',  -- #10231 (= #10232)
--    '7ce2af69-44f7-452c-9bb8-5eea2c9e8c3b',  -- #9153  (= #9154)
--    '693eb7f2-f9f8-4ce2-b2e1-c1cb64b50321',  -- #6167  (= #6168)
--    '0b52e0d2-e32f-4444-bebb-875224b046df',  -- #10693 (= #10694)
--    '33067081-b49a-4738-9ab3-dab855a4b06a',  -- #11287 (= #11288)
--    'c1dc269c-54ec-43b8-87df-83b12c1c0b55',  -- #11177 (= #11178)
--    'aeed9375-8355-424d-a7d0-8ba5ded28eba'   -- #3398  (= #3399)
--    -- '81589c68-2dc9-4747-9cd0-1ff6b6d53e16', -- #10890 (= #10917) ← 19시간 차이, 다른 손님일 수 있음
--  )
-- returning source_review_id;

-- [3] (정하신 뒤에만) 아예 지우기 — 되돌릴 수 없습니다. [2] 의 id 목록 그대로.
-- delete from public.reviews where id in ( ... ) returning source_review_id;
