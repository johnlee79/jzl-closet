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
 *
 * ★ 글자는 Cormorant Garamond(영문 디스플레이)에 자간을 넓게 줍니다.
 *   하이엔드 편집숍의 절제된 인상을 노린 것으로, 네모 버튼으로 꽉 채우지 않습니다.
 */

type Size = 'sm' | 'lg';

/** 로고 높이 — 글자 크기와 눈높이를 맞춘 값입니다. */
const LOGO_HEIGHT: Record<Size, string> = {
  sm: 'h-[18px] md:h-[20px]',
  lg: 'h-[34px] md:h-[42px]',
};

const TEXT_CLASS: Record<Size, string> = {
  sm: 'text-[15px] md:text-[16px]',
  lg: 'text-[26px] md:text-[32px]',
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
        alt={brand.name || brand.label}
        // ★ w-auto 로 두어야 가로 비율이 살아 있습니다. 높이만 맞춥니다.
        //   흰 배경 이미지가 올라와도 어색하지 않도록 배경을 칠하지 않습니다.
        className={`${LOGO_HEIGHT[size]} w-auto max-w-[140px] object-contain md:max-w-[180px] ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span
      className={`font-display leading-none tracking-[0.18em] ${TEXT_CLASS[size]} ${className}`}
    >
      {brand.label}
    </span>
  );
}
