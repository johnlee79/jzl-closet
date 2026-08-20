import type { Brand } from '@/lib/brands';

/**
 * 브랜드 표시 — 로고가 있으면 로고, 없으면 브랜드명.
 *
 * ★ 기본은 글자입니다.
 *   브랜드 로고는 각 브랜드사의 등록상표라 아무거나 쓸 수 없습니다.
 *   운영자가 쓸 수 있는 로고만 골라 올리면 그 브랜드만 로고로 바뀝니다.
 *
 * ★ 한 줄에 로고와 글자가 섞여도 어색하지 않도록 높이를 맞춥니다.
 *   로고는 세로로 늘어나지 않고, 정해진 높이 안에서 가로 비율을 지킵니다.
 *   (h-… + w-auto + object-contain — 세 가지가 같이 있어야 안 찌그러집니다)
 *
 * ★ 투명 배경은 그대로 살립니다.
 *   업로드는 webp 로 바꾸는데 webp 는 투명도를 지원하고, sharp 도 알파 채널을
 *   그대로 넘깁니다. 배경을 칠하지 않으므로 어두운 로고든 밝은 로고든 종이색 위에 얹힙니다.
 */

type Size = 'card' | 'sm' | 'lg';

/**
 * 로고 높이 — 그 자리의 글자 높이에 맞춘 값입니다.
 * ★ 글자보다 크게 잡으면 그만큼 아래 내용이 밀립니다. 상품 카드에서는
 *   상품명이 밀려 목록의 줄이 어긋납니다.
 */
const LOGO_HEIGHT: Record<Size, string> = {
  card: 'h-[20px]', // 상품 카드 브랜드 줄(25px) 안에 들어가는 높이
  sm: 'h-[18px] md:h-[20px]',
  lg: 'h-[34px] md:h-[42px]',
};

/**
 * 가로 상한 — 지나치게 납작하고 긴 로고가 줄을 밀어내지 않게 합니다.
 * ★ 상한에 걸려도 object-contain 이라 비율은 그대로입니다. 찌그러지지 않습니다.
 */
const LOGO_MAX_WIDTH: Record<Size, string> = {
  card: 'max-w-[130px]',
  sm: 'max-w-[140px] md:max-w-[180px]',
  lg: 'max-w-[220px] md:max-w-[280px]',
};

/**
 * 글자로 보여 줄 때의 모양.
 * ★ card 는 비워 둡니다. 상품 카드의 브랜드 줄은 이미 제 크기·자간·색을 갖고 있고,
 *   로고를 붙이는 김에 글자 모양까지 바꾸면 로고를 안 올린 브랜드 전부가 달라집니다.
 *   비워 두면 부모의 글자 모양을 그대로 물려받습니다.
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
        className={`${LOGO_HEIGHT[size]} ${LOGO_MAX_WIDTH[size]} w-auto object-contain ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <span className={`${TEXT_CLASS[size]} ${className}`.trim()}>{brand.label}</span>;
}
