/**
 * ============================================================
 * 취급 브랜드 데이터.
 * ============================================================
 *
 * ★ label 은 화면에 보이는 글자입니다. 한글·영문 자유롭게 바꿔도 됩니다.
 *   slug 는 주소에 쓰이므로 절대 바꾸지 마세요. 바꾸면 검색 순위가 초기화됩니다.
 *
 * 필드 역할
 *   slug      URL 전용. /brand/nord-blanc 의 nord-blanc 부분입니다. 고정값으로 두세요.
 *   label     화면에 출력되는 글자. 상품 카드·상세·브랜드 필터 칩에 이 값이 나옵니다.
 *   name      메타데이터·구조화 데이터(JSON-LD)·이미지 alt 전용 정식 명칭입니다.
 *   nameKo    브랜드 페이지 h1 과 메타데이터 전용입니다.
 *   isVisible false 면 브랜드 필터 칩에서 빠집니다. 데이터와 페이지는 남습니다.
 *
 * 브랜드 추가하는 법
 *   아래 배열에 항목을 추가하고 lib/products.ts 의 상품에서 brand: '<slug>' 로
 *   연결하면 됩니다. /brand 목록과 /brand/{slug} 페이지, 사이트맵이 자동으로 따라옵니다.
 *   이미지는 public/images/brands/{slug}.jpg 에 넣으세요.
 *
 * 브랜드 메뉴는 헤더에 노출하지 않지만(lib/categories.ts 의 brand 항목이 isVisible:false),
 * 페이지는 그대로 남겨 검색 유입 경로로 사용합니다.
 */

export type Brand = {
  slug: string; // URL 전용 — 바꾸지 마세요
  label: string; // 화면 출력용 — 자유롭게 바꿔도 됩니다
  name: string; // 메타데이터·JSON-LD 전용 정식 명칭
  nameKo: string;
  tagline: string;
  story: string[];
  origin: string;
  since: string;
  order: number;
  isVisible: boolean;
};

export const brands: Brand[] = [
  {
    slug: 'jzl-closet',
    label: 'JZL CLOSET',
    name: 'JZL CLOSET',
    nameKo: '제이진엘 클로젯',
    tagline: '편안함에 감성을 더하다',
    story: [
      '자체 기획으로 만드는 라인입니다. 매일 입는 옷과 매일 드는 가방을 같은 기준으로 봅니다.',
      '손에 익는 무게와 오래 봐도 질리지 않는 형태를 먼저 확인하고, 그 다음에 색을 정합니다.',
    ],
    origin: '대한민국',
    since: '2025',
    order: 10,
    isVisible: true,
  },
  {
    slug: 'jzl-atelier',
    label: 'ATELIER JZL',
    name: 'ATELIER JZL',
    nameKo: '아틀리에 제이진엘',
    tagline: '한 벌을 오래 고쳐 입는 방식',
    story: [
      '소량으로만 만드는 라인입니다. 봉제와 마감에 시간을 더 쓰고, 수선까지 염두에 두고 패턴을 짭니다.',
      '시즌마다 형태를 바꾸지 않습니다. 같은 옷을 매년 조금씩 고쳐 만듭니다.',
    ],
    origin: '대한민국',
    since: '2024',
    order: 20,
    isVisible: true,
  },
  {
    slug: 'nord-blanc',
    label: 'NORD BLANC',
    name: 'NORD BLANC',
    nameKo: '노르 블랑',
    tagline: '겨울을 위한 최소한의 구성',
    story: [
      '울과 캐시미어를 중심으로 겨울 옷을 만드는 브랜드입니다.',
      '색을 늘리지 않고 밀도를 높이는 방향을 택합니다. 두꺼워 보이지 않으면서 따뜻한 두께를 찾는 것이 이들의 일입니다.',
    ],
    origin: '대한민국',
    since: '2019',
    order: 30,
    isVisible: true,
  },
  {
    slug: 'maison-oat',
    label: 'MAISON OAT',
    name: 'MAISON OAT',
    nameKo: '메종 오트',
    tagline: '천연 소재를 그대로 두는 일',
    story: [
      '리넨과 코튼처럼 손이 많이 가는 소재를 다룹니다. 가공을 줄이는 대신 관리법을 자세히 적습니다.',
      '구김과 색 바램을 결함으로 보지 않고, 시간이 지나며 생기는 변화로 봅니다.',
    ],
    origin: '대한민국',
    since: '2021',
    order: 40,
    isVisible: true,
  },
  {
    slug: 'stitch-lab',
    label: 'STITCH LAB',
    name: 'STITCH LAB',
    nameKo: '스티치랩',
    tagline: '봉제선에서 시작하는 설계',
    story: [
      '데님과 슈즈를 만드는 브랜드입니다. 하중이 걸리는 자리마다 스티치 밀도를 다르게 둡니다.',
      '몇 번을 세탁해도 형태가 남는지를 기준으로 원단을 고릅니다.',
    ],
    origin: '대한민국',
    since: '2018',
    order: 50,
    isVisible: true,
  },
];

function byOrder(list: Brand[]): Brand[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/** 브랜드 필터 칩에 노출되는 브랜드 (order 오름차순). */
export function getVisibleBrands(): Brand[] {
  return byOrder(brands.filter((brand) => brand.isVisible));
}

export function getAllBrands(): Brand[] {
  return byOrder(brands);
}

export function getBrand(slug: string): Brand | undefined {
  return brands.find((brand) => brand.slug === slug);
}

/** 화면에 표시할 브랜드 글자. */
export function getBrandLabel(slug: string): string {
  return getBrand(slug)?.label ?? slug;
}

/** 메타데이터·JSON-LD·이미지 alt 에 쓰는 정식 명칭. */
export function getBrandName(slug: string): string {
  return getBrand(slug)?.name ?? slug;
}
