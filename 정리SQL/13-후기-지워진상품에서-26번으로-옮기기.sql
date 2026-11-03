-- ============================================================
-- 13. 지워진 상품에 붙은 뉴욕트렌딕 후기 → 26번 상품으로 옮기기 (2026-11-03)
-- ============================================================
--
-- ★ 무엇
--   2026-10-05 에 등록됐다가 지워진 상품 stussy-hoodie
--   (id d2bab5fb-cbba-4d05-a153-114d449c4c46, 뉴욕트렌딕 26번) 에
--   후기 25건이 남아 있습니다. 손님 화면 어디에도 안 보입니다.
--   지금 살아 있는 뉴욕트렌딕 26번 상품
--   stussy-beige-logo-hoodie (id 279be0a4-d6de-4e5e-907a-1742e25e6a6e) 으로 옮깁니다.
--
-- ★ 몇 건이 나와야 하나
--   · 상품 수정 화면에서 #10617 을 「다시 가져오기」 하지 않았으면 25건
--   · 했으면 24건
--   (원본 페이지 3건을 열어 26번 후기인 것을 확인했습니다: #9153 #10617 #5975)
--
-- ★ 순서: [1] 확인 → 숫자 맞으면 [2] 옮기기 → [3] 확인
--   [2] 는 begin/commit 으로 묶었습니다. 숫자가 이상하면 commit 대신 rollback.
--
-- ★ 되돌리기: [2] 의 반대로 product_id 를 d2bab5fb… 로 돌리면 됩니다
--   (지워진 상품 id 라 손님 화면에서 다시 사라질 뿐, 데이터는 그대로).
-- ============================================================


-- [1] 확인 — 읽기만. 어디서 어디로 몇 건 가는지 ---------------------
select
  r.product_id                      as 지금_붙은_상품id,
  r.product_slug                    as 지금_slug,
  exists (select 1 from public.products p where p.id = r.product_id) as 지금_상품_있음,
  '279be0a4-d6de-4e5e-907a-1742e25e6a6e'::uuid as 옮길_상품id,
  (select slug from public.products where id = '279be0a4-d6de-4e5e-907a-1742e25e6a6e') as 옮길_slug,
  (select source_product_no from public.products where id = '279be0a4-d6de-4e5e-907a-1742e25e6a6e') as 옮길_뉴욕번호,
  count(*)                          as 건수,
  count(*) filter (where r.is_visible) as 그중_노출,
  string_agg(r.source_review_id, ',' order by r.source_review_id::int) as 후기번호
from public.reviews r
where r.product_id = 'd2bab5fb-cbba-4d05-a153-114d449c4c46'
  and r.source = 'newyorktrd'
group by r.product_id, r.product_slug;
-- 기대: 지금_상품_있음 = false · 옮길_slug = stussy-beige-logo-hoodie · 옮길_뉴욕번호 = 26 · 건수 24 또는 25

-- 옮긴 뒤 26번 상품의 외부 후기가 몇 건이 될지
select
  (select count(*) from public.reviews where product_id = '279be0a4-d6de-4e5e-907a-1742e25e6a6e' and source = 'newyorktrd') as 지금_26번_후기,
  (select count(*) from public.reviews where product_id = 'd2bab5fb-cbba-4d05-a153-114d449c4c46' and source = 'newyorktrd') as 더해질_후기;


-- [2] 옮기기 -------------------------------------------------------
begin;

update public.reviews
   set product_id   = '279be0a4-d6de-4e5e-907a-1742e25e6a6e',
       product_slug = 'stussy-beige-logo-hoodie'
 where product_id = 'd2bab5fb-cbba-4d05-a153-114d449c4c46'
   and source = 'newyorktrd'
   -- 안전장치: 원래 상품이 정말 지워져 있고, 옮길 상품이 정말 뉴욕 26번일 때만
   and not exists (select 1 from public.products where id = 'd2bab5fb-cbba-4d05-a153-114d449c4c46')
   and exists (
     select 1 from public.products
      where id = '279be0a4-d6de-4e5e-907a-1742e25e6a6e'
        and source = 'newyorktrd'
        and source_product_no = 26
   )
returning source_review_id;
-- ↑ 돌아온 줄 수가 [1] 의 건수와 같으면 commit, 다르면 rollback;

commit;


-- [3] 확인 — 읽기만 -------------------------------------------------
select
  (select count(*) from public.reviews where product_id = 'd2bab5fb-cbba-4d05-a153-114d449c4c46') as 지워진상품에_남은_후기,  -- 0 이어야 함
  (select count(*) from public.reviews where product_id = '279be0a4-d6de-4e5e-907a-1742e25e6a6e' and source = 'newyorktrd' and is_visible) as 26번_노출_외부후기;

-- ★ 손님 상품 페이지는 30초 안에 저절로 새로 그려집니다 (revalidate = 30).
--   바로 보고 싶으면 관리자에서 26번 상품을 한 번 저장하세요.
