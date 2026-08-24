-- ============================================================
-- JZL CLOSET 4단계-C — 재고를 DB 안에서 한 번에 처리합니다
-- ============================================================
--
-- ★★ 무엇을 고치는가
--   재고는 products.options 라는 JSON 칸 하나에 들어 있습니다.
--   지금까지는 앱이 이렇게 했습니다.
--     ① 상품을 통째로 읽는다   → 재고 5
--     ② 코드 안에서 뺀다       → 5 − 3 = 2
--     ③ 통째로 다시 쓴다       → 2
--   두 주문이 동시에 ①을 하면 둘 다 5를 읽습니다. 각자 2를 계산하고
--   각자 2를 씁니다. 나중에 쓴 쪽이 이깁니다. 3개가 사라집니다.
--
--   포인트는 이 문제가 없습니다. apply_point_change() 가 행을 잠그고
--   읽기·계산·쓰기를 한 트랜잭션에서 끝냅니다.
--   재고에도 같은 것을 둡니다.
--
-- ★★ 이 파일은 데이터를 건드리지 않습니다
--   함수 하나를 만들 뿐입니다. 테이블·컬럼 변경 없음, UPDATE 없음, ALTER 없음.
--   기존 재고 값은 그대로입니다. 여러 번 실행해도 안전합니다.
--
-- ── 실행 순서 ──────────────────────────────────────────────
--   앞선 파일들을 이미 실행하셨다면 이 파일 하나만 돌리시면 됩니다.
--     1) supabase/schema.sql
--     2) supabase/schema-2a.sql   (주문)
--     3) supabase/schema-2b.sql   (회원)
--     4) supabase/schema-3a.sql   (포인트 — apply_point_change 가 여기 있습니다)
--     5) supabase/schema-3b.sql   (포인트 유효기간)
--     6) supabase/schema-3f.sql   (추천)
--     7) supabase/schema-4a.sql   (KSNET 카드결제)
--     8) supabase/schema-4b.sql   (미결제 정리 · stock_moves)
--     9) supabase/schema-4c.sql   ← 이 파일
--
--   ★ 이 파일을 먼저 실행한 뒤에 코드를 배포하세요.
--     코드를 먼저 배포하면 함수가 없어 주문이 실패합니다.
--     반대 순서(SQL 먼저)는 안전합니다. 예전 코드는 이 함수를 부르지 않습니다.
-- ============================================================


-- ── 재고 변경 ──────────────────────────────────────────────
--
-- 인자
--   p_lines       [{"product_id":"…","option_key":"블랙/S","quantity":2}, …]
--                 ★ 주문 한 건을 통째로 넘깁니다. 상품마다 따로 부르지 마세요.
--                   따로 부르면 세 번째에서 실패해도 앞의 둘은 이미 커밋됩니다.
--                   한 번에 넘겨야 하나라도 모자랄 때 전부 되돌아갑니다.
--   p_delta       -1 차감(주문) · 1 되돌림(취소·반품·결제실패)
--   p_allow_short 재고가 모자랄 때
--                   false — 예외를 던져 전부 되돌립니다 (주문 접수)
--                   true  — 0 에서 멈추고 부족분을 알려 줍니다
--                           ([결제완료로 확정] 전용. 이미 승인된 돈이라
--                            주문을 되돌릴 수 없어 막지 않습니다)
--
-- 돌려주는 값 — 줄마다 하나씩
--   [{"product_id":…, "option_key":…, "quantity":…,
--     "status":"ok|short|unmanaged|missing",
--     "stock_before":5, "stock_after":2}]
--
--   ok        재고를 고쳤습니다
--   short     모자랐지만 0 에서 멈추고 진행했습니다 (p_allow_short = true 일 때만)
--   unmanaged 재고를 관리하지 않는 조합입니다. 건드리지 않았습니다
--   missing   상품을 찾지 못했습니다
--
-- ★ 옛 형식(options 가 배열)으로 저장된 상품은 unmanaged 로 지나갑니다.
--   그 형식에는 combinations 자체가 없어 재고를 관리한 적이 없습니다.
--   앱도 지금까지 같은 판단을 해 왔습니다. 동작이 바뀌지 않습니다.
create or replace function public.apply_stock_changes(
  p_lines       jsonb,
  p_delta       integer,
  p_allow_short boolean default false
)
returns jsonb as $$
declare
  v_ids      uuid[];
  v_id       uuid;
  v_line     jsonb;
  v_product  uuid;
  v_key      text;
  v_qty      integer;
  v_options  jsonb;
  v_name     text;
  v_idx      integer;
  v_elem     jsonb;
  v_before   integer;
  v_after    integer;
  v_status   text;
  v_short    text[] := '{}';
  v_result   jsonb := '[]'::jsonb;
begin
  if p_delta <> 1 and p_delta <> -1 then
    raise exception '재고 방향은 1(되돌림) 또는 -1(차감) 이어야 합니다: %', p_delta;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return v_result;
  end if;

  -- ── ① 필요한 상품을 id 순서로 하나씩 잠급니다 ─────────────
  --
  -- ★★ 순서를 고정하는 것이 중요합니다.
  --   주문 A 가 상품1 → 상품2 순으로 잠그고, 주문 B 가 상품2 → 상품1 순으로
  --   잠그면 서로를 기다려 교착(deadlock)이 납니다.
  --   언제나 id 오름차순으로 잠그면 그런 일이 생기지 않습니다.
  select array_agg(distinct (l->>'product_id')::uuid)
    into v_ids
    from jsonb_array_elements(p_lines) as l
   where l->>'product_id' is not null
     and coalesce(l->>'option_key', '') <> ''
     and coalesce((l->>'quantity')::integer, 0) > 0;

  if v_ids is null then
    return v_result;
  end if;

  for v_id in select unnest(v_ids) order by 1
  loop
    perform 1 from public.products where id = v_id for update;
  end loop;

  -- ── ② 먼저 전부 확인만 합니다 (아직 쓰지 않습니다) ─────────
  --
  -- ★ 모자란 것이 여러 개면 한 번에 다 알려 주기 위해서입니다.
  --   첫 번째에서 바로 예외를 던지면 손님이 하나씩 고치며 여러 번 막힙니다.
  if p_delta = -1 and not p_allow_short then
    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      v_product := (v_line->>'product_id')::uuid;
      v_key     := v_line->>'option_key';
      v_qty     := coalesce((v_line->>'quantity')::integer, 0);

      if v_product is null or coalesce(v_key, '') = '' or v_qty <= 0 then
        continue;
      end if;

      select options, name into v_options, v_name
        from public.products where id = v_product;

      if not found
         or v_options is null
         or jsonb_typeof(v_options) <> 'object'
         or jsonb_typeof(v_options->'combinations') <> 'array' then
        continue;   -- 없는 상품이거나 재고를 관리하지 않는 형식입니다
      end if;

      select elem into v_elem
        from jsonb_array_elements(v_options->'combinations') as elem
       where elem->>'key' = v_key
       limit 1;

      if v_elem is null or jsonb_typeof(v_elem->'stock') <> 'number' then
        continue;   -- 재고를 관리하지 않는 조합입니다
      end if;

      v_before := (v_elem->>'stock')::integer;

      if v_before < v_qty then
        v_short := v_short || format(
          '%s (%s) — 재고가 %s개 남았습니다',
          coalesce(v_name, '상품'), v_key, v_before
        );
      end if;
    end loop;

    if array_length(v_short, 1) is not null then
      -- ★ 여기서 던지면 이 트랜잭션에서 한 일이 전부 되돌아갑니다.
      raise exception '재고가 모자랍니다|%', array_to_string(v_short, '|');
    end if;
  end if;

  -- ── ③ 실제로 고칩니다 ─────────────────────────────────────
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product := (v_line->>'product_id')::uuid;
    v_key     := v_line->>'option_key';
    v_qty     := coalesce((v_line->>'quantity')::integer, 0);

    if v_product is null or coalesce(v_key, '') = '' or v_qty <= 0 then
      continue;
    end if;

    -- ★ 줄마다 다시 읽습니다. 같은 상품의 다른 옵션이 앞줄에서 바뀌었을 수 있습니다.
    select options into v_options
      from public.products where id = v_product;

    if not found then
      v_result := v_result || jsonb_build_object(
        'product_id', v_product, 'option_key', v_key, 'quantity', v_qty,
        'status', 'missing', 'stock_before', null, 'stock_after', null
      );
      continue;
    end if;

    if v_options is null
       or jsonb_typeof(v_options) <> 'object'
       or jsonb_typeof(v_options->'combinations') <> 'array' then
      v_result := v_result || jsonb_build_object(
        'product_id', v_product, 'option_key', v_key, 'quantity', v_qty,
        'status', 'unmanaged', 'stock_before', null, 'stock_after', null
      );
      continue;
    end if;

    select (t.idx - 1), t.elem into v_idx, v_elem
      from jsonb_array_elements(v_options->'combinations')
           with ordinality as t(elem, idx)
     where t.elem->>'key' = v_key
     limit 1;

    if v_idx is null or jsonb_typeof(v_elem->'stock') <> 'number' then
      v_result := v_result || jsonb_build_object(
        'product_id', v_product, 'option_key', v_key, 'quantity', v_qty,
        'status', 'unmanaged', 'stock_before', null, 'stock_after', null
      );
      continue;
    end if;

    v_before := (v_elem->>'stock')::integer;
    v_status := 'ok';

    if p_delta = -1 then
      if v_before < v_qty then
        /*
         * ★ 여기까지 왔다면 보통 p_allow_short = true 입니다.
         *   (false 였다면 위 ②에서 이미 예외가 났습니다)
         * ★ 그래도 한 번 더 막습니다. 같은 상품·같은 옵션이 두 줄로 들어오면
         *   ② 는 같은 재고를 두 번 보고 통과시킵니다. 그 경우 여기서 잡힙니다.
         *   조용히 0 으로 깎으면 없는 물건을 판 것이 됩니다.
         */
        if not p_allow_short then
          raise exception '재고가 모자랍니다|% — 재고가 %개 남았습니다', v_key, v_before;
        end if;
        v_after  := 0;
        v_status := 'short';
      else
        v_after := v_before - v_qty;
      end if;
    else
      v_after := v_before + v_qty;
    end if;

    -- ★★ stock 하나만 콕 집어 고칩니다.
    --   JSON 전체를 덮어쓰지 않습니다. 옵션 이름·추가금액·판매 여부는
    --   손대지 않으므로, 이 함수 때문에 값이 사라질 수 없습니다.
    --   (updated_at 은 products_set_updated_at 트리거가 알아서 갱신합니다)
    update public.products
       set options = jsonb_set(options,
                               array['combinations', v_idx::text, 'stock'],
                               to_jsonb(v_after))
     where id = v_product;

    v_result := v_result || jsonb_build_object(
      'product_id', v_product, 'option_key', v_key, 'quantity', v_qty,
      'status', v_status, 'stock_before', v_before, 'stock_after', v_after
    );
  end loop;

  return v_result;
end;
$$ language plpgsql;

comment on function public.apply_stock_changes(jsonb, integer, boolean) is
  '재고를 한 트랜잭션에서 잠그고 바꿉니다. 모자라면 예외를 던져 주문 전체를 되돌립니다';


-- ── 권한 ───────────────────────────────────────────────────
--
-- ★ 브라우저에서 직접 부를 수 없어야 합니다.
--   재고를 마음대로 늘리거나 줄일 수 있는 함수입니다.
--   기존 함수들(apply_point_change 등)과 같은 기준으로 잠급니다.
do $$
declare
  signature text;
begin
  select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    into signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname = 'apply_stock_changes'
   limit 1;

  if signature is null then
    raise exception 'apply_stock_changes 함수를 찾지 못했습니다. 위 create 가 실패했는지 확인해 주세요.';
  end if;

  execute format('revoke all on function %s from public, anon, authenticated', signature);
  execute format('grant execute on function %s to service_role', signature);

  raise notice '서버 전용으로 잠금: %', signature;
end $$;


-- ── 확인용 ─────────────────────────────────────────────────
--
-- ① 함수가 만들어졌는지 · 브라우저에서 못 부르는지
--    (anon_can_run 이 false 여야 합니다)
--
-- select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
--        has_function_privilege('anon',         p.oid, 'execute') as anon_can_run,
--        has_function_privilege('service_role', p.oid, 'execute') as server_can_run
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'apply_stock_changes';
--
--
-- ② 재고가 그대로인지 (실행 전후로 같은 값이 나와야 합니다)
--
-- select p.name,
--        c.elem->>'key'   as option_key,
--        c.elem->>'stock' as stock
--   from public.products p,
--        lateral jsonb_array_elements(p.options->'combinations') as c(elem)
--  where jsonb_typeof(p.options) = 'object'
--    and jsonb_typeof(p.options->'combinations') = 'array'
--    and jsonb_typeof(c.elem->'stock') = 'number'
--  order by p.name, option_key
--  limit 50;
--
--
-- ③ 시험해 보고 싶으시면 (되돌아가므로 안전합니다)
--    ★ begin / rollback 으로 감싸면 실제로는 바뀌지 않습니다.
--
-- begin;
--   select public.apply_stock_changes(
--     '[{"product_id":"여기에-상품-id","option_key":"블랙/S","quantity":1}]'::jsonb,
--     -1,
--     false
--   );
-- rollback;
