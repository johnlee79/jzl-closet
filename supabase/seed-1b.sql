-- ============================================================
-- JZL CLOSET — 1단계-B 시드 데이터
-- 기존 lib/categories.ts · lib/brands.ts 의 값을 그대로 옮깁니다.
--
-- supabase/schema-1b.sql 을 먼저 실행한 뒤 이 파일을 실행하세요.
-- 여러 번 실행해도 안전합니다 (on conflict do nothing).
-- ★ 이미 관리자에서 고친 내용은 덮어쓰지 않습니다.
-- ============================================================

-- ── 대분류 ────────────────────────────────────────────────
insert into public.categories (slug, label, name_ko, parent_slug, display_order, is_visible, description) values
  ('all',         'ALL',         '전체',       null, 10, true,  '지금 소개하고 있는 모든 상품입니다. 카테고리와 브랜드, 가격 순으로 좁혀 보실 수 있습니다.'),
  ('clothing',    'CLOTHING',    '의류',       null, 20, true,  '매일 입어도 부담이 없는 옷을 고릅니다. 실측 치수를 모두 표기하니 평소 입는 옷과 비교해 보고 고르세요.'),
  ('bags',        'BAGS',        '가방·지갑',  null, 30, true,  '하루치 짐이 자연스럽게 들어가는 크기와, 어깨에서 흘러내리지 않는 끈. 매일 드는 가방의 기준을 그 두 가지에 두었습니다.'),
  ('shoes',       'SHOES',       '슈즈',       null, 40, true,  '하루 종일 신고 걸어도 발이 아프지 않은지를 먼저 봅니다. 굽 높이와 발볼 여유를 상세 페이지에 적어 두었습니다.'),
  ('accessories', 'ACCESSORIES', '액세서리',   null, 50, true,  '가까이서 보면 보이고 멀리서 보면 옷을 방해하지 않는 크기. 하루 종일 착용해도 부담이 없는 무게로 골랐습니다.'),
  ('sale',        'SALE',        '세일',       null, 60, true,  '가격을 조정한 상품입니다. 수량이 한정되어 있어 사이즈와 색상이 먼저 마감될 수 있습니다.'),
  ('brand',       'BRAND',       '브랜드',     null, 70, false, 'JZL CLOSET이 소개하는 브랜드입니다. 브랜드별 소개와 상품은 /brand 에서 계속 보실 수 있습니다.'),
  ('beauty',      'BEAUTY',      '뷰티',       null, 80, false, '향과 피부에 관한 물건입니다. 준비가 끝나는 대로 공개합니다.')
on conflict (slug) do nothing;

-- ── 소분류 ────────────────────────────────────────────────
insert into public.categories (slug, label, name_ko, parent_slug, display_order, is_visible, description) values
  -- 의류
  ('outer',    'OUTER',      '아우터',      'clothing', 10, true, null),
  ('top',      'TOPS',       '상의',        'clothing', 20, true, null),
  ('knit',     'KNIT',       '니트',        'clothing', 30, true, null),
  ('shirts',   'SHIRTS',     '셔츠',        'clothing', 40, true, null),
  ('tee',      'T-SHIRTS',   '티셔츠',      'clothing', 50, true, null),
  ('denim',    'DENIM',      '데님',        'clothing', 60, true, null),
  ('pants',    'PANTS',      '팬츠',        'clothing', 70, true, null),
  ('dress',    'DRESS',      '원피스',      'clothing', 80, true, null),
  ('active',   'ACTIVEWEAR', '액티브웨어',  'clothing', 90, true, null),
  -- 가방·지갑
  ('tote',     'TOTE',       '토트',        'bags', 10, true, null),
  ('shoulder', 'SHOULDER',   '숄더',        'bags', 20, true, null),
  ('cross',    'CROSSBODY',  '크로스백',    'bags', 30, true, null),
  ('backpack', 'BACKPACK',   '백팩',        'bags', 40, true, null),
  ('wallet',   'WALLET',     '지갑',        'bags', 50, true, null),
  ('pouch',    'POUCH',      '파우치',      'bags', 60, true, null),
  -- 슈즈
  ('sneakers', 'SNEAKERS',   '스니커즈',    'shoes', 10, true, null),
  ('loafer',   'LOAFER',     '로퍼',        'shoes', 20, true, null),
  ('boots',    'BOOTS',      '부츠',        'shoes', 30, true, null),
  ('sandals',  'SANDALS',    '샌들',        'shoes', 40, true, null),
  -- 액세서리
  ('jewelry',  'JEWELRY',    '주얼리',      'accessories', 10, true, null),
  ('hair',     'HAIR',       '헤어',        'accessories', 20, true, null),
  ('scarf',    'SCARF',      '스카프',      'accessories', 30, true, null),
  ('belt',     'BELT',       '벨트',        'accessories', 40, true, null),
  ('cap',      'CAP',        '모자',        'accessories', 50, true, null),
  ('socks',    'SOCKS',      '양말',        'accessories', 60, true, null),
  -- 뷰티 (대분류가 숨김이라 화면에는 나오지 않습니다)
  ('perfume',  'PERFUME',    '향수',        'beauty', 10, true, null),
  ('skincare', 'SKINCARE',   '스킨케어',    'beauty', 20, true, null),
  ('makeup',   'MAKEUP',     '메이크업',    'beauty', 30, true, null),
  ('bodycare', 'BODY',       '바디케어',    'beauty', 40, true, null)
on conflict (slug) do nothing;

-- ── 브랜드 ────────────────────────────────────────────────
-- story 는 빈 줄로 문단을 나눕니다. 브랜드 상세 페이지에 문단 단위로 출력됩니다.
insert into public.brands
  (slug, label, name, name_ko, tagline, story, origin, since, image_url, display_order, is_visible, is_featured)
values
  (
    'jzl-closet', 'JZL CLOSET', 'JZL CLOSET', '제이진엘 클로젯',
    '편안함에 감성을 더하다',
    E'자체 기획으로 만드는 라인입니다. 매일 입는 옷과 매일 드는 가방을 같은 기준으로 봅니다.\n\n손에 익는 무게와 오래 봐도 질리지 않는 형태를 먼저 확인하고, 그 다음에 색을 정합니다.',
    '대한민국', '2025', '/images/brands/jzl-closet.jpg', 10, true, true
  ),
  (
    'jzl-atelier', 'ATELIER JZL', 'ATELIER JZL', '아틀리에 제이진엘',
    '한 벌을 오래 고쳐 입는 방식',
    E'소량으로만 만드는 라인입니다. 봉제와 마감에 시간을 더 쓰고, 수선까지 염두에 두고 패턴을 짭니다.\n\n시즌마다 형태를 바꾸지 않습니다. 같은 옷을 매년 조금씩 고쳐 만듭니다.',
    '대한민국', '2024', '/images/brands/jzl-atelier.jpg', 20, true, false
  ),
  (
    'nord-blanc', 'NORD BLANC', 'NORD BLANC', '노르 블랑',
    '겨울을 위한 최소한의 구성',
    E'울과 캐시미어를 중심으로 겨울 옷을 만드는 브랜드입니다.\n\n색을 늘리지 않고 밀도를 높이는 방향을 택합니다. 두꺼워 보이지 않으면서 따뜻한 두께를 찾는 것이 이들의 일입니다.',
    '대한민국', '2019', '/images/brands/nord-blanc.jpg', 30, true, false
  ),
  (
    'maison-oat', 'MAISON OAT', 'MAISON OAT', '메종 오트',
    '천연 소재를 그대로 두는 일',
    E'리넨과 코튼처럼 손이 많이 가는 소재를 다룹니다. 가공을 줄이는 대신 관리법을 자세히 적습니다.\n\n구김과 색 바램을 결함으로 보지 않고, 시간이 지나며 생기는 변화로 봅니다.',
    '대한민국', '2021', '/images/brands/maison-oat.jpg', 40, true, false
  ),
  (
    'stitch-lab', 'STITCH LAB', 'STITCH LAB', '스티치랩',
    '봉제선에서 시작하는 설계',
    E'데님과 슈즈를 만드는 브랜드입니다. 하중이 걸리는 자리마다 스티치 밀도를 다르게 둡니다.\n\n몇 번을 세탁해도 형태가 남는지를 기준으로 원단을 고릅니다.',
    '대한민국', '2018', '/images/brands/stitch-lab.jpg', 50, true, false
  )
on conflict (slug) do nothing;

-- ── 확인 ──────────────────────────────────────────────────
-- select parent_slug, count(*) from public.categories group by parent_slug order by 1;
-- select slug, label, display_order from public.brands order by display_order;
