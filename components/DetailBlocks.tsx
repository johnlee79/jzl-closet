import SafeImage from '@/components/SafeImage';
import { isHtmlBody, sanitizeRichText } from '@/lib/product-utils';
import type { DetailBlock } from '@/lib/types';

type DetailBlocksProps = {
  blocks: DetailBlock[];
  productName: string;
};

export default function DetailBlocks({ blocks, productName }: DetailBlocksProps) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-16 md:gap-24">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'image':
            return (
              <figure key={`image-${index}`} className="w-full">
                {/* ★ 틀을 씌우지 않습니다.
                    상세설명 이미지는 세로로 아주 긴 경우가 많아
                    4:5 틀에 넣으면 아래쪽이 통째로 잘립니다. */}
                <div className="w-full overflow-hidden bg-stone">
                  <SafeImage
                    src={block.src}
                    alt={block.alt}
                    label={productName}
                    // 원본 크기를 아는 이미지만 자리를 미리 잡습니다.
                    width={block.width ?? 0}
                    height={block.height ?? 0}
                    fit="natural"
                  />
                </div>
                {block.caption ? (
                  <figcaption className="mt-4 text-[14px] leading-relaxed text-muted">
                    {block.caption}
                  </figcaption>
                ) : null}
              </figure>
            );

          case 'text':
            return (
              <div key={`text-${index}`} className="w-full">
                {block.heading ? (
                  <h3 className="font-serif text-[22px] leading-snug text-ink md:text-[26px]">
                    {block.heading}
                  </h3>
                ) : null}
                {/* 관리자 편집기에서 굵게·링크·정렬을 쓰면 HTML 로 저장됩니다.
                    허용 태그만 남기고 정리한 뒤 출력하므로 서버 HTML 에 본문이 그대로 실립니다. */}
                {isHtmlBody(block.body) ? (
                  <div
                    className="detail-body mt-4 text-[17px] leading-[2] text-ink md:text-[18px]"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(block.body) }}
                  />
                ) : (
                  <p className="mt-4 whitespace-pre-line text-[17px] leading-[2] text-ink md:text-[18px]">
                    {block.body}
                  </p>
                )}
              </div>
            );

          case 'spec':
            return (
              <div key={`spec-${index}`} className="w-full">
                <h3 className="font-serif text-[22px] leading-snug text-ink md:text-[26px]">
                  제품 정보
                </h3>
                <dl className="mt-6 border-t border-stone">
                  {block.rows.map((row) => (
                    <div
                      key={row.label}
                      className="flex flex-col gap-1 border-b border-stone py-4 md:flex-row md:gap-8"
                    >
                      <dt className="w-full text-[14px] tracking-[0.14em] text-muted md:w-40 md:shrink-0">
                        {row.label}
                      </dt>
                      <dd className="text-[17px] leading-relaxed text-ink">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
