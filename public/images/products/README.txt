JZL CLOSET 상품 이미지 폴더

구조
  public/images/products/{상품id}/01.jpg, 02.jpg, 03.jpg ...

  상품id 는 lib/products.ts 의 각 상품 id 값과 정확히 같아야 합니다.
  코드에서는 "/images/products/{상품id}/01.jpg" 형태로 참조합니다.

현재 등록된 상품 폴더
  wool-blend-single-coat    울 블렌드 싱글 코트    (의류 · 아우터)
  cashmere-round-knit       캐시미어 라운드 니트   (의류 · 니트)
  cotton-oversized-shirt    코튼 오버사이즈 셔츠   (의류 · 셔츠)
  straight-denim-pants      스트레이트 데님 팬츠   (의류 · 데님)
  linen-slip-dress          리넨 슬립 원피스       (의류 · 원피스)
  oslo-daily-tote           오슬로 데일리 토트백   (가방·지갑 · 토트)
  soft-leather-loafer       소프트 레더 로퍼       (슈즈 · 로퍼)
  wool-check-scarf          울 체크 머플러         (액세서리 · 스카프)

넣는 방법
  각 폴더에 01.jpg부터 순서대로 넣으세요.
  01.jpg 는 목록 카드의 기본 이미지, 02.jpg 는 마우스를 올렸을 때 바뀌는 이미지입니다.
  권장 규격은 세로형 4:5 비율, 가로 1200px 이상입니다.

새 상품을 추가할 때
  1) lib/products.ts 의 products 배열에 상품을 추가합니다.
     category / subCategory 는 lib/categories.ts 의 slug 값을 그대로 씁니다.
  2) 이 폴더 아래에 새 상품 id와 같은 이름의 폴더를 만듭니다.
  3) 그 폴더에 01.jpg 부터 이미지를 넣습니다.

이미지가 없어도 사이트는 정상 동작하며, 회색 자리표시자가 대신 표시됩니다.
