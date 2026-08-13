'use client';

import { useState } from 'react';
import SafeImage from '@/components/SafeImage';

type ProductGalleryProps = {
  images: string[];
  productName: string;
  brand: string;
};

export default function ProductGallery({
  images,
  productName,
  brand,
}: ProductGalleryProps) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  return (
    <div className="flex flex-col-reverse gap-4 md:flex-row md:gap-6">
      <ul className="flex shrink-0 gap-3 overflow-x-auto md:w-[84px] md:flex-col md:overflow-visible">
        {images.map((src, index) => (
          <li key={src} className="shrink-0">
            <button
              type="button"
              onClick={() => setActive(index)}
              aria-label={`${productName} ${index + 1}번째 이미지 보기`}
              aria-current={index === active}
              className={`block h-[100px] w-[76px] overflow-hidden border bg-stone transition-colors duration-200 md:h-[110px] md:w-full ${
                index === active ? 'border-ink' : 'border-transparent'
              }`}
            >
              <SafeImage
                src={src}
                alt={`${brand} ${productName} 썸네일 ${index + 1}`}
                label={productName}
                width={152}
                height={200}
              />
            </button>
          </li>
        ))}
      </ul>

      <div className="aspect-[4/5] w-full overflow-hidden bg-stone">
        <SafeImage
          src={current}
          alt={`${brand} ${productName} 상세 이미지 ${active + 1}`}
          label={productName}
          width={900}
          height={1125}
          priority
        />
      </div>
    </div>
  );
}
