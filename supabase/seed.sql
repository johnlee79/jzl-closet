-- ============================================================
-- JZL CLOSET — 초기 상품 데이터 (8종)
-- schema.sql 을 먼저 실행한 뒤 이 파일을 SQL Editor 에 붙여넣으세요.
-- slug 가 같으면 덮어쓰므로 여러 번 실행해도 중복되지 않습니다.
-- ============================================================

-- 1. 울 블렌드 싱글 코트
insert into public.products (
  slug, name, brand_slug, category_slug, sub_category_slug,
  price, original_price, summary, origin, manufacturer, gender, season,
  thumbnails, options, detail_blocks, measurements,
  is_new, is_sale, is_sold_out, is_visible, free_shipping, display_order
) values (
  'wool-blend-single-coat', '울 블렌드 싱글 코트', 'nord-blanc', 'clothing', 'outer',
  398000, null, '어깨선을 낮춰 재킷 위에도 겹쳐 입는 미들 기장 싱글 코트', '대한민국', null, 'women', null,
  '["/images/products/wool-blend-single-coat/01.jpg","/images/products/wool-blend-single-coat/02.jpg","/images/products/wool-blend-single-coat/03.jpg","/images/products/wool-blend-single-coat/04.jpg"]'::jsonb, '[{"name":"컬러","values":["차콜","오트밀"],"soldOutValues":[]},{"name":"사이즈","values":["S","M","L"],"soldOutValues":[]}]'::jsonb, '[{"type":"image","src":"/images/products/wool-blend-single-coat/01.jpg","alt":"NORD BLANC 울 블렌드 싱글 코트 차콜 정면 전체 컷","caption":"단추를 모두 잠갔을 때의 실루엣입니다. 허리를 조이지 않아 안에 입은 옷이 눌리지 않습니다."},{"type":"text","heading":"겹쳐 입기를 전제로 만든 품","body":"코트는 안에 무엇을 입느냐에 따라 매일 다르게 맞아야 합니다. 니트만 입는 날과 재킷을 겹치는 날의 차이를 감당하도록 어깨선을 손목 쪽으로 1.5cm 내리고 가슴 단면에 여유를 두었습니다. 대신 총장을 무릎 위로 끌어올려 부피가 커 보이지 않게 했습니다."},{"type":"image","src":"/images/products/wool-blend-single-coat/02.jpg","alt":"NORD BLANC 울 블렌드 싱글 코트 오트밀 컬러 측면 착용 컷","caption":"키 165cm 모델이 M 사이즈를 착용했습니다. 밑단이 무릎 위 5cm에 옵니다."},{"type":"text","heading":"소재와 무게","body":"울 70%에 폴리에스터를 섞어 짠 멜톤 원단입니다. 울 100%보다 가벼우면서 형태가 오래 남습니다. M 사이즈 기준 무게는 약 1.4kg으로, 같은 두께의 캐시미어 혼방 코트보다 300g 정도 가볍습니다. 안감은 등판까지 전체를 덧대어 니트 위에 입어도 걸리지 않습니다."},{"type":"image","src":"/images/products/wool-blend-single-coat/03.jpg","alt":"NORD BLANC 울 블렌드 싱글 코트 차콜 소매 단추와 봉제선 클로즈업","caption":"소매 끝은 접어 올려 길이를 조절할 수 있도록 안쪽까지 마감했습니다."},{"type":"image","src":"/images/products/wool-blend-single-coat/04.jpg","alt":"NORD BLANC 울 블렌드 싱글 코트 오트밀 안감과 내부 포켓 컷","caption":"안주머니 한 개가 있습니다. 지갑과 휴대폰이 들어가는 크기입니다."},{"type":"spec","rows":[{"label":"소재","value":"겉감 울 70% · 폴리에스터 30% / 안감 폴리에스터 100%"},{"label":"무게","value":"M 사이즈 기준 약 1.4kg"},{"label":"두께감","value":"두꺼움 (한겨울용)"},{"label":"비침","value":"없음"},{"label":"신축성","value":"없음"},{"label":"포켓","value":"겉주머니 2 · 안주머니 1"},{"label":"세탁","value":"드라이클리닝"},{"label":"원산지","value":"대한민국"}]},{"type":"text","heading":"관리법","body":"시즌이 끝나면 드라이클리닝 후 비닐을 벗기고 통기성 있는 커버를 씌워 보관하세요. 어깨가 넓은 옷걸이를 쓰셔야 어깨선이 무너지지 않습니다. 보풀은 옷솔로 결을 따라 쓸어내리고, 심한 부분만 보풀 제거기를 원단에서 살짝 띄워 사용해 주세요."}]'::jsonb, '[{"label":"어깨 (S / M / L)","value":"44 / 45.5 / 47"},{"label":"가슴단면 (S / M / L)","value":"54 / 56 / 58"},{"label":"소매길이 (S / M / L)","value":"60 / 61 / 62"},{"label":"총장 (S / M / L)","value":"104 / 106 / 108"},{"label":"참고","value":"단위 cm. 재는 방법에 따라 1~2cm 오차가 있을 수 있습니다."}]'::jsonb,
  true, false, false, true, false, 10
)
on conflict (slug) do update set
  name = excluded.name,
  brand_slug = excluded.brand_slug,
  category_slug = excluded.category_slug,
  sub_category_slug = excluded.sub_category_slug,
  price = excluded.price,
  original_price = excluded.original_price,
  summary = excluded.summary,
  origin = excluded.origin,
  gender = excluded.gender,
  thumbnails = excluded.thumbnails,
  options = excluded.options,
  detail_blocks = excluded.detail_blocks,
  measurements = excluded.measurements,
  is_new = excluded.is_new,
  is_sale = excluded.is_sale,
  is_sold_out = excluded.is_sold_out,
  display_order = excluded.display_order;

-- 2. 캐시미어 라운드 니트
insert into public.products (
  slug, name, brand_slug, category_slug, sub_category_slug,
  price, original_price, summary, origin, manufacturer, gender, season,
  thumbnails, options, detail_blocks, measurements,
  is_new, is_sale, is_sold_out, is_visible, free_shipping, display_order
) values (
  'cashmere-round-knit', '캐시미어 라운드 니트', 'nord-blanc', 'clothing', 'knit',
  168000, null, '목이 늘어나지 않도록 넥라인을 두 겹으로 마감한 캐시미어 혼방 니트', '대한민국', null, 'unisex', null,
  '["/images/products/cashmere-round-knit/01.jpg","/images/products/cashmere-round-knit/02.jpg","/images/products/cashmere-round-knit/03.jpg"]'::jsonb, '[{"name":"컬러","values":["아이보리","딥그린","차콜"],"soldOutValues":[]},{"name":"사이즈","values":["S","M","L"],"soldOutValues":[]}]'::jsonb, '[{"type":"image","src":"/images/products/cashmere-round-knit/01.jpg","alt":"NORD BLANC 캐시미어 라운드 니트 아이보리 정면 전체 컷","caption":"한 벌로 입어도 속옷 자국이 비치지 않는 밀도로 짰습니다."},{"type":"text","heading":"넥라인이 먼저 늘어납니다","body":"니트를 버리게 되는 이유는 대부분 목둘레가 늘어나서입니다. 넥라인을 두 겹으로 접어 박고 안쪽에 얇은 테이프를 덧대어 머리를 넣고 벗을 때 받는 힘이 원단으로 퍼지도록 했습니다. 손목과 밑단 시보리도 같은 방식으로 마감했습니다."},{"type":"image","src":"/images/products/cashmere-round-knit/02.jpg","alt":"NORD BLANC 캐시미어 라운드 니트 딥그린 넥라인 마감 클로즈업","caption":"넥라인 안쪽 마감입니다. 겉에서는 두께가 드러나지 않습니다."},{"type":"text","heading":"소재와 사용감","body":"캐시미어 30%에 울을 섞었습니다. 캐시미어 100%보다 형태가 오래 남고 보풀이 덜 생깁니다. 피부에 닿는 느낌은 부드럽지만 울이 섞여 있어 민감하신 분은 얇은 티셔츠를 안에 입는 편이 편합니다. 첫 두세 번 착용까지는 잔털이 조금 빠질 수 있습니다."},{"type":"image","src":"/images/products/cashmere-round-knit/03.jpg","alt":"NORD BLANC 캐시미어 라운드 니트 차콜 셔츠와 겹쳐 입은 착용 컷","caption":"셔츠 위에 겹쳐 입은 모습입니다. 어깨가 눌리지 않는 품으로 잡았습니다."},{"type":"spec","rows":[{"label":"소재","value":"캐시미어 30% · 울 70%"},{"label":"무게","value":"M 사이즈 기준 약 480g"},{"label":"두께감","value":"중간 (가을 중반~겨울)"},{"label":"비침","value":"없음"},{"label":"신축성","value":"약간 있음"},{"label":"안감","value":"없음"},{"label":"세탁","value":"드라이클리닝 권장 · 손세탁 시 30도 이하 중성세제"},{"label":"원산지","value":"대한민국"}]},{"type":"text","heading":"관리법","body":"걸어서 보관하면 어깨와 밑단이 늘어납니다. 반드시 접어서 눕혀 두세요. 손세탁하실 때는 비비지 말고 중성세제를 푼 물에 5분 정도 담갔다가 눌러 헹구고, 수건 위에 펴서 그늘에 말리시면 됩니다."}]'::jsonb, '[{"label":"어깨 (S / M / L)","value":"42 / 44 / 46"},{"label":"가슴단면 (S / M / L)","value":"50 / 52 / 54"},{"label":"소매길이 (S / M / L)","value":"58 / 59.5 / 61"},{"label":"총장 (S / M / L)","value":"62 / 64 / 66"},{"label":"참고","value":"단위 cm. 남녀 공용 사이즈이며, 여유 있게 입으시려면 한 사이즈 크게 고르세요."}]'::jsonb,
  false, false, false, true, false, 20
)
on conflict (slug) do update set
  name = excluded.name,
  brand_slug = excluded.brand_slug,
  category_slug = excluded.category_slug,
  sub_category_slug = excluded.sub_category_slug,
  price = excluded.price,
  original_price = excluded.original_price,
  summary = excluded.summary,
  origin = excluded.origin,
  gender = excluded.gender,
  thumbnails = excluded.thumbnails,
  options = excluded.options,
  detail_blocks = excluded.detail_blocks,
  measurements = excluded.measurements,
  is_new = excluded.is_new,
  is_sale = excluded.is_sale,
  is_sold_out = excluded.is_sold_out,
  display_order = excluded.display_order;

-- 3. 코튼 오버사이즈 셔츠
insert into public.products (
  slug, name, brand_slug, category_slug, sub_category_slug,
  price, original_price, summary, origin, manufacturer, gender, season,
  thumbnails, options, detail_blocks, measurements,
  is_new, is_sale, is_sold_out, is_visible, free_shipping, display_order
) values (
  'cotton-oversized-shirt', '코튼 오버사이즈 셔츠', 'maison-oat', 'clothing', 'shirts',
  118000, null, '단추를 끝까지 잠가도 목이 답답하지 않은 워싱 코튼 셔츠', '대한민국', null, 'unisex', null,
  '["/images/products/cotton-oversized-shirt/01.jpg","/images/products/cotton-oversized-shirt/02.jpg","/images/products/cotton-oversized-shirt/03.jpg"]'::jsonb, '[{"name":"컬러","values":["화이트","스카이블루","차콜"],"soldOutValues":[]},{"name":"사이즈","values":["S","M","L"],"soldOutValues":[]}]'::jsonb, '[{"type":"image","src":"/images/products/cotton-oversized-shirt/01.jpg","alt":"MAISON OAT 코튼 오버사이즈 셔츠 화이트 정면 전체 컷","caption":"어깨가 떨어지는 정도를 2cm로 제한해 잠옷처럼 보이지 않게 했습니다."},{"type":"text","heading":"목둘레를 1cm 키웠습니다","body":"오버사이즈 셔츠는 품이 넉넉해도 목이 답답하면 결국 단추를 풀게 됩니다. 목둘레만 표준 치수보다 1cm 키우고 칼라 높이는 그대로 두었습니다. 끝까지 잠가도 목이 조이지 않고, 안에 니트를 겹쳐 입어도 칼라가 눌리지 않습니다."},{"type":"image","src":"/images/products/cotton-oversized-shirt/02.jpg","alt":"MAISON OAT 코튼 오버사이즈 셔츠 스카이블루 칼라와 단추 클로즈업","caption":"칼라 심지는 얇은 것을 넣어 세탁 후에도 각이 서지 않고 자연스럽게 눕습니다."},{"type":"text","heading":"소재와 사용감","body":"코튼 100% 원단을 한 번 워싱해 수축을 미리 잡았습니다. 처음부터 부드럽고, 세탁 후 줄어드는 폭이 1cm 이내입니다. 다림질을 하지 않아도 구김이 자연스럽게 보이도록 밀도를 낮춰 짰습니다. 화이트는 밝은 색상 특성상 진한 색 옷과 함께 세탁하면 이염될 수 있습니다."},{"type":"image","src":"/images/products/cotton-oversized-shirt/03.jpg","alt":"MAISON OAT 코튼 오버사이즈 셔츠 차콜 소매를 걷어 올린 착용 컷","caption":"소매를 두 번 접어 올린 모습입니다. 팔꿈치 위에서 고정됩니다."},{"type":"spec","rows":[{"label":"소재","value":"코튼 100% (워싱 가공)"},{"label":"무게","value":"M 사이즈 기준 약 340g"},{"label":"두께감","value":"중간 (사계절)"},{"label":"비침","value":"화이트 약간 있음 · 그 외 없음"},{"label":"신축성","value":"없음"},{"label":"포켓","value":"가슴 포켓 1"},{"label":"세탁","value":"찬물 단독 세탁 · 표백제 사용 금지"},{"label":"원산지","value":"대한민국"}]},{"type":"text","heading":"관리법","body":"세탁망에 넣어 단독으로 세탁하시고, 건조기는 수축의 원인이 되므로 사용하지 마세요. 젖은 상태에서 어깨를 잡고 가볍게 털어 널면 구김이 대부분 펴집니다. 다림질하실 때는 중온에서 칼라와 커프스만 눌러 주시면 됩니다."}]'::jsonb, '[{"label":"어깨 (S / M / L)","value":"46 / 48 / 50"},{"label":"가슴단면 (S / M / L)","value":"56 / 58 / 60"},{"label":"소매길이 (S / M / L)","value":"57 / 58.5 / 60"},{"label":"총장 (S / M / L)","value":"72 / 74 / 76"},{"label":"참고","value":"단위 cm. 오버사이즈 핏이라 평소 사이즈 그대로 고르시면 됩니다."}]'::jsonb,
  true, false, false, true, false, 30
)
on conflict (slug) do update set
  name = excluded.name,
  brand_slug = excluded.brand_slug,
  category_slug = excluded.category_slug,
  sub_category_slug = excluded.sub_category_slug,
  price = excluded.price,
  original_price = excluded.original_price,
  summary = excluded.summary,
  origin = excluded.origin,
  gender = excluded.gender,
  thumbnails = excluded.thumbnails,
  options = excluded.options,
  detail_blocks = excluded.detail_blocks,
  measurements = excluded.measurements,
  is_new = excluded.is_new,
  is_sale = excluded.is_sale,
  is_sold_out = excluded.is_sold_out,
  display_order = excluded.display_order;

-- 4. 스트레이트 데님 팬츠
insert into public.products (
  slug, name, brand_slug, category_slug, sub_category_slug,
  price, original_price, summary, origin, manufacturer, gender, season,
  thumbnails, options, detail_blocks, measurements,
  is_new, is_sale, is_sold_out, is_visible, free_shipping, display_order
) values (
  'straight-denim-pants', '스트레이트 데님 팬츠', 'stitch-lab', 'clothing', 'denim',
  138000, 168000, '허벅지에서 발목까지 폭이 일정한 논스트레치 스트레이트 데님', '대한민국', null, 'women', null,
  '["/images/products/straight-denim-pants/01.jpg","/images/products/straight-denim-pants/02.jpg","/images/products/straight-denim-pants/03.jpg"]'::jsonb, '[{"name":"컬러","values":["미디엄 인디고","워시드 블랙"],"soldOutValues":[]},{"name":"사이즈","values":["S","M","L"],"soldOutValues":[]}]'::jsonb, '[{"type":"image","src":"/images/products/straight-denim-pants/01.jpg","alt":"STITCH LAB 스트레이트 데님 팬츠 미디엄 인디고 정면 전체 컷","caption":"허벅지부터 밑단까지 폭 차이를 9cm 이내로 좁혀 선이 곧게 떨어집니다."},{"type":"text","heading":"신축성을 넣지 않았습니다","body":"스판을 섞으면 처음에는 편하지만 몇 번 입으면 무릎이 나옵니다. 대신 밑위를 1.5cm 올리고 엉덩이 둘레에 여유를 두어, 신축성 없이도 앉았을 때 당기지 않도록 패턴으로 해결했습니다. 처음 이틀 정도는 뻣뻣하지만 그 뒤로는 몸에 맞게 자리를 잡습니다."},{"type":"image","src":"/images/products/straight-denim-pants/02.jpg","alt":"STITCH LAB 스트레이트 데님 팬츠 워시드 블랙 밑단과 스티치 클로즈업","caption":"하중이 걸리는 주머니 입구와 밑위 봉제선에는 스티치를 두 줄로 넣었습니다."},{"type":"text","heading":"소재와 사용감","body":"13온스 논스트레치 데님을 사용했습니다. 미디엄 인디고는 착용과 세탁을 반복하며 무릎과 허벅지부터 색이 옅어집니다. 이 변화를 전제로 만든 원단이라 초기 몇 회 세탁 시 물이 빠질 수 있으니 밝은 색 옷이나 밝은 색 가방과 함께 두지 마세요."},{"type":"image","src":"/images/products/straight-denim-pants/03.jpg","alt":"STITCH LAB 스트레이트 데님 팬츠 미디엄 인디고 로퍼와 함께 연출한 착용 컷","caption":"밑단이 발등에 살짝 닿는 길이입니다. 굽이 있는 신발에는 그대로, 운동화에는 한 번 접어 신으시면 됩니다."},{"type":"spec","rows":[{"label":"소재","value":"코튼 100% (13온스 논스트레치 데님)"},{"label":"무게","value":"M 사이즈 기준 약 620g"},{"label":"두께감","value":"두꺼움"},{"label":"비침","value":"없음"},{"label":"신축성","value":"없음"},{"label":"포켓","value":"앞주머니 2 · 뒷주머니 2 · 코인 포켓 1"},{"label":"세탁","value":"뒤집어 단독 세탁 · 30도 이하"},{"label":"원산지","value":"대한민국"}]},{"type":"text","heading":"관리법","body":"색이 빠지는 것을 늦추려면 뒤집어서 찬물에 단독 세탁하고, 그늘에 널어 말리세요. 건조기는 수축과 변형의 원인이 됩니다. 밑단 수선이 필요하시면 주문 시 문의해 주세요. 원단 특성상 수선 후에는 교환과 반품이 어렵습니다."}]'::jsonb, '[{"label":"허리단면 (S / M / L)","value":"33 / 35 / 37"},{"label":"엉덩이단면 (S / M / L)","value":"48 / 50 / 52"},{"label":"허벅지단면 (S / M / L)","value":"29 / 30 / 31"},{"label":"밑단단면 (S / M / L)","value":"20 / 20.5 / 21"},{"label":"총장 (S / M / L)","value":"98 / 100 / 102"},{"label":"참고","value":"단위 cm. 신축성이 없는 원단이라 평소보다 여유 있는 사이즈를 권합니다."}]'::jsonb,
  false, true, false, true, false, 40
)
on conflict (slug) do update set
  name = excluded.name,
  brand_slug = excluded.brand_slug,
  category_slug = excluded.category_slug,
  sub_category_slug = excluded.sub_category_slug,
  price = excluded.price,
  original_price = excluded.original_price,
  summary = excluded.summary,
  origin = excluded.origin,
  gender = excluded.gender,
  thumbnails = excluded.thumbnails,
  options = excluded.options,
  detail_blocks = excluded.detail_blocks,
  measurements = excluded.measurements,
  is_new = excluded.is_new,
  is_sale = excluded.is_sale,
  is_sold_out = excluded.is_sold_out,
  display_order = excluded.display_order;

-- 5. 리넨 슬립 원피스
insert into public.products (
  slug, name, brand_slug, category_slug, sub_category_slug,
  price, original_price, summary, origin, manufacturer, gender, season,
  thumbnails, options, detail_blocks, measurements,
  is_new, is_sale, is_sold_out, is_visible, free_shipping, display_order
) values (
  'linen-slip-dress', '리넨 슬립 원피스', 'maison-oat', 'clothing', 'dress',
  158000, null, '한 벌로도, 티셔츠 위에 겹쳐서도 입는 리넨 슬립 원피스', '대한민국', null, 'women', null,
  '["/images/products/linen-slip-dress/01.jpg","/images/products/linen-slip-dress/02.jpg","/images/products/linen-slip-dress/03.jpg"]'::jsonb, '[{"name":"컬러","values":["내추럴","올리브","블랙"],"soldOutValues":[]},{"name":"사이즈","values":["S","M","L"],"soldOutValues":[]}]'::jsonb, '[{"type":"image","src":"/images/products/linen-slip-dress/01.jpg","alt":"MAISON OAT 리넨 슬립 원피스 내추럴 정면 전체 컷","caption":"허리선을 강조하지 않아 몸의 선이 그대로 드러나지 않습니다."},{"type":"text","heading":"두 가지 방식으로 입습니다","body":"여름에는 한 벌로, 나머지 계절에는 티셔츠나 니트 위에 겹쳐 입도록 만들었습니다. 겹쳐 입을 것을 전제로 진동 둘레를 넉넉하게 파고, 어깨끈은 8cm 범위에서 조절되도록 했습니다. 안에 입는 옷의 두께에 따라 길이를 맞추시면 됩니다."},{"type":"image","src":"/images/products/linen-slip-dress/02.jpg","alt":"MAISON OAT 리넨 슬립 원피스 올리브 어깨끈 조절 부분 클로즈업","caption":"끈 조절 부분은 금속 대신 같은 원단으로 감싸 피부에 닿아도 차갑지 않습니다."},{"type":"text","heading":"소재와 사용감","body":"리넨 70%에 레이온을 섞어 리넨 특유의 서걱함을 줄였습니다. 한 벌로 입을 수 있도록 안감을 무릎 위까지 덧대어 빛이 강한 곳에서도 비치지 않습니다. 리넨은 앉았다 일어나면 구김이 생기는데, 이 구김을 소재의 표정으로 보고 다림질을 전제하지 않은 원단을 골랐습니다."},{"type":"image","src":"/images/products/linen-slip-dress/03.jpg","alt":"MAISON OAT 리넨 슬립 원피스 블랙 티셔츠 위에 겹쳐 입은 착용 컷","caption":"반팔 티셔츠 위에 겹쳐 입은 모습입니다. 키 165cm 모델이 M 사이즈를 착용했습니다."},{"type":"spec","rows":[{"label":"소재","value":"겉감 리넨 70% · 레이온 30% / 안감 코튼 100%"},{"label":"무게","value":"M 사이즈 기준 약 390g"},{"label":"두께감","value":"얇음 (봄~가을)"},{"label":"비침","value":"없음 (무릎 위까지 안감)"},{"label":"신축성","value":"없음"},{"label":"세탁","value":"손세탁 또는 드라이클리닝"},{"label":"원산지","value":"대한민국"}]},{"type":"text","heading":"관리법","body":"세탁기를 사용하시면 밑단이 틀어질 수 있어 손세탁을 권합니다. 물기를 짜지 말고 눌러서 뺀 뒤 옷걸이에 걸어 그늘에서 말리시면 구김이 대부분 펴집니다. 다림질이 필요하면 낮은 온도에서 천을 덧대고 해주세요."}]'::jsonb, '[{"label":"어깨끈 길이 (S / M / L)","value":"38~46 / 39~47 / 40~48"},{"label":"가슴단면 (S / M / L)","value":"45 / 47 / 49"},{"label":"허리단면 (S / M / L)","value":"46 / 48 / 50"},{"label":"총장 (S / M / L)","value":"118 / 121 / 124"},{"label":"참고","value":"단위 cm. 어깨끈은 8cm 범위에서 조절됩니다."}]'::jsonb,
  true, false, false, true, false, 50
)
on conflict (slug) do update set
  name = excluded.name,
  brand_slug = excluded.brand_slug,
  category_slug = excluded.category_slug,
  sub_category_slug = excluded.sub_category_slug,
  price = excluded.price,
  original_price = excluded.original_price,
  summary = excluded.summary,
  origin = excluded.origin,
  gender = excluded.gender,
  thumbnails = excluded.thumbnails,
  options = excluded.options,
  detail_blocks = excluded.detail_blocks,
  measurements = excluded.measurements,
  is_new = excluded.is_new,
  is_sale = excluded.is_sale,
  is_sold_out = excluded.is_sold_out,
  display_order = excluded.display_order;

-- 6. 오슬로 데일리 토트백
insert into public.products (
  slug, name, brand_slug, category_slug, sub_category_slug,
  price, original_price, summary, origin, manufacturer, gender, season,
  thumbnails, options, detail_blocks, measurements,
  is_new, is_sale, is_sold_out, is_visible, free_shipping, display_order
) values (
  'oslo-daily-tote', '오슬로 데일리 토트백', 'jzl-closet', 'bags', 'tote',
  268000, 320000, '노트북과 하루치 짐이 함께 들어가는 구조형 소가죽 토트백', '대한민국', null, 'unisex', null,
  '["/images/products/oslo-daily-tote/01.jpg","/images/products/oslo-daily-tote/02.jpg","/images/products/oslo-daily-tote/03.jpg","/images/products/oslo-daily-tote/04.jpg"]'::jsonb, '[{"name":"컬러","values":["블랙","토프","딥브라운"],"soldOutValues":[]},{"name":"스트랩","values":["기본 핸들만","숄더 스트랩 포함"],"soldOutValues":[]}]'::jsonb, '[{"type":"image","src":"/images/products/oslo-daily-tote/01.jpg","alt":"JZL CLOSET 오슬로 데일리 토트백 블랙 정면 전체 컷","caption":"각을 세우지 않고 자연스럽게 세워지는 형태. 가방을 내려놓았을 때의 선을 기준으로 패턴을 잡았습니다."},{"type":"text","heading":"하루치 짐을 위한 크기","body":"13인치 노트북과 A4 서류, 텀블러와 파우치까지 넣어도 입구가 벌어지지 않는 크기로 만들었습니다. 가방을 크게 만들면 짐이 늘고, 작게 만들면 매일 들 수 없습니다. 출퇴근과 짧은 외출을 함께 감당하는 지점을 찾아 가로 34cm에서 멈췄습니다."},{"type":"image","src":"/images/products/oslo-daily-tote/02.jpg","alt":"JZL CLOSET 오슬로 데일리 토트백 토프 컬러 내부 수납 구조 컷","caption":"안쪽에 지퍼 포켓 한 개와 오픈 포켓 두 개. 카드지갑과 휴대폰이 바닥으로 가라앉지 않습니다."},{"type":"text","heading":"어깨에 걸었을 때","body":"핸들 길이는 겉옷을 입은 상태에서 어깨에 걸리도록 잡았습니다. 손에 들면 바닥이 무릎에 닿지 않고, 어깨에 걸면 팔을 굽히지 않아도 됩니다. 숄더 스트랩을 선택하시면 탈부착으로 크로스 착용까지 가능합니다."},{"type":"image","src":"/images/products/oslo-daily-tote/03.jpg","alt":"JZL CLOSET 오슬로 데일리 토트백 딥브라운 어깨 착용 측면 컷","caption":"키 165cm 모델이 숄더 스트랩 없이 어깨에 건 모습입니다."},{"type":"image","src":"/images/products/oslo-daily-tote/04.jpg","alt":"JZL CLOSET 오슬로 데일리 토트백 블랙 핸들 봉제와 가죽 결 클로즈업","caption":"핸들이 몸통과 만나는 자리는 네 번 겹쳐 박아 하중을 분산했습니다."},{"type":"text","heading":"소재와 사용감","body":"이탈리아산 베지터블 소가죽을 사용했습니다. 처음에는 표면이 단단하지만 두세 달 정도 사용하면 손이 닿는 부분부터 색이 짙어지며 형태가 몸에 맞게 자리를 잡습니다. 물에 젖으면 얼룩이 남을 수 있어 비 오는 날에는 방수 스프레이를 미리 뿌려 두시길 권합니다."},{"type":"spec","rows":[{"label":"사이즈","value":"가로 34cm · 세로 27cm · 폭 12cm"},{"label":"핸들 길이","value":"58cm (어깨 착용 가능)"},{"label":"무게","value":"약 820g"},{"label":"소재","value":"이탈리아산 베지터블 소가죽, 면 혼방 안감"},{"label":"수납","value":"내부 지퍼 포켓 1 · 오픈 포켓 2 · 13인치 노트북 수납"},{"label":"구성","value":"더스트백 1, 숄더 스트랩(옵션 선택 시)"},{"label":"원산지","value":"대한민국"}]},{"type":"text","heading":"관리법","body":"사용하지 않을 때는 종이나 천을 채워 형태를 유지한 채 더스트백에 세워 보관하세요. 오염이 생기면 마른 천으로 가볍게 닦고, 3~6개월에 한 번 가죽 전용 크림을 얇게 발라 주시면 건조로 인한 잔주름을 줄일 수 있습니다. 직사광선과 습기 많은 곳은 피해 주세요."}]'::jsonb, '[]'::jsonb,
  false, true, false, true, false, 60
)
on conflict (slug) do update set
  name = excluded.name,
  brand_slug = excluded.brand_slug,
  category_slug = excluded.category_slug,
  sub_category_slug = excluded.sub_category_slug,
  price = excluded.price,
  original_price = excluded.original_price,
  summary = excluded.summary,
  origin = excluded.origin,
  gender = excluded.gender,
  thumbnails = excluded.thumbnails,
  options = excluded.options,
  detail_blocks = excluded.detail_blocks,
  measurements = excluded.measurements,
  is_new = excluded.is_new,
  is_sale = excluded.is_sale,
  is_sold_out = excluded.is_sold_out,
  display_order = excluded.display_order;

-- 7. 소프트 레더 로퍼
insert into public.products (
  slug, name, brand_slug, category_slug, sub_category_slug,
  price, original_price, summary, origin, manufacturer, gender, season,
  thumbnails, options, detail_blocks, measurements,
  is_new, is_sale, is_sold_out, is_visible, free_shipping, display_order
) values (
  'soft-leather-loafer', '소프트 레더 로퍼', 'stitch-lab', 'shoes', 'loafer',
  198000, null, '뒤꿈치가 까지지 않도록 안쪽을 한 겹 덧댄 소가죽 로퍼', '대한민국', null, 'women', null,
  '["/images/products/soft-leather-loafer/01.jpg","/images/products/soft-leather-loafer/02.jpg","/images/products/soft-leather-loafer/03.jpg"]'::jsonb, '[{"name":"컬러","values":["블랙","다크브라운"],"soldOutValues":[]},{"name":"사이즈","values":["230","235","240","245","250"],"soldOutValues":["250"]}]'::jsonb, '[{"type":"image","src":"/images/products/soft-leather-loafer/01.jpg","alt":"STITCH LAB 소프트 레더 로퍼 블랙 측면 전체 컷","caption":"굽 높이 2.5cm. 걸을 때 소리가 크게 나지 않는 고무창을 붙였습니다."},{"type":"text","heading":"길들이는 기간을 줄였습니다","body":"로퍼는 처음 며칠이 가장 어렵습니다. 뒤꿈치가 닿는 부분에 부드러운 가죽을 한 겹 덧대고 심지를 낮춰, 신는 첫날부터 발이 까지지 않도록 했습니다. 발등 부분은 신을수록 늘어나므로 처음에 살짝 조이는 정도가 맞습니다."},{"type":"image","src":"/images/products/soft-leather-loafer/02.jpg","alt":"STITCH LAB 소프트 레더 로퍼 다크브라운 뒤꿈치 안쪽 마감 클로즈업","caption":"뒤꿈치 안쪽에 덧댄 가죽입니다. 겉으로는 두께가 드러나지 않습니다."},{"type":"text","heading":"사이즈 고르는 법","body":"평소 운동화 사이즈 그대로 고르시면 됩니다. 발볼이 넓으신 분은 한 치수 크게 신으시는 편이 편합니다. 발등이 높은 편이라면 착용 초기에 조일 수 있으나, 일주일 정도 신으면 발등 부분이 늘어나 자리를 잡습니다."},{"type":"image","src":"/images/products/soft-leather-loafer/03.jpg","alt":"STITCH LAB 소프트 레더 로퍼 블랙 데님 팬츠와 함께 연출한 착용 컷","caption":"데님 밑단을 한 번 접어 신은 모습입니다."},{"type":"spec","rows":[{"label":"사이즈","value":"230 / 235 / 240 / 245 / 250 (mm)"},{"label":"굽 높이","value":"2.5cm"},{"label":"무게","value":"240mm 한 짝 기준 약 310g"},{"label":"소재","value":"겉감 소가죽 · 안감 소가죽 · 아웃솔 고무"},{"label":"착용감","value":"발볼 보통 · 정사이즈 권장"},{"label":"구성","value":"더스트백 1, 여분 인솔 1"},{"label":"원산지","value":"대한민국"}]},{"type":"text","heading":"관리법","body":"비를 맞은 날에는 신문지를 채워 형태를 잡고 그늘에서 말리세요. 열기구로 말리면 가죽이 갈라집니다. 두세 달에 한 번 가죽 크림을 얇게 바르면 표면이 오래 유지됩니다. 착용 흔적이 생긴 뒤에는 교환과 반품이 어려우니 실내에서 먼저 신어 보고 판단해 주세요."}]'::jsonb, '[]'::jsonb,
  true, false, false, true, false, 70
)
on conflict (slug) do update set
  name = excluded.name,
  brand_slug = excluded.brand_slug,
  category_slug = excluded.category_slug,
  sub_category_slug = excluded.sub_category_slug,
  price = excluded.price,
  original_price = excluded.original_price,
  summary = excluded.summary,
  origin = excluded.origin,
  gender = excluded.gender,
  thumbnails = excluded.thumbnails,
  options = excluded.options,
  detail_blocks = excluded.detail_blocks,
  measurements = excluded.measurements,
  is_new = excluded.is_new,
  is_sale = excluded.is_sale,
  is_sold_out = excluded.is_sold_out,
  display_order = excluded.display_order;

-- 8. 울 체크 머플러
insert into public.products (
  slug, name, brand_slug, category_slug, sub_category_slug,
  price, original_price, summary, origin, manufacturer, gender, season,
  thumbnails, options, detail_blocks, measurements,
  is_new, is_sale, is_sold_out, is_visible, free_shipping, display_order
) values (
  'wool-check-scarf', '울 체크 머플러', 'jzl-closet', 'accessories', 'scarf',
  118000, 148000, '두 번 감아도 목이 답답하지 않은 램스울 체크 머플러', '대한민국', null, 'unisex', null,
  '["/images/products/wool-check-scarf/01.jpg","/images/products/wool-check-scarf/02.jpg","/images/products/wool-check-scarf/03.jpg"]'::jsonb, '[{"name":"컬러","values":["그레이 체크","브라운 체크","네이비 체크"],"soldOutValues":["네이비 체크"]}]'::jsonb, '[{"type":"image","src":"/images/products/wool-check-scarf/01.jpg","alt":"JZL CLOSET 울 체크 머플러 그레이 체크 펼친 전체 컷","caption":"가로 190cm, 세로 65cm. 한 번 감고도 앞자락이 충분히 남습니다."},{"type":"text","heading":"부피를 계산한 두께","body":"머플러는 두꺼울수록 따뜻하지만 두 번 감으면 턱이 묻힙니다. 램스울을 성글게 짜 공기층을 만들되 원단 자체는 얇게 유지했습니다. 두 번 감아도 코트 깃 안에 들어갑니다."},{"type":"image","src":"/images/products/wool-check-scarf/02.jpg","alt":"JZL CLOSET 울 체크 머플러 브라운 체크 두 번 감은 착용 컷","caption":"목에 두 번 감고 앞자락을 늘어뜨린 모습입니다."},{"type":"text","heading":"소재와 사용감","body":"램스울 100%를 사용했습니다. 목에 직접 닿는 소재라 방모사 중에서도 짧은 섬유가 적게 섞인 원사를 골랐습니다. 울 특성상 초기에는 잔털이 조금 빠질 수 있으며, 두세 번 착용하면 대부분 정리됩니다."},{"type":"image","src":"/images/products/wool-check-scarf/03.jpg","alt":"JZL CLOSET 울 체크 머플러 네이비 체크 프린지 마감 클로즈업","caption":"양 끝은 8cm 프린지로 마감했습니다."},{"type":"spec","rows":[{"label":"사이즈","value":"가로 190cm · 세로 65cm (프린지 8cm 포함)"},{"label":"무게","value":"약 310g"},{"label":"소재","value":"램스울 100%"},{"label":"두께감","value":"중간 (가을 중반~겨울)"},{"label":"원산지","value":"대한민국"}]},{"type":"text","heading":"관리법","body":"가정 세탁 대신 드라이클리닝을 권합니다. 보관할 때는 걸어두지 말고 접어서 눕혀 두셔야 늘어나지 않습니다. 프린지가 엉켰을 때는 손으로 결을 따라 정리하시고, 보풀은 보풀 제거기를 원단에서 살짝 띄워 사용해 주세요."}]'::jsonb, '[]'::jsonb,
  false, true, false, true, false, 80
)
on conflict (slug) do update set
  name = excluded.name,
  brand_slug = excluded.brand_slug,
  category_slug = excluded.category_slug,
  sub_category_slug = excluded.sub_category_slug,
  price = excluded.price,
  original_price = excluded.original_price,
  summary = excluded.summary,
  origin = excluded.origin,
  gender = excluded.gender,
  thumbnails = excluded.thumbnails,
  options = excluded.options,
  detail_blocks = excluded.detail_blocks,
  measurements = excluded.measurements,
  is_new = excluded.is_new,
  is_sale = excluded.is_sale,
  is_sold_out = excluded.is_sold_out,
  display_order = excluded.display_order;

-- ── 문구 템플릿 예시 ──────────────────────────────────────
insert into public.templates (title, body) select '소재 관리법 (가죽)', '<p>사용하지 않을 때는 종이나 천을 채워 형태를 유지한 채 더스트백에 보관하세요. 오염이 생기면 마른 천으로 가볍게 닦고, 3~6개월에 한 번 가죽 전용 크림을 얇게 발라 주시면 건조로 인한 잔주름을 줄일 수 있습니다.</p>' where not exists (select 1 from public.templates where title = '소재 관리법 (가죽)');
insert into public.templates (title, body) select '소재 관리법 (울·니트)', '<p>걸어서 보관하면 어깨와 밑단이 늘어납니다. 반드시 접어서 눕혀 두세요. 드라이클리닝을 권하며, 보풀은 제거기를 원단에서 살짝 띄워 사용해 주세요.</p>' where not exists (select 1 from public.templates where title = '소재 관리법 (울·니트)');
insert into public.templates (title, body) select '배송 안내', '<p>주문 확인 후 1~3영업일 이내에 출고됩니다. 도서·산간 지역은 하루에서 이틀이 더 걸릴 수 있습니다. 배송이 지연될 경우 문자로 미리 안내드립니다.</p>' where not exists (select 1 from public.templates where title = '배송 안내');
insert into public.templates (title, body) select '교환·반품 안내', '<p>상품 수령일로부터 7일 이내에 고객센터로 연락 주시면 접수해 드립니다. 착용 흔적이 있거나 택을 제거한 경우에는 교환과 반품이 어렵습니다.</p>' where not exists (select 1 from public.templates where title = '교환·반품 안내');
