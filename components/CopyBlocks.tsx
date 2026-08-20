import type { ResolvedBlock } from '@/lib/copy';

/**
 * 관리자에서 고친 문구를 그립니다.
 * 소제목은 h2(또는 지정한 단계), 본문은 정리된 HTML 로 나갑니다.
 *
 * ★ html 은 lib/copy.ts 의 resolveCopy 를 거친 값만 넘기세요.
 *   허용한 태그(b·br·a·p·span·em) 외에는 이미 제거된 상태입니다.
 */
type CopyBlocksProps = {
  blocks: ResolvedBlock[];
  /** 소제목 단계. 기본 h2 */
  headingLevel?: 2 | 3;
  /** 소제목에 붙일 클래스 */
  headingClassName?: string;
  bodyClassName?: string;
  className?: string;
};

export default function CopyBlocks({
  blocks,
  headingLevel = 2,
  headingClassName = 'border-t border-stone pt-6 font-serif text-[19px] text-ink md:text-[22px]',
  bodyClassName = 'detail-body mt-4 text-[17px] leading-[2] text-ink md:text-[18px]',
  className = 'flex max-w-[860px] flex-col gap-12',
}: CopyBlocksProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <section key={`${block.heading}-${index}`}>
          {block.heading ? (
            <Heading className={headingClassName}>{block.heading}</Heading>
          ) : null}
          {block.html ? (
            <div
              className={bodyClassName}
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          ) : null}
        </section>
      ))}
    </div>
  );
}
