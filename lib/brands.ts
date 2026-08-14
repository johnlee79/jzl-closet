/**
 * ============================================================
 * 브랜드 — 타입 · 폴백 데이터 · 순수 헬퍼
 * ============================================================
 *
 * ★ 1-B 부터 브랜드는 DB(brands 테이블)에서 읽습니다.
 *   관리자 > 브랜드 관리 에서 고치세요.
 *
 * 이 파일은 타입과 폴백 데이터만 담습니다.
 * DB 를 실제로 읽는 코드는 lib/taxonomy.ts (서버 전용) 에 있습니다.
 * 클라이언트 컴포넌트도 가져다 쓰므로 'server-only' 를 넣지 않습니다.
 */

export type Brand = {
  slug: string; // URL 전용 — 등록 후 바꾸지 않습니다
  label: string; // 화면 출력용
  name: string; // 메타데이터·JSON-LD 전용 정식 명칭
  nameKo: string;
  tagline: string;
  /** 문단 배열. DB 에는 빈 줄로 나뉜 하나의 text 로 저장됩니다. */
  story: string[];
  origin: string;
  since: string;
  /** 대표 이미지. 비어 있으면 /images/brands/{slug}.jpg 를 씁니다. */
  imageUrl: string;
  order: number;
  isVisible: boolean;
  isFeatured: boolean;
};

/** DB 의 story(text) → 문단 배열. 빈 줄이 문단 구분입니다. */
export function storyToParagraphs(story: string | null | undefined): string[] {
  if (!story) return [];
  return story
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** 문단 배열 → DB 에 저장할 text */
export function paragraphsToStory(paragraphs: string[]): string {
  return paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean).join('\n\n');
}

/** 대표 이미지 경로. 등록된 값이 없으면 규칙 경로를 씁니다. */
export function brandImage(brand: Pick<Brand, 'slug' | 'imageUrl'>): string {
  return brand.imageUrl || `/images/brands/${brand.slug}.jpg`;
}

/* ------------------------------------------------------------------
 * 폴백 데이터 — DB 가 비어 있을 때만 쓰입니다.
 * ------------------------------------------------------------------ */

export const FALLBACK_BRANDS: Brand[] = [
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
    imageUrl: '/images/brands/jzl-closet.jpg',
    order: 10,
    isVisible: true,
    isFeatured: true,
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
    imageUrl: '/images/brands/jzl-atelier.jpg',
    order: 20,
    isVisible: true,
    isFeatured: false,
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
    imageUrl: '/images/brands/nord-blanc.jpg',
    order: 30,
    isVisible: true,
    isFeatured: false,
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
    imageUrl: '/images/brands/maison-oat.jpg',
    order: 40,
    isVisible: true,
    isFeatured: false,
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
    imageUrl: '/images/brands/stitch-lab.jpg',
    order: 50,
    isVisible: true,
    isFeatured: false,
  },
];

/* ------------------------------------------------------------------
 * 순수 헬퍼 — 목록을 넘겨 받아 계산만 합니다.
 * ------------------------------------------------------------------ */

function byOrder(list: Brand[]): Brand[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/** 브랜드 필터 칩·목록에 노출되는 브랜드 (order 오름차순). */
export function visibleBrands(list: Brand[]): Brand[] {
  return byOrder(list.filter((brand) => brand.isVisible));
}

export function sortedBrands(list: Brand[]): Brand[] {
  return byOrder(list);
}

export function findBrand(list: Brand[], slug: string | null): Brand | undefined {
  if (!slug) return undefined;
  return list.find((brand) => brand.slug === slug);
}

/** 화면에 표시할 브랜드 글자. */
export function brandLabel(list: Brand[], slug: string | null): string {
  if (!slug) return '';
  return findBrand(list, slug)?.label ?? slug;
}

/** 메타데이터·JSON-LD·이미지 alt 에 쓰는 정식 명칭. */
export function brandName(list: Brand[], slug: string | null): string {
  if (!slug) return '';
  return findBrand(list, slug)?.name ?? slug;
}
