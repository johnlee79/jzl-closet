import type { Brand } from '@/lib/brands';

/**
 * 브랜드 표시 — 로고가 있으면 로고, 없으면 브랜드명.
 *
 * ★ 기본은 글자입니다.
 *   브랜드 로고는 각 브랜드사의 등록상표라 아무거나 쓸 수 없습니다.
 *   운영자가 쓸 수 있는 로고만 골라 올리면 그 브랜드만 로고로 바뀝니다.
 *
 * ★★ 크기는 이미지에 구워져 있습니다. 여기서 또 맞추지 않습니다.
 *   로고 파일은 전부 800×360 투명 캔버스 안에 "면적 기준" 으로 배치되어 저장됩니다.
 *   (lib/brand-logo.mjs · scripts/normalize-brand-logos.mjs)
 *
 *   예전에는 높이만 맞췄습니다. 원본이 이미 세로 400~420px 로 통일돼 있었기 때문에
 *   높이를 또 맞춰 봐야 가로 비율 차이만 그대로 남았습니다.
 *     꼼데가르송 9.25:1  →  가로로 길게 뻗어 크게 보임
 *     아크테릭스 1.64:1  →  새 그림과 글자가 위아래로 쌓여 글자가 작게 보임
 *   사람 눈은 높이가 아니라 차지하는 면적으로 크기를 느낍니다.
 *
 *   그래서 이 컴포넌트가 할 일은 하나뿐입니다 —
 *   ★ 800:360 비율의 상자에 object-contain 으로 넣기.
 *   비율이 다른 상자에 넣으면 위아래나 좌우에 여백이 생겨 균일화가 무너집니다.
 *   브랜드별 예외 크기를 다시 주지 마세요. 그 순간 다시 어긋납니다.
 *
 * ★ 글자로 나올 때는 폭을 고정하지 않습니다.
 *   "COMME des GARÇONS" 같은 긴 이름이 좁은 상자에 눌리면 읽을 수 없습니다.
 *   대신 높이는 로고와 같게 맞춥니다. 그래야 로고 브랜드와 글자 브랜드가
 *   한 줄에 섞여도 줄이 어긋나지 않습니다.
 */

type Size = 'card' | 'sm' | 'lg';

/**
 * 로고 상자 — 전부 800:360 (20:9) 입니다.
 * ★ 높이는 9의 배수, 가로는 그 20/9 배입니다. 비율이 틀어지지 않게 짝으로 적어 둡니다.
 *     36 → 80 · 45 → 100 · 90 → 200 · 108 → 240
 */
const LOGO_BOX: Record<Size, string> = {
  // 상품 카드·상품 상세의 브랜드 줄
  card: 'h-[45px] w-[100px]',
  // 상품 목록의 브랜드 필터 칩 · 메인 BRANDS 줄
  sm: 'h-[36px] w-[80px]',
  // 브랜드 소개 상단 · 브랜드 목록
  lg: 'h-[90px] w-[200px] md:h-[108px] md:w-[240px]',
};

/** 글자로 나올 때 — 높이만 로고와 같게 맞추고 폭은 글자에 맡깁니다. */
const TEXT_BOX: Record<Size, string> = {
  card: 'h-[45px]',
  sm: 'h-[36px]',
  lg: 'h-[90px] md:h-[108px]',
};

/**
 * 글자 모양.
 * ★ card 는 비워 둡니다. 상품 카드의 브랜드 줄은 이미 제 크기·자간·색을 갖고 있고,
 *   여기서 또 정하면 로고를 안 올린 브랜드만 달라 보입니다.
 */
const TEXT_CLASS: Record<Size, string> = {
  card: '',
  sm: 'font-display leading-none tracking-[0.18em] text-[16px] md:text-[17px]',
  lg: 'font-display leading-none tracking-[0.18em] text-[28px] md:text-[34px]',
};

export default function BrandMark({
  brand,
  size = 'sm',
  className = '',
}: {
  brand: Pick<Brand, 'label' | 'name' | 'logoUrl'>;
  size?: Size;
  className?: string;
}) {
  if (brand.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logoUrl}
        // ★ alt 는 정식 명칭입니다. 로고를 못 읽는 손님과 검색엔진에게는
        //   이 글자가 브랜드명 그 자체입니다.
        alt={brand.name || brand.label}
        /*
         * ★ object-contain 이어야 합니다. cover 로 두면 캔버스가 잘려
         *   가로로 긴 로고의 양끝이 사라집니다.
         * ★ 배경을 칠하지 않습니다. 캔버스가 투명이라 어떤 바탕에도 얹힙니다.
         */
        className={`${LOGO_BOX[size]} shrink-0 object-contain ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap ${TEXT_BOX[size]} ${TEXT_CLASS[size]} ${className}`.trim()}
    >
      {brand.label}
    </span>
  );
}
